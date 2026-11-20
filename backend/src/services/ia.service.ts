import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/http";
import { decifrar } from "./cripto";

/**
 * Serviço de Inteligência Artificial — diagnóstico guiado (Seção 9 do Documento Técnico).
 *
 * Toda chamada à IA passa por aqui. O front-end nunca fala com a API da Anthropic diretamente
 * (a chave fica só no servidor) e nenhum dado pessoal do cliente é enviado (RNF04).
 */

// ---------- Formato da resposta estruturada da IA ----------

export const respostaIASchema = z.object({
  mensagem: z.string(),
  causasPossiveis: z
    .array(
      z.object({
        causa: z.string(),
        probabilidade: z.enum(["alta", "media", "baixa"]),
        justificativa: z.string().optional().default(""),
      }),
    )
    .default([]),
  proximaEtapa: z
    .object({
      titulo: z.string(),
      procedimento: z.string(),
      instrumento: z.string().optional().default(""),
      pontoMedicao: z.string().optional().default(""),
      resultadoEsperado: z.string().optional().default(""),
    })
    .nullable()
    .default(null),
  interpretacaoUltimoResultado: z.string().nullable().default(null),
  avaliacaoUltimaMedicao: z
    .enum(["DENTRO_DO_ESPERADO", "ABAIXO_DO_ESPERADO", "ACIMA_DO_ESPERADO", "INDEFINIDO"])
    .nullable()
    .default(null),
  diagnosticoConcluido: z.boolean().default(false),
  diagnosticoSugerido: z.string().nullable().default(null),
  alertasSeguranca: z.array(z.string()).default([]),
});

export type RespostaIA = z.infer<typeof respostaIASchema>;

export interface ContextoDiagnostico {
  /** Nome da assistência técnica (não é dado do cliente). */
  nomeEmpresa?: string;
  equipamento: { tipo: string; marca: string; modelo: string };
  defeitoRelatado: string;
  sintoma: string;
  historicoEquipamento: string[]; // diagnósticos anteriores do mesmo aparelho
  baseConhecimento: { titulo: string; conteudo: string }[];
}

export interface TurnoConversa {
  autor: "TECNICO" | "IA";
  texto: string;
}

/** Chave e modelo usados numa consulta. */
export interface ConfigIA {
  apiKey: string;
  modelo: string;
  /** "empresa" = chave cadastrada em Configurações; "servidor" = ANTHROPIC_API_KEY do ambiente. */
  origem: "empresa" | "servidor";
}

/** Função que efetivamente consulta o modelo. Pode ser substituída nos testes. */
export type ClienteIA = (system: string, mensagens: Anthropic.MessageParam[], config: ConfigIA) => Promise<unknown>;

// ---------- Privacidade (RNF04 / LGPD) ----------

/** Remove CPF, e-mail e telefone que o técnico possa ter digitado por engano. */
export function sanitizarTexto(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]")
    .replace(/(\(?\b\d{2}\)?\s?)?9?\d{4}-?\d{4}\b/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[telefone removido]" : m));
}

// ---------- Prompt ----------

