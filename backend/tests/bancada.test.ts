/**
 * Assistente de bancada: conversa livre com modelo simulado (sem API real e sem banco).
 */
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { criarApp } from "../src/app";
import { conversarBancada, montarPromptBancada } from "../src/services/bancada.service";
import { ChamadaModelo, definirModeloIA, MAX_PASSOS_AGENTE } from "../src/services/ia.service";
import type { Ferramentas } from "../src/services/ferramentasAgente";

const app = criarApp();

function ferramentasFalsas(): Ferramentas & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    definicoes: [{ name: "consultar_reparos_e_precos", input_schema: { type: "object", properties: {} } }],
    async executar(nome) {
      chamadas.push(nome);
      return { dados: { valores: { media: 180 } }, resumo: "Consultou reparos e preços: 4 reparo(s)" };
    },
  };
}

afterEach(() => definirModeloIA(null));

describe("assistente de bancada", () => {
  it("responde em texto livre, com o foco em celular no prompt", async () => {
    let recebida: ChamadaModelo | null = null;
    definirModeloIA(async (c) => {
      recebida = structuredClone(c);
      return { content: [{ type: "text", text: "Meça o consumo na fonte." }] };
    });
    const r = await conversarBancada(1, "Assistência X", [], "iPhone 11 não liga, por onde começo?", undefined, ferramentasFalsas());
    expect(r.texto).toBe("Meça o consumo na fonte.");
    expect(r.passos).toEqual([]);
    expect(recebida!.escolha).toBe("auto");
    expect(recebida!.system).toContain("assistente de bancada da Assistência X");
    expect(recebida!.system).toContain("CELULARES");
  });

  it("consulta uma ferramenta e depois responde", async () => {
    let n = 0;
    definirModeloIA(async () => {
      n++;
      return n === 1
        ? { content: [{ type: "tool_use", id: "t1", name: "consultar_reparos_e_precos", input: { marca: "Apple" } }] }
        : { content: [{ type: "text", text: "Na sua assistência a troca saiu em média R$ 180." }] };
    });
    const f = ferramentasFalsas();
    const r = await conversarBancada(1, "X", [], "Quanto cobramos pela troca do flex do iPhone 11?", undefined, f);
    expect(f.chamadas).toEqual(["consultar_reparos_e_precos"]);
    expect(r.passos[0].resumo).toContain("4 reparo");
    expect(r.texto).toContain("R$ 180");
  });

  it("na última rodada só permite texto (não fica em laço)", async () => {
    const escolhas: string[] = [];
    definirModeloIA(async (c) => {
      escolhas.push(c.escolha);
      if (c.escolha === "nenhuma") return { content: [{ type: "text", text: "Resposta final." }] };
      return { content: [{ type: "tool_use", id: `t${escolhas.length}`, name: "consultar_reparos_e_precos", input: {} }] };
    });
    const r = await conversarBancada(1, "X", [], "teste", undefined, ferramentasFalsas());
    expect(escolhas).toHaveLength(MAX_PASSOS_AGENTE);
    expect(escolhas.at(-1)).toBe("nenhuma");
    expect(r.texto).toBe("Resposta final.");
  });

  it("envia quadros de vídeo como imagens em sequência na mensagem atual", async () => {
    let recebida: ChamadaModelo | null = null;
    definirModeloIA(async (c) => {
      recebida = structuredClone(c);
      return { content: [{ type: "text", text: "A tela pisca e apaga." }] };
    });
    await conversarBancada(
      1,
      "X",
      [
        { autor: "TECNICO", conteudo: "Oi" },
        { autor: "IA", conteudo: "Olá! Em que posso ajudar?" },
      ],
      "O que você vê?",
      { tipo: "video", imagens: [1, 2, 3].map(() => ({ mediaType: "image/jpeg" as const, dados: "AAAA" })) },
      ferramentasFalsas(),
    );
    const msgs = recebida!.messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const blocos = msgs[2].content as { type: string; text?: string }[];
    expect(blocos.filter((b) => b.type === "image")).toHaveLength(3);
    expect(blocos.at(-1)!.text).toContain("quadros tirados de um vídeo");
  });

  it("junta mensagens seguidas do mesmo autor e remove dados pessoais do texto", async () => {
    let recebida: ChamadaModelo | null = null;
    definirModeloIA(async (c) => {
      recebida = structuredClone(c);
      return { content: [{ type: "text", text: "ok" }] };
    });
    await conversarBancada(
      1,
      "X",
      [{ autor: "IA", conteudo: "mensagem solta" }, { autor: "TECNICO", conteudo: "primeira" }],
      "cliente com CPF 123.456.789-01 e telefone (99) 98888-7777",
      undefined,
      ferramentasFalsas(),
    );
    const msgs = recebida!.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    const textoEnviado = JSON.stringify(msgs[0].content);
    expect(textoEnviado).toContain("primeira");
    expect(textoEnviado).not.toContain("123.456.789-01");
    expect(textoEnviado).not.toContain("98888-7777");
  });

  it("o prompt pede cautela com valores e segurança", () => {
    const p = montarPromptBancada("Y");
    expect(p).toContain("Nunca invente valores");
    expect(p).toContain("alertas de segurança");
  });
});

describe("rotas do assistente sem banco", () => {
  it("exigem login", async () => {
    expect((await request(app).get("/api/bancada/conversas")).status).toBe(401);
    expect((await request(app).post("/api/bancada/conversas").send({ texto: "oi" })).status).toBe(401);
  });
});
