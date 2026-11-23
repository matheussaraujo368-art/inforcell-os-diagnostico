import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/http";
import { decifrar } from "./cripto";
import type { Ferramentas, PassoAgente } from "./ferramentasAgente";

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
  /** Preenchido ao concluir: itens e valores baseados nos reparos anteriores da assistência. */
  sugestaoOrcamento: z
    .object({
      itens: z
        .array(
          z.object({
            descricao: z.string(),
            tipo: z.enum(["peca", "servico"]).catch("servico"),
            valor: z.number().nullable().catch(null),
          }),
        )
        .default([]),
      valorTotal: z.number().nullable().catch(null),
      prazoDias: z.number().nullable().catch(null),
      observacao: z.string().nullable().catch(null),
    })
    .nullable()
    .catch(null)
    .default(null),
  /** Texto simples para o cliente (WhatsApp). Usa {cliente} no lugar do nome, preenchido só no navegador. */
  mensagemCliente: z.string().nullable().catch(null).default(null),
  /** O que a IA viu na foto enviada pelo técnico, quando houver. */
  analiseImagem: z.string().nullable().catch(null).default(null),
  /** Consultas que o agente fez antes de responder (preenchido pelo servidor, não pela IA). */
  passosAgente: z.array(z.object({ ferramenta: z.string(), resumo: z.string() })).default([]),
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

/** Conhecimento de bancada usado pelo diagnóstico e pelo assistente de bancada. */
export const CONHECIMENTO_CELULAR = `Conhecimento esperado em celulares (use quando o aparelho for celular ou tablet):
- Roteiro de bancada: inspeção visual e de oxidação, teste com bateria conhecida, consumo na fonte de bancada no conector da bateria (≈3,8–4,2 V), comportamento do consumo (curto imediato, zero ao pressionar Power, sobe e cai em ciclo/boot loop, trava num valor fixo).
- Linhas e blocos principais: VBAT/VDD_MAIN (PP_VDD_MAIN no iPhone; VPH_PWR/VSYS no Android), PMIC, circuito de carga (Tristar/Hydra e IC de carga no iPhone; PMI/IC de carga no Android), linhas de backlight e display, áudio, baseband/RF.
- Medição em modo diodo (queda de tensão) e resistência para comparar com placa boa; injeção de tensão baixa e câmera térmica ou álcool isopropílico para achar curto.
- Defeitos comuns: flex de Power/volume, conector de carga sujo ou oxidado, bateria, tela/touch, câmera, Face ID/True Tone e peças pareadas (serialização) no iPhone, reboot por sensor ou flex, sem sinal, sem áudio, aquecimento.
- Resolução: limpeza de oxidação (ultrassom e álcool isopropílico), troca de flex/conector/bateria/tela, reflow ou reballing com cuidado com underfill, jumper em trilha rompida. Indique quando o reparo é de alto risco ou inviável economicamente.
- Peças paralelas versus originais e avisos ao cliente quando a peça pode gerar mensagem de "peça desconhecida".
`;

export function montarSystemPrompt(nomeEmpresa = "Inforcell"): string {
  return `Você é o agente de diagnóstico da ${nomeEmpresa.trim() || "Inforcell"}, uma assistência técnica de eletrônicos com foco principal em CELULARES (iPhone e Android). Também atende tablets, notebooks e computadores.
Seu papel é conduzir um técnico de eletrônica por um diagnóstico estruturado, um teste de cada vez, até a causa provável do defeito e a resolução.

${CONHECIMENTO_CELULAR}
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

Você é um agente: antes de responder, pode usar ferramentas de consulta ao sistema da assistência.
- Na primeira resposta, consulte buscar_casos_semelhantes e buscar_base_conhecimento para ver os defeitos mais comuns deste modelo nesta assistência e use isso para ordenar as causas.
- Quando o técnico relatar medições, use consultar_medicoes_da_os se precisar comparar com as anteriores.
- Ao concluir o diagnóstico (diagnosticoConcluido=true), consulte consultar_reparos_e_precos e preencha sugestaoOrcamento com itens (peças e serviço). Use só valores vistos nos reparos anteriores; quando não houver referência, deixe o valor null e diga na observação que o preço precisa ser cotado. Nunca invente preços.
- Ao concluir, escreva também mensagemCliente: 2 a 4 frases simples, sem jargão técnico, explicando ao cliente o defeito e o próximo passo (aprovação do orçamento). Comece com "Olá, {cliente}!" e não escreva nomes, telefones nem valores que não estejam no orçamento.
- Se o técnico enviar uma foto, descreva em analiseImagem o que você observa (oxidação, componentes queimados, trincas, conectores danificados) e use isso no raciocínio.
- Use no máximo 3 consultas por resposta e só as necessárias. Não repita uma consulta cujo resultado já está na conversa.
- Termine SEMPRE chamando registrar_orientacao com a orientação final ao técnico.`;
}