export function montarSystemPrompt(nomeEmpresa = "Inforcell"): string {
  return `Você é o assistente de diagnóstico da ${nomeEmpresa.trim() || "Inforcell"}, uma assistência técnica de celulares e computadores.
Seu papel é conduzir um técnico de eletrônica por um diagnóstico estruturado, um teste de cada vez, até a causa provável do defeito.

Regras:
- Responda sempre em português do Brasil, de forma objetiva e técnica.
- Na primeira resposta, liste de 3 a 5 causas possíveis ordenadas da mais para a menos provável e proponha o PRIMEIRO teste.
- Proponha apenas UM teste por vez. Comece pelos testes mais simples, baratos e não destrutivos (inspeção visual, carregador, cabo, bateria, consumo na fonte) antes de testes de placa.
- Para cada teste, diga o instrumento (multímetro, fonte de bancada, câmera térmica, etc.), o ponto ou linha a medir e o resultado esperado com valores de referência quando souber.
- Quando o técnico informar um resultado, interprete-o, avalie a última medição (dentro, abaixo ou acima do esperado) e reordene as causas possíveis.
- Se não tiver certeza de um valor de referência para um modelo específico, diga isso claramente em vez de inventar.
- Inclua alertas de segurança quando houver risco (bateria estufada, alta tensão em fontes, ESD, curto).
- Marque diagnosticoConcluido=true somente quando os testes já apontarem uma causa com boa confiança, e descreva-a em diagnosticoSugerido.
- Você apoia a decisão do técnico; a decisão final é dele.
- Use sempre a ferramenta registrar_orientacao para responder.`;
}

export const SYSTEM_PROMPT = montarSystemPrompt();

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_orientacao",
  description: "Registra a orientação de diagnóstico para o técnico em formato estruturado.",
  input_schema: {
    type: "object",
    properties: {
      mensagem: { type: "string", description: "Texto curto para o técnico, explicando a orientação." },
      causasPossiveis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            causa: { type: "string" },
            probabilidade: { type: "string", enum: ["alta", "media", "baixa"] },
            justificativa: { type: "string" },
          },
          required: ["causa", "probabilidade"],
        },
      },
      proximaEtapa: {
        type: ["object", "null"],
        properties: {
          titulo: { type: "string" },
          procedimento: { type: "string" },
          instrumento: { type: "string" },
          pontoMedicao: { type: "string" },
          resultadoEsperado: { type: "string" },
        },
        required: ["titulo", "procedimento"],
      },
      interpretacaoUltimoResultado: { type: ["string", "null"] },
      avaliacaoUltimaMedicao: {
        type: ["string", "null"],
        enum: ["DENTRO_DO_ESPERADO", "ABAIXO_DO_ESPERADO", "ACIMA_DO_ESPERADO", "INDEFINIDO", null],
      },
      diagnosticoConcluido: { type: "boolean" },
      diagnosticoSugerido: { type: ["string", "null"] },
      alertasSeguranca: { type: "array", items: { type: "string" } },
    },
    required: ["mensagem", "causasPossiveis", "proximaEtapa", "diagnosticoConcluido"],
  },
};

export function montarContextoInicial(ctx: ContextoDiagnostico): string {
  const partes = [
    `Equipamento: ${ctx.equipamento.tipo} — ${ctx.equipamento.marca} ${ctx.equipamento.modelo}`,
    `Defeito relatado pelo cliente: ${sanitizarTexto(ctx.defeitoRelatado)}`,
    `Sintoma observado pelo técnico: ${sanitizarTexto(ctx.sintoma)}`,
  ];
  if (ctx.historicoEquipamento.length) {
    partes.push("Diagnósticos anteriores deste mesmo aparelho:\n- " + ctx.historicoEquipamento.map(sanitizarTexto).join("\n- "));
  }
  if (ctx.baseConhecimento.length) {
    partes.push(
      "Trechos da base de conhecimento da Inforcell que podem ajudar:\n" +
        ctx.baseConhecimento.map((a) => `### ${a.titulo}\n${a.conteudo}`).join("\n\n"),
    );
  }
  partes.push("Inicie o diagnóstico guiado.");
  return partes.join("\n\n");
}

/** Monta a conversa no formato da API (alternando user/assistant). */
export function montarMensagens(ctx: ContextoDiagnostico, turnos: TurnoConversa[]): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [{ role: "user", content: montarContextoInicial(ctx) }];
  for (const t of turnos) {
    const role = t.autor === "TECNICO" ? "user" : "assistant";
    const texto = t.autor === "TECNICO" ? sanitizarTexto(t.texto) : t.texto;
    const ultima = msgs[msgs.length - 1];
    if (ultima.role === role) ultima.content = `${ultima.content}\n\n${texto}`;
    else msgs.push({ role, content: texto });
  }
  // a conversa precisa terminar com o técnico
  if (msgs[msgs.length - 1].role === "assistant") {
    msgs.push({ role: "user", content: "Continue a partir da última orientação." });
  }
  return msgs;
}

