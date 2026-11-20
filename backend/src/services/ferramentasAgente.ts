import type Anthropic from "@anthropic-ai/sdk";
import { TipoEquipamento } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { pontuar } from "./conhecimento.service";
import { sanitizarTexto } from "./ia.service";

/**
 * Ferramentas do agente de diagnóstico.
 *
 * O agente decide quais usar e com quais termos. Todas são SOMENTE LEITURA e ficam presas à
 * empresa e à OS da sessão: o agente não enxerga outras empresas, não altera dados e não
 * recebe nome, telefone, CPF ou e-mail de clientes (RNF04/LGPD).
 */

export interface PassoAgente {
  ferramenta: string;
  /** Frase curta mostrada ao técnico, ex.: "Consultou 3 casos semelhantes de iPhone 11". */
  resumo: string;
}

export interface ResultadoFerramenta {
  dados: unknown;
  resumo: string;
}

export interface Ferramentas {
  definicoes: Anthropic.Tool[];
  executar(nome: string, entrada: unknown): Promise<ResultadoFerramenta>;
}

export interface EscopoAgente {
  empresaId: number;
  osId: number;
  equipamento: { tipo: TipoEquipamento; marca: string; modelo: string };
}

export const DEFINICOES_FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_base_conhecimento",
    description:
      "Busca artigos na base de conhecimento da assistência (procedimentos, casos resolvidos, valores de referência). Use termos técnicos do sintoma ou do componente suspeito.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Palavras-chave, ex.: 'não liga consumo zero flex power'." },
      },
      required: ["consulta"],
    },
  },
  {
    name: "buscar_casos_semelhantes",
    description:
      "Lista diagnósticos já concluídos pela assistência em aparelhos do mesmo modelo (ou marca), com o sintoma, o diagnóstico final e as medições feitas. Útil para saber o defeito mais comum do modelo.",
    input_schema: {
      type: "object",
      properties: {
        modelo: { type: "string", description: "Modelo a buscar. Padrão: o modelo do aparelho desta OS." },
        apenasMarca: { type: "boolean", description: "Se verdadeiro, busca em todos os modelos da mesma marca." },
      },
    },
  },
  {
    name: "consultar_medicoes_da_os",
    description: "Lista todas as medições já registradas nesta OS (ponto, grandeza, valor, esperado e avaliação).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "consultar_reparos_e_precos",
    description:
      "Lista reparos já feitos pela assistência em aparelhos do mesmo modelo ou marca: descrição, peças e valor cobrado, com média, mínimo e máximo. Use antes de sugerir um orçamento.",
    input_schema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Filtra pela descrição ou peça, ex.: 'tela', 'conector de carga'." },
        apenasMarca: { type: "boolean", description: "Se verdadeiro, inclui todos os modelos da mesma marca." },
      },
    },
  },
];