export const SYSTEM_PROMPT = montarSystemPrompt();

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_orientacao",
  description: "Registra a orientação final de diagnóstico para o técnico, em formato estruturado. Chame depois das consultas.",
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
      sugestaoOrcamento: {
        type: ["object", "null"],
        description: "Somente ao concluir o diagnóstico.",
        properties: {
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                descricao: { type: "string" },
                tipo: { type: "string", enum: ["peca", "servico"] },
                valor: { type: ["number", "null"], description: "Em reais. null se não houver referência." },
              },
              required: ["descricao", "tipo"],
            },
          },
          valorTotal: { type: ["number", "null"] },
          prazoDias: { type: ["number", "null"] },
          observacao: { type: ["string", "null"] },
        },
        required: ["itens"],
      },
      mensagemCliente: { type: ["string", "null"], description: "Somente ao concluir. Use {cliente} no lugar do nome." },
      analiseImagem: { type: ["string", "null"], description: "O que foi observado na foto enviada, se houver." },
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
  if (r.analiseImagem) linhas.push(`Análise da foto: ${r.analiseImagem}`);
  if (r.diagnosticoConcluido && r.diagnosticoSugerido) linhas.push(`Diagnóstico sugerido: ${r.diagnosticoSugerido}`);
  if (r.sugestaoOrcamento) {
    const o = r.sugestaoOrcamento;
    linhas.push(
      "Orçamento sugerido: " +
        o.itens.map((i) => `${i.descricao}${i.valor !== null ? ` R$ ${i.valor.toFixed(2)}` : " (cotar)"}`).join("; ") +
        (o.valorTotal !== null ? ` | Total R$ ${o.valorTotal.toFixed(2)}` : ""),
    );
  }
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

// ---------- Agente: laço de decisão com ferramentas ----------

/** Bloco de resposta do modelo (só os tipos que o agente usa). */
export type BlocoModelo = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

export interface ChamadaModelo {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  /**
   * "qualquer" = precisa usar alguma ferramenta; "final" = precisa responder com registrar_orientacao;
   * "auto" = decide entre ferramenta e texto (assistente de bancada); "nenhuma" = só texto.
   */
  escolha: "qualquer" | "final" | "auto" | "nenhuma";
}

/** Uma chamada ao modelo. Pode ser substituída nos testes por um modelo simulado. */
export type ModeloIA = (chamada: ChamadaModelo, config: ConfigIA) => Promise<{ content: BlocoModelo[] }>;

/** Limite de idas e voltas por resposta: evita custo e espera excessivos. */
export const MAX_PASSOS_AGENTE = 5;

