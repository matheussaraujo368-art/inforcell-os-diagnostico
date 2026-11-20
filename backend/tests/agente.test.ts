/**
 * Agente de diagnóstico: laço de ferramentas com um modelo simulado (não usa a API real nem banco).
 */
import { afterEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  ChamadaModelo,
  consultarIA,
  ContextoDiagnostico,
  definirModeloIA,
  MAX_PASSOS_AGENTE,
  respostaIASchema,
} from "../src/services/ia.service";
import type { Ferramentas } from "../src/services/ferramentasAgente";

const ctx: ContextoDiagnostico = {
  nomeEmpresa: "Assistência Teste",
  equipamento: { tipo: "CELULAR", marca: "Apple", modelo: "iPhone 11" },
  defeitoRelatado: "Não liga",
  sintoma: "Não liga e não carrega",
  historicoEquipamento: [],
  baseConhecimento: [],
};

const orientacaoFinal = {
  mensagem: "Comece pelo consumo na fonte.",
  causasPossiveis: [{ causa: "Flex do botão Power", probabilidade: "alta", justificativa: "Comum neste modelo" }],
  proximaEtapa: { titulo: "Consumo na fonte", procedimento: "Ligue na fonte e pressione Power." },
  diagnosticoConcluido: false,
};

/** Ferramentas falsas que registram as chamadas. */
function ferramentasFalsas(): Ferramentas & { chamadas: { nome: string; entrada: unknown }[] } {
  const chamadas: { nome: string; entrada: unknown }[] = [];
  return {
    chamadas,
    definicoes: [{ name: "buscar_casos_semelhantes", input_schema: { type: "object", properties: {} } }],
    async executar(nome, entrada) {
      chamadas.push({ nome, entrada });
      return { dados: [{ diagnostico: "Flex do Power rompido" }], resumo: "Consultou casos semelhantes de Apple iPhone 11: 1 encontrado(s)" };
    },
  };
}

afterEach(() => definirModeloIA(null));