/** Texto salvo como mensagem da IA (também usado para reconstruir o histórico). */
export function resumoParaHistorico(r: RespostaIA): string {
  const linhas = [r.mensagem];
  if (r.interpretacaoUltimoResultado) linhas.push(`Interpretação: ${r.interpretacaoUltimoResultado}`);
  if (r.causasPossiveis.length) {
    linhas.push("Causas possíveis: " + r.causasPossiveis.map((c) => `${c.causa} (${c.probabilidade})`).join("; "));
  }
  if (r.proximaEtapa) {
    const e = r.proximaEtapa;
    linhas.push(
      `Próxima etapa — ${e.titulo}: ${e.procedimento}` +
        (e.instrumento ? ` | Instrumento: ${e.instrumento}` : "") +
        (e.pontoMedicao ? ` | Ponto: ${e.pontoMedicao}` : "") +
        (e.resultadoEsperado ? ` | Esperado: ${e.resultadoEsperado}` : ""),
    );
  }
  if (r.diagnosticoConcluido && r.diagnosticoSugerido) linhas.push(`Diagnóstico sugerido: ${r.diagnosticoSugerido}`);
  if (r.alertasSeguranca.length) linhas.push("Atenção: " + r.alertasSeguranca.join(" "));
  return linhas.join("\n");
}

// ---------- Chave e modelo de cada empresa ----------

/** Modelos sugeridos na tela de Configurações (a lista real vem da API, quando há chave). */
export const MODELOS_SUGERIDOS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"];

/**
 * Descobre qual chave usar: a da empresa (Configurações) tem prioridade; sem ela, a do servidor.
 * Devolve null quando não há nenhuma chave utilizável.
 */
export async function configIADaEmpresa(empresaId: number): Promise<ConfigIA | null> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { iaChaveCifrada: true, iaModelo: true } });
  const modelo = empresa?.iaModelo || env.ANTHROPIC_MODEL;
  const chaveEmpresa = empresa?.iaChaveCifrada ? decifrar(empresa.iaChaveCifrada) : null;
  if (chaveEmpresa) return { apiKey: chaveEmpresa, modelo, origem: "empresa" };
  if (env.ANTHROPIC_API_KEY) return { apiKey: env.ANTHROPIC_API_KEY, modelo, origem: "servidor" };
  return null;
}

// ---------- Cliente real (API da Anthropic) ----------

const clientes = new Map<string, Anthropic>();

/** Um cliente por chave, reaproveitado entre as consultas. */
export function clienteDaChave(apiKey: string): Anthropic {
  let c = clientes.get(apiKey);
  if (!c) {
    if (clientes.size >= 50) clientes.clear(); // evita acumular chaves trocadas
    c = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
    clientes.set(apiKey, c);
  }
  return c;
}

/** Converte erros da Anthropic em mensagens que o técnico ou o administrador entendem. */
export function traduzirErroIA(e: unknown, modelo: string): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.AuthenticationError) {
    return new AppError(503, "A chave de IA foi recusada pela Anthropic (inválida ou revogada). O administrador pode trocá-la em Configurações.");
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return new AppError(503, "A chave de IA não tem permissão para usar este recurso. Confira a conta em console.anthropic.com.");
  }
  if (e instanceof Anthropic.NotFoundError) {
    return new AppError(503, `O modelo "${modelo}" não foi encontrado para esta chave. Escolha outro em Configurações.`);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AppError(429, "Limite de uso da IA atingido. Aguarde um minuto e tente de novo.");
  }
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) {
    return new AppError(503, "A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com > Billing.");
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new AppError(502, "Não foi possível falar com o serviço de IA (sem resposta). Tente novamente em instantes.");
  }
  if (e instanceof Anthropic.APIError) {
    console.error("[IA] erro da API:", e.status, e.message);
    return e.status === 529
      ? new AppError(503, "O serviço de IA está sobrecarregado no momento. Tente novamente em instantes.")
      : new AppError(502, "Falha ao consultar o serviço de IA. Tente novamente em instantes.");
  }
  console.error("[IA] erro inesperado:", e);
  return new AppError(502, "Falha ao consultar o serviço de IA. Tente novamente em instantes.");
}