const texto = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Monta as ferramentas presas à empresa e à OS da sessão. */
export function criarFerramentas(escopo: EscopoAgente): Ferramentas {
  const { empresaId, osId, equipamento } = escopo;

  const executores: Record<string, (entrada: Record<string, unknown>) => Promise<ResultadoFerramenta>> = {
    async buscar_base_conhecimento(entrada) {
      const consulta = texto(entrada.consulta) || equipamento.modelo;
      const candidatos = await prisma.artigoConhecimento.findMany({
        where: { empresaId, OR: [{ tipoEquipamento: equipamento.tipo }, { tipoEquipamento: null }] },
        take: 300,
        orderBy: { updatedAt: "desc" },
      });
      const artigos = candidatos
        .map((a) => ({ a, p: pontuar(a, { sintoma: consulta, marca: equipamento.marca, modelo: equipamento.modelo }) }))
        .filter((x) => x.p > 0)
        .sort((x, y) => y.p - x.p)
        .slice(0, 5)
        .map(({ a }) => ({ titulo: a.titulo, modelo: a.modelo, sintoma: a.sintoma, conteudo: sanitizarTexto(a.conteudo.slice(0, 1500)) }));
      return {
        dados: artigos.length ? artigos : "Nenhum artigo encontrado para esta busca.",
        resumo: `Buscou na base de conhecimento "${consulta}": ${artigos.length} artigo(s)`,
      };
    },

    async buscar_casos_semelhantes(entrada) {
      const apenasMarca = entrada.apenasMarca === true;
      const modelo = texto(entrada.modelo, 80) || equipamento.modelo;
      const sessoes = await prisma.sessaoDiagnostico.findMany({
        where: {
          status: "CONCLUIDA",
          diagnosticoFinal: { not: null },
          osId: { not: osId },
          os: {
            empresaId,
            equipamento: apenasMarca ? { marca: equipamento.marca } : { marca: equipamento.marca, modelo: { contains: modelo } },
          },
        },
        orderBy: { concluidaEm: "desc" },
        take: 8,
        select: {
          sintoma: true,
          diagnosticoFinal: true,
          concluidaEm: true,
          os: { select: { equipamento: { select: { modelo: true } } } },
          medicoes: { select: { pontoMedicao: true, grandeza: true, valor: true, unidade: true, avaliacao: true }, take: 6 },
        },
      });
      const casos = sessoes.map((s) => ({
        modelo: s.os.equipamento.modelo,
        data: s.concluidaEm?.toISOString().slice(0, 10),
        sintoma: sanitizarTexto(s.sintoma),
        diagnostico: sanitizarTexto(s.diagnosticoFinal ?? ""),
        medicoes: s.medicoes.map((m) => `${m.grandeza} em ${m.pontoMedicao}: ${Number(m.valor)} ${m.unidade} (${m.avaliacao})`),
      }));
      const alvo = apenasMarca ? equipamento.marca : `${equipamento.marca} ${modelo}`;
      return {
        dados: casos.length ? casos : `Nenhum diagnóstico concluído para ${alvo} nesta assistência.`,
        resumo: `Consultou casos semelhantes de ${alvo}: ${casos.length} encontrado(s)`,
      };
    },

    async consultar_medicoes_da_os() {
      const medicoes = await prisma.medicao.findMany({ where: { osId, os: { empresaId } }, orderBy: { id: "asc" } });
      return {
        dados: medicoes.length
          ? medicoes.map((m) => ({
              ponto: m.pontoMedicao,
              grandeza: m.grandeza,
              valor: Number(m.valor),
              unidade: m.unidade,
              esperado: m.resultadoEsperado,
              avaliacao: m.avaliacao,
            }))
          : "Nenhuma medição registrada nesta OS.",
        resumo: `Conferiu as medições desta OS: ${medicoes.length}`,
      };
    },

    async consultar_reparos_e_precos(entrada) {
      const apenasMarca = entrada.apenasMarca === true;
      const termo = texto(entrada.termo, 60);
      const reparos = await prisma.reparo.findMany({
        where: {
          os: {
            empresaId,
            equipamento: apenasMarca ? { marca: equipamento.marca } : { marca: equipamento.marca, modelo: { contains: equipamento.modelo } },
          },
          ...(termo ? { OR: [{ descricao: { contains: termo } }, { pecasUtilizadas: { contains: termo } }] } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          descricao: true,
          pecasUtilizadas: true,
          valorFinal: true,
          createdAt: true,
          os: { select: { valorOrcamento: true, equipamento: { select: { modelo: true } } } },
        },
      });
      const lista = reparos.map((r) => ({
        modelo: r.os.equipamento.modelo,
        data: r.createdAt.toISOString().slice(0, 10),
        descricao: sanitizarTexto(r.descricao.slice(0, 300)),
        pecas: r.pecasUtilizadas ? sanitizarTexto(r.pecasUtilizadas.slice(0, 200)) : null,
        valorCobrado: numero(r.valorFinal) ?? numero(r.os.valorOrcamento),
      }));
      const valores = lista.map((r) => r.valorCobrado).filter((v): v is number => v !== null && Number.isFinite(v));
      const estatistica = valores.length
        ? {
            quantidade: valores.length,
            media: Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100,
            minimo: Math.min(...valores),
            maximo: Math.max(...valores),
          }
        : null;
      return {
        dados: lista.length ? { reparos: lista, valores: estatistica } : "Nenhum reparo anterior encontrado para este filtro.",
        resumo: `Consultou reparos e preços${termo ? ` de "${termo}"` : ""}: ${lista.length} reparo(s)`,
      };
    },
  };

  return {
    definicoes: DEFINICOES_FERRAMENTAS,
    async executar(nome, entrada) {
      const fn = executores[nome];
      if (!fn) return { dados: `Ferramenta desconhecida: ${nome}`, resumo: `Tentou usar ${nome} (inexistente)` };
      const args = typeof entrada === "object" && entrada !== null ? (entrada as Record<string, unknown>) : {};
      try {
        return await fn(args);
      } catch (e) {
        console.error(`[IA] erro na ferramenta ${nome}:`, e);
        return { dados: "Erro ao consultar esta informação. Continue sem ela.", resumo: `Não conseguiu usar ${nome}` };
      }
    },
  };
}
