import type Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../utils/http";
import type { Ferramentas, PassoAgente } from "./ferramentasAgente";
import { BlocoModelo, CONHECIMENTO_CELULAR, ImagemEnviada, MAX_PASSOS_AGENTE, prepararModelo, sanitizarTexto } from "./ia.service";

/**
 * Assistente de bancada: conversa livre do técnico com a IA, fora de uma OS.
 * Aceita texto, fotos e quadros de vídeo. Pode consultar (somente leitura) a base de
 * conhecimento, os casos e os preços da própria assistência.
 */

export function montarPromptBancada(nomeEmpresa = "Inforcell"): string {
  return `Você é o assistente de bancada da ${nomeEmpresa.trim() || "Inforcell"}, uma assistência técnica de eletrônicos com foco principal em CELULARES (iPhone e Android). Também atende tablets, notebooks e computadores.
Você conversa com técnicos de eletrônica durante o trabalho na bancada. Responda em português do Brasil.

${CONHECIMENTO_CELULAR}
Como responder:
- Seja direto e prático, como um colega experiente na bancada. Use parágrafos curtos, listas e **negrito** para o essencial. Use títulos (###) só em respostas longas.
- Quando citar tensões, consumos ou valores de referência, diga que variam por modelo e revisão de placa e indique como confirmar (esquemático, placa boa, boardview).
- Se não tiver certeza, diga. Nunca invente valores de medição, códigos de componentes ou preços.
- Sempre inclua alertas de segurança quando houver risco (bateria estufada, curto, calor, tensão da rede, ESD).
- Se o técnico enviar fotos, descreva o que observa (oxidação, componentes queimados, trincas, conectores) antes de concluir. Se forem quadros de um vídeo, trate como uma sequência no tempo.
- Quando a pergunta envolver um modelo específico, consulte as ferramentas para ver o que a própria assistência já registrou (casos, base de conhecimento, preços) e diga quando usar esses dados. Não consulte sem necessidade.
- Não peça nem repita dados pessoais de clientes.`;
}

export interface TurnoBancada {
  autor: "TECNICO" | "IA";
  conteudo: string;
}

export interface AnexosEnvio {
  tipo: "foto" | "video";
  imagens: ImagemEnviada[];
}

export interface RespostaBancada {
  texto: string;
  passos: PassoAgente[];
}

/** Quantas mensagens anteriores vão como contexto (limita custo e tamanho). */
export const HISTORICO_MAX = 20;

export async function conversarBancada(
  empresaId: number,
  nomeEmpresa: string,
  historico: TurnoBancada[],
  texto: string,
  anexos: AnexosEnvio | undefined,
  ferramentas: Ferramentas,
): Promise<RespostaBancada> {
  const { modelo, config } = await prepararModelo(empresaId);

  // Histórico só com texto; as imagens vão apenas na mensagem atual.
  const mensagens: Anthropic.MessageParam[] = historico.slice(-HISTORICO_MAX).map((t) => ({
    role: t.autor === "IA" ? "assistant" : "user",
    content: t.autor === "IA" ? t.conteudo : sanitizarTexto(t.conteudo),
  }));
  // A API exige começar pelo usuário e alternar papéis: junta mensagens seguidas do mesmo autor.
  while (mensagens.length && mensagens[0].role === "assistant") mensagens.shift();
  const compactadas: Anthropic.MessageParam[] = [];
  for (const m of mensagens) {
    const anterior = compactadas[compactadas.length - 1];
    if (anterior && anterior.role === m.role) anterior.content = `${anterior.content}\n\n${m.content}`;
    else compactadas.push({ ...m });
  }

  const textoAtual = sanitizarTexto(texto.trim() || "(sem texto)");
  const blocos: Anthropic.ContentBlockParam[] = [];
  if (anexos?.imagens.length) {
    for (const img of anexos.imagens) {
      blocos.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.dados } });
    }
    const aviso =
      anexos.tipo === "video"
        ? `[O técnico enviou ${anexos.imagens.length} quadros tirados de um vídeo, em ordem no tempo.]`
        : `[O técnico enviou ${anexos.imagens.length} foto(s).]`;
    blocos.push({ type: "text", text: `${aviso}\n\n${textoAtual}` });
  } else {
    blocos.push({ type: "text", text: textoAtual });
  }
  const ultima = compactadas[compactadas.length - 1];
  if (ultima && ultima.role === "user") {
    ultima.content = [{ type: "text", text: String(ultima.content) }, ...blocos];
  } else {
    compactadas.push({ role: "user", content: blocos });
  }

  const system = montarPromptBancada(nomeEmpresa);
  const passos: PassoAgente[] = [];
  for (let rodada = 1; rodada <= MAX_PASSOS_AGENTE; rodada++) {
    const ultimaRodada = rodada === MAX_PASSOS_AGENTE;
    const { content } = await modelo(
      { system, messages: compactadas, tools: ferramentas.definicoes, escolha: ultimaRodada ? "nenhuma" : "auto" },
      config,
    );
    const usos = content.filter((b): b is Extract<BlocoModelo, { type: "tool_use" }> => b.type === "tool_use");
    if (!usos.length) {
      const resposta = content
        .filter((b): b is Extract<BlocoModelo, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!resposta) throw new AppError(502, "A IA não retornou uma resposta. Tente novamente.");
      return { texto: resposta, passos };
    }
    compactadas.push({
      role: "assistant",
      content: content.map((b) =>
        b.type === "text" ? { type: "text" as const, text: b.text } : { type: "tool_use" as const, id: b.id, name: b.name, input: b.input },
      ),
    });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const u of usos) {
      const r = await ferramentas.executar(u.name, u.input);
      passos.push({ ferramenta: u.name, resumo: r.resumo });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.dados).slice(0, 12_000) });
    }
    compactadas.push({ role: "user", content: resultados });
  }
  throw new AppError(502, "O assistente não concluiu a resposta. Tente novamente.");
}