const modeloAnthropic: ModeloIA = async (chamada, config) => {
  try {
    const resp = await clienteDaChave(config.apiKey).messages.create({
      model: config.modelo,
      max_tokens: 4096,
      system: chamada.system,
      tools: chamada.tools,
      tool_choice:
        chamada.escolha === "final"
          ? { type: "tool", name: FERRAMENTA.name }
          : chamada.escolha === "qualquer"
            ? { type: "any" }
            : chamada.escolha === "auto"
              ? { type: "auto" }
              : { type: "none" },
      messages: chamada.messages,
    });
    const content: BlocoModelo[] = [];
    for (const b of resp.content) {
      if (b.type === "text") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
    return { content };
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

let modeloAtual: ModeloIA = modeloAnthropic;

/** Injeta um modelo simulado que conversa no formato do agente (testes). null volta ao real. */
export function definirModeloIA(m: ModeloIA | null) {
  modeloAtual = m ?? modeloAnthropic;
}

/**
 * Atalho para testes antigos: um cliente que devolve direto a orientação final.
 * Ele é adaptado para o formato do agente (responde sempre com registrar_orientacao).
 */
export function definirClienteIA(c: ClienteIA | null) {
  if (!c) {
    modeloAtual = modeloAnthropic;
    return;
  }
  modeloAtual = async (chamada, config) => ({
    content: [{ type: "tool_use", id: "simulado", name: FERRAMENTA.name, input: await c(chamada.system, chamada.messages, config) }],
  });
}

/** Modelo em uso (real ou simulado) e a configuração de chave, para outros serviços de IA. */
export async function prepararModelo(empresaId: number): Promise<{ modelo: ModeloIA; config: ConfigIA }> {
  if (modeloAtual !== modeloAnthropic) return { modelo: modeloAtual, config: { apiKey: "", modelo: env.ANTHROPIC_MODEL, origem: "servidor" } };
  const config = await configIADaEmpresa(empresaId);
  if (!config) throw new AppError(503, MENSAGEM_IA_NAO_CONFIGURADA);
  return { modelo: modeloAtual, config };
}

/** True quando a IA pode ser usada pela empresa (ou quando um modelo simulado está ativo). */
export async function iaDisponivel(empresaId: number): Promise<boolean> {
  return modeloAtual !== modeloAnthropic || (await configIADaEmpresa(empresaId)) !== null;
}

export const MENSAGEM_IA_NAO_CONFIGURADA =
  "O assistente de IA não está configurado. O administrador da empresa pode cadastrar a chave da Anthropic em Configurações.";

/** Foto enviada pelo técnico junto com a mensagem (não é guardada; vai só nesta consulta). */
export interface ImagemEnviada {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  dados: string; // base64, sem o prefixo data:
}

export interface OpcoesConsulta {
  empresaId?: number;
  ferramentas?: Ferramentas;
  imagem?: ImagemEnviada;
}

/** Coloca a foto na última mensagem do técnico. */
function anexarImagem(msgs: Anthropic.MessageParam[], imagem: ImagemEnviada) {
  const ultima = msgs[msgs.length - 1];
  const textoAtual = typeof ultima.content === "string" ? ultima.content : "";
  ultima.content = [
    { type: "image", source: { type: "base64", media_type: imagem.mediaType, data: imagem.dados } },
    { type: "text", text: `${textoAtual}\n\n[O técnico enviou a foto acima.]` },
  ];
}

/**
 * Agente de diagnóstico: o modelo pode chamar ferramentas de consulta (até MAX_PASSOS_AGENTE
 * rodadas) e termina com registrar_orientacao. As consultas feitas ficam em passosAgente.
 */
export async function consultarIA(ctx: ContextoDiagnostico, turnos: TurnoConversa[], opcoes: OpcoesConsulta = {}): Promise<RespostaIA> {
  let config: ConfigIA = { apiKey: "", modelo: env.ANTHROPIC_MODEL, origem: "servidor" };
  if (modeloAtual === modeloAnthropic) {
    const encontrada = opcoes.empresaId ? await configIADaEmpresa(opcoes.empresaId) : null;
    if (!encontrada && !env.ANTHROPIC_API_KEY) throw new AppError(503, MENSAGEM_IA_NAO_CONFIGURADA);
    config = encontrada ?? { apiKey: env.ANTHROPIC_API_KEY as string, modelo: env.ANTHROPIC_MODEL, origem: "servidor" };
  }

  const system = montarSystemPrompt(ctx.nomeEmpresa);
  const mensagens = montarMensagens(ctx, turnos);
  if (opcoes.imagem) anexarImagem(mensagens, opcoes.imagem);
  const tools = [...(opcoes.ferramentas?.definicoes ?? []), FERRAMENTA];
  const passos: PassoAgente[] = [];

  for (let rodada = 1; rodada <= MAX_PASSOS_AGENTE; rodada++) {
    const ultimaRodada = rodada === MAX_PASSOS_AGENTE || !opcoes.ferramentas;
    const { content } = await modeloAtual({ system, messages: mensagens, tools, escolha: ultimaRodada ? "final" : "qualquer" }, config);
    const usos = content.filter((b): b is Extract<BlocoModelo, { type: "tool_use" }> => b.type === "tool_use");

    const final = usos.find((u) => u.name === FERRAMENTA.name);
    if (final) {
      const r = respostaIASchema.safeParse(final.input);
      if (!r.success) {
        console.error("[IA] resposta fora do formato:", r.error.issues);
        throw new AppError(502, "A resposta da IA veio em formato inesperado. Tente novamente.");
      }
      return { ...r.data, passosAgente: passos };
    }
    if (!usos.length || !opcoes.ferramentas) throw new AppError(502, "A IA não retornou uma orientação estruturada.");

    // Executa as consultas pedidas e devolve os resultados ao modelo.
    mensagens.push({
      role: "assistant",
      content: content.map((b) =>
        b.type === "text" ? { type: "text" as const, text: b.text } : { type: "tool_use" as const, id: b.id, name: b.name, input: b.input },
      ),
    });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const u of usos) {
      const r = await opcoes.ferramentas.executar(u.name, u.input);
      passos.push({ ferramenta: u.name, resumo: r.resumo });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.dados).slice(0, 12_000) });
    }
    mensagens.push({ role: "user", content: resultados });
  }
  throw new AppError(502, "O agente não concluiu a orientação. Tente novamente.");
}
