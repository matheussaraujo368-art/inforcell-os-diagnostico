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

// ---------- Consultas compartilhadas (diagnóstico da OS e assistente de bancada) ----------

interface FiltroAparelho {
  tipo?: TipoEquipamento;
  marca?: string;
  modelo?: string;
}

/** Filtro de equipamento: por marca e, quando informado, por modelo. */
function filtroEquipamento(f: FiltroAparelho) {
  return {
    ...(f.marca ? { marca: { contains: f.marca } } : {}),
    ...(f.modelo ? { modelo: { contains: f.modelo } } : {}),
  };
}

export async function consultaBase(empresaId: number, consulta: string, f: FiltroAparelho): Promise<ResultadoFerramenta> {
  const candidatos = await prisma.artigoConhecimento.findMany({
    where: { empresaId, ...(f.tipo ? { OR: [{ tipoEquipamento: f.tipo }, { tipoEquipamento: null }] } : {}) },
    take: 300,
    orderBy: { updatedAt: "desc" },
  });
  const artigos = candidatos
    .map((a) => ({ a, p: pontuar(a, { sintoma: consulta, marca: f.marca ?? "", modelo: f.modelo ?? "" }) }))
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p)
    .slice(0, 5)
    .map(({ a }) => ({ titulo: a.titulo, modelo: a.modelo, sintoma: a.sintoma, conteudo: sanitizarTexto(a.conteudo.slice(0, 1500)) }));
  return {
    dados: artigos.length ? artigos : "Nenhum artigo encontrado para esta busca.",
    resumo: `Buscou na base de conhecimento "${consulta}": ${artigos.length} artigo(s)`,
  };
}

export async function consultaCasos(empresaId: number, f: FiltroAparelho, excluirOsId?: number): Promise<ResultadoFerramenta> {
  const sessoes = await prisma.sessaoDiagnostico.findMany({
    where: {
      status: "CONCLUIDA",
      diagnosticoFinal: { not: null },
      ...(excluirOsId ? { osId: { not: excluirOsId } } : {}),
      os: { empresaId, equipamento: filtroEquipamento(f) },
    },
    orderBy: { concluidaEm: "desc" },
    take: 8,
    select: {
      sintoma: true,
      diagnosticoFinal: true,
      concluidaEm: true,
      os: { select: { equipamento: { select: { marca: true, modelo: true } } } },
      medicoes: { select: { pontoMedicao: true, grandeza: true, valor: true, unidade: true, avaliacao: true }, take: 6 },
    },
  });
  const casos = sessoes.map((s) => ({
    aparelho: `${s.os.equipamento.marca} ${s.os.equipamento.modelo}`,
    data: s.concluidaEm?.toISOString().slice(0, 10),
    sintoma: sanitizarTexto(s.sintoma),
    diagnostico: sanitizarTexto(s.diagnosticoFinal ?? ""),
    medicoes: s.medicoes.map((m) => `${m.grandeza} em ${m.pontoMedicao}: ${Number(m.valor)} ${m.unidade} (${m.avaliacao})`),
  }));
  const alvo = [f.marca, f.modelo].filter(Boolean).join(" ") || "todos os aparelhos";
  return {
    dados: casos.length ? casos : `Nenhum diagnóstico concluído para ${alvo} nesta assistência.`,
    resumo: `Consultou casos semelhantes de ${alvo}: ${casos.length} encontrado(s)`,
  };
}

export async function consultaReparos(empresaId: number, f: FiltroAparelho, termo: string): Promise<ResultadoFerramenta> {
  const reparos = await prisma.reparo.findMany({
    where: {
      os: { empresaId, equipamento: filtroEquipamento(f) },
      ...(termo ? { OR: [{ descricao: { contains: termo } }, { pecasUtilizadas: { contains: termo } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      descricao: true,
      pecasUtilizadas: true,
      valorFinal: true,
      createdAt: true,
      os: { select: { valorOrcamento: true, equipamento: { select: { marca: true, modelo: true } } } },
    },
  });
  const lista = reparos.map((r) => ({
    aparelho: `${r.os.equipamento.marca} ${r.os.equipamento.modelo}`,
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
}

function montarFerramentas(
  definicoes: Anthropic.Tool[],
  executores: Record<string, (entrada: Record<string, unknown>) => Promise<ResultadoFerramenta>>,
): Ferramentas {
  return {
    definicoes,
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

/** Ferramentas do diagnóstico, presas à empresa e à OS da sessão. */
export function criarFerramentas(escopo: EscopoAgente): Ferramentas {
  const { empresaId, osId, equipamento } = escopo;
  const aparelho = (apenasMarca: boolean, modelo?: string): FiltroAparelho => ({
    tipo: equipamento.tipo,
    marca: equipamento.marca,
    modelo: apenasMarca ? undefined : modelo || equipamento.modelo,
  });
  return montarFerramentas(DEFINICOES_FERRAMENTAS, {
    buscar_base_conhecimento: (e) =>
      consultaBase(empresaId, texto(e.consulta) || equipamento.modelo, { tipo: equipamento.tipo, marca: equipamento.marca, modelo: equipamento.modelo }),
    buscar_casos_semelhantes: (e) => consultaCasos(empresaId, aparelho(e.apenasMarca === true, texto(e.modelo, 80)), osId),
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
    consultar_reparos_e_precos: (e) => consultaReparos(empresaId, aparelho(e.apenasMarca === true), texto(e.termo, 60)),
  });
}

// ---------- Ferramentas do assistente de bancada (sem OS) ----------

const propsAparelho = {
  marca: { type: "string", description: "Marca, ex.: Apple, Samsung, Motorola." },
  modelo: { type: "string", description: "Modelo, ex.: iPhone 11, Galaxy A12. Deixe vazio para toda a marca." },
};

export const DEFINICOES_FERRAMENTAS_BANCADA: Anthropic.Tool[] = [
  {
    name: "buscar_base_conhecimento",
    description: "Busca artigos na base de conhecimento da assistência (procedimentos, casos resolvidos, valores de referência).",
    input_schema: {
      type: "object",
      properties: { consulta: { type: "string", description: "Palavras-chave do problema ou componente." }, ...propsAparelho },
      required: ["consulta"],
    },
  },
  {
    name: "buscar_casos_semelhantes",
    description: "Lista diagnósticos já concluídos pela assistência para uma marca/modelo: sintoma, diagnóstico final e medições.",
    input_schema: { type: "object", properties: propsAparelho, required: ["marca"] },
  },
  {
    name: "consultar_reparos_e_precos",
    description: "Lista reparos já feitos pela assistência para uma marca/modelo, com peças e valores cobrados (média, mínimo, máximo).",
    input_schema: {
      type: "object",
      properties: { ...propsAparelho, termo: { type: "string", description: "Filtra pela descrição ou peça, ex.: 'tela'." } },
      required: ["marca"],
    },
  },
];

/** Ferramentas do assistente de bancada: somente leitura, presas à empresa. */
export function criarFerramentasBancada(empresaId: number): Ferramentas {
  const filtro = (e: Record<string, unknown>): FiltroAparelho => ({ marca: texto(e.marca, 60) || undefined, modelo: texto(e.modelo, 80) || undefined });
  return montarFerramentas(DEFINICOES_FERRAMENTAS_BANCADA, {
    buscar_base_conhecimento: (e) => consultaBase(empresaId, texto(e.consulta) || texto(e.modelo), filtro(e)),
    buscar_casos_semelhantes: (e) => consultaCasos(empresaId, filtro(e)),
    consultar_reparos_e_precos: (e) => consultaReparos(empresaId, filtro(e), texto(e.termo, 60)),
  });
}