describe("agente de diagnóstico", () => {
  it("consulta uma ferramenta, recebe o resultado e então responde", async () => {
    const chamadasModelo: ChamadaModelo[] = [];
    definirModeloIA(async (c) => {
      chamadasModelo.push(structuredClone(c));
      if (chamadasModelo.length === 1) {
        return { content: [{ type: "tool_use", id: "t1", name: "buscar_casos_semelhantes", input: {} }] };
      }
      return { content: [{ type: "tool_use", id: "t2", name: "registrar_orientacao", input: orientacaoFinal }] };
    });
    const f = ferramentasFalsas();
    const r = await consultarIA(ctx, [], { ferramentas: f });

    expect(f.chamadas.map((c) => c.nome)).toEqual(["buscar_casos_semelhantes"]);
    expect(r.passosAgente).toEqual([{ ferramenta: "buscar_casos_semelhantes", resumo: expect.stringContaining("1 encontrado") }]);
    expect(r.causasPossiveis[0].causa).toBe("Flex do botão Power");

    // a segunda chamada recebeu o resultado da ferramenta
    const ultima = chamadasModelo[1].messages.at(-1) as Anthropic.MessageParam;
    expect(ultima.role).toBe("user");
    expect(JSON.stringify(ultima.content)).toContain("tool_result");
    expect(JSON.stringify(ultima.content)).toContain("Flex do Power rompido");
    // e as ferramentas foram oferecidas junto com a resposta final
    expect(chamadasModelo[0].tools.map((t) => t.name)).toEqual(["buscar_casos_semelhantes", "registrar_orientacao"]);
    expect(chamadasModelo[0].system).toContain("Assistência Teste");
  });

  it("obriga a responder na última rodada (não fica em laço)", async () => {
    const escolhas: string[] = [];
    definirModeloIA(async (c) => {
      escolhas.push(c.escolha);
      if (c.escolha === "final") return { content: [{ type: "tool_use", id: "f", name: "registrar_orientacao", input: orientacaoFinal }] };
      return { content: [{ type: "tool_use", id: `t${escolhas.length}`, name: "buscar_casos_semelhantes", input: {} }] };
    });
    const r = await consultarIA(ctx, [], { ferramentas: ferramentasFalsas() });
    expect(escolhas).toHaveLength(MAX_PASSOS_AGENTE);
    expect(escolhas.at(-1)).toBe("final");
    expect(r.passosAgente).toHaveLength(MAX_PASSOS_AGENTE - 1);
  });

  it("sem ferramentas, pede a resposta final direto", async () => {
    const escolhas: string[] = [];
    definirModeloIA(async (c) => {
      escolhas.push(c.escolha);
      return { content: [{ type: "tool_use", id: "f", name: "registrar_orientacao", input: orientacaoFinal }] };
    });
    await consultarIA(ctx, []);
    expect(escolhas).toEqual(["final"]);
  });

  it("envia a foto junto da última mensagem do técnico", async () => {
    let recebida: ChamadaModelo | null = null;
    definirModeloIA(async (c) => {
      recebida = structuredClone(c);
      return { content: [{ type: "tool_use", id: "f", name: "registrar_orientacao", input: { ...orientacaoFinal, analiseImagem: "Oxidação no conector" } }] };
    });
    const r = await consultarIA(ctx, [{ autor: "TECNICO", texto: "Segue foto da placa" }], {
      imagem: { mediaType: "image/jpeg", dados: "AAAA" },
    });
    const ultima = recebida!.messages.at(-1)!;
    expect(Array.isArray(ultima.content)).toBe(true);
    expect((ultima.content as { type: string }[])[0].type).toBe("image");
    expect(r.analiseImagem).toBe("Oxidação no conector");
  });

  it("ignora campos opcionais malformados em vez de falhar", () => {
    const r = respostaIASchema.parse({
      ...orientacaoFinal,
      diagnosticoConcluido: true,
      sugestaoOrcamento: { itens: [{ descricao: "Flex Power", tipo: "peça", valor: "barato" }], valorTotal: "x" },
      mensagemCliente: "Olá, {cliente}! Seu aparelho está com o flex do botão rompido.",
    });
    expect(r.sugestaoOrcamento?.itens[0]).toEqual({ descricao: "Flex Power", tipo: "servico", valor: null });
    expect(r.sugestaoOrcamento?.valorTotal).toBeNull();
    expect(r.mensagemCliente).toContain("{cliente}");
  });

  it("falha com mensagem clara se o modelo não usar ferramenta nenhuma", async () => {
    definirModeloIA(async () => ({ content: [{ type: "text", text: "oi" }] }));
    await expect(consultarIA(ctx, [], { ferramentas: ferramentasFalsas() })).rejects.toThrow(/orientação estruturada/);
  });
});

describe.skipIf(process.env.TESTAR_BANCO !== "1")("ferramentas do agente no banco", () => {
  it("não enxergam dados de outra empresa", async () => {
    const { criarFerramentas } = await import("../src/services/ferramentasAgente");
    const { prisma } = await import("../src/lib/prisma");
    const qualquerOS = await prisma.ordemServico.findFirst({ include: { equipamento: true } });
    if (!qualquerOS) return;
    // mesma OS e mesmo aparelho, mas com uma empresa que não é a dona: nada pode voltar
    const f = criarFerramentas({ empresaId: qualquerOS.empresaId + 100_000, osId: qualquerOS.id, equipamento: qualquerOS.equipamento });
    for (const nome of ["buscar_base_conhecimento", "buscar_casos_semelhantes", "consultar_medicoes_da_os", "consultar_reparos_e_precos"]) {
      const r = await f.executar(nome, { consulta: "liga" });
      expect(typeof r.dados).toBe("string"); // mensagem de "nenhum encontrado"
    }
  });
});