const clienteAnthropic: ClienteIA = async (system, mensagens, config) => {
  try {
    const resp = await clienteDaChave(config.apiKey).messages.create({
      model: config.modelo,
      max_tokens: 2048,
      system,
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: FERRAMENTA.name },
      messages: mensagens,
    });
    const bloco = resp.content.find((b) => b.type === "tool_use");
    if (!bloco || bloco.type !== "tool_use") throw new AppError(502, "A IA não retornou uma orientação estruturada.");
    return bloco.input;
  } catch (e) {
    throw traduzirErroIA(e, config.modelo);
  }
};

/**
 * Confere se a chave funciona e se o modelo existe, sem gastar créditos (consulta a lista de
 * modelos). Devolve o nome de exibição do modelo e os modelos disponíveis para a chave.
 */
export async function testarChave(apiKey: string, modelo: string): Promise<{ modelo: string; nomeModelo: string; modelos: string[] }> {
  const c = clienteDaChave(apiKey);
  try {
    const info = await c.models.retrieve(modelo);
    const modelos: string[] = [];
    for await (const m of c.models.list({ limit: 100 })) {
      if (m.lifecycle !== "retired") modelos.push(m.id);
    }
    return { modelo: info.id, nomeModelo: info.display_name, modelos };
  } catch (e) {
    throw traduzirErroIA(e, modelo);
  }
}

let clienteAtual: ClienteIA = clienteAnthropic;

/** Permite injetar um cliente falso (testes ou modo demonstração). */
export function definirClienteIA(c: ClienteIA | null) {
  clienteAtual = c ?? clienteAnthropic;
}

/** True quando a IA pode ser usada pela empresa (ou quando um cliente simulado está ativo). */
export async function iaDisponivel(empresaId: number): Promise<boolean> {
  return clienteAtual !== clienteAnthropic || (await configIADaEmpresa(empresaId)) !== null;
}

export const MENSAGEM_IA_NAO_CONFIGURADA =
  "O assistente de IA não está configurado. O administrador da empresa pode cadastrar a chave da Anthropic em Configurações.";

export async function consultarIA(ctx: ContextoDiagnostico, turnos: TurnoConversa[], empresaId?: number): Promise<RespostaIA> {
  let config: ConfigIA = { apiKey: "", modelo: env.ANTHROPIC_MODEL, origem: "servidor" };
  if (clienteAtual === clienteAnthropic) {
    const encontrada = empresaId ? await configIADaEmpresa(empresaId) : null;
    if (!encontrada && !env.ANTHROPIC_API_KEY) throw new AppError(503, MENSAGEM_IA_NAO_CONFIGURADA);
    config = encontrada ?? { apiKey: env.ANTHROPIC_API_KEY as string, modelo: env.ANTHROPIC_MODEL, origem: "servidor" };
  }
  const bruto = await clienteAtual(montarSystemPrompt(ctx.nomeEmpresa), montarMensagens(ctx, turnos), config);
  const r = respostaIASchema.safeParse(bruto);
  if (!r.success) {
    console.error("[IA] resposta fora do formato:", r.error.issues);
    throw new AppError(502, "A resposta da IA veio em formato inesperado. Tente novamente.");
  }
  return r.data;
}
