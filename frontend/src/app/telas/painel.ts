/** HU08 — Painel da empresa: situação das Ordens de Serviço. */
import { api, Cliente, iaDisponivel, Pagina, Painel, pode, StatusOS, usuarioAtual } from "../api.js";
import { avisoIAIndisponivel, h, preencher, ROTULO_STATUS } from "../dom.js";

export async function telaPainel(el: HTMLElement): Promise<void> {
  const [p, clientes, ia] = await Promise.all([
    api.get<Painel>("/dashboard"),
    api.get<Pagina<Cliente>>("/clientes?porPagina=1"),
    pode.diagnosticar() ? iaDisponivel() : Promise.resolve(true),
  ]);

  preencher(
    el,
    saudacao(p),
    !ia && avisoIAIndisponivel(pode.configurar()),
    pode.configurar() && configuracaoInicial(p, ia, clientes.total),
    indicadores(p),
    secaoStatus(p),
  );
}

// ---------- Topo: saudação, resumo do dia e atalhos ----------

function saudacao(p: Painel): HTMLElement {
  const hora = new Date().getHours();
  const cumprimento = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = (usuarioAtual()?.nome ?? "").trim().split(/\s+/)[0];
  const data = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const aguardando = p.porStatus.AGUARDANDO_APROVACAO ?? 0;

  const resumo: (HTMLElement | string)[] = [h("strong", {}, `${p.emAberto} OS em aberto`)];
  if (p.atrasadas > 0) resumo.push(" · ", h("strong", { class: "inicio__alerta" }, p.atrasadas === 1 ? "1 atrasada" : `${p.atrasadas} atrasadas`));
  if (aguardando > 0) resumo.push(" · ", aguardando === 1 ? "1 aguardando o cliente aprovar" : `${aguardando} aguardando o cliente aprovar`);

  return h(
    "header",
    { class: "inicio__topo" },
    h(
      "div",
      {},
      h("p", { class: "eyebrow" }, `// ${data}`),
      h("h1", { class: "tela__titulo inicio__titulo", tabindex: "-1" }, primeiroNome ? `${cumprimento}, ${primeiroNome} ` : `${cumprimento} `, h("span", { "aria-hidden": "true" }, "👋")),
      h("p", { class: "inicio__resumo" }, ...resumo),
    ),
    h(
      "div",
      { class: "inicio__acoes" },
      pode.cadastrar() && h("a", { class: "btn btn--outline inicio__atalho", href: "#/clientes" }, h("span", { "aria-hidden": "true" }, "＋"), "Cliente"),
      pode.diagnosticar() && h("a", { class: "btn btn--outline inicio__atalho", href: "#/assistente" }, h("span", { "aria-hidden": "true" }, "✦"), "Assistente IA"),
      pode.abrirOS() && h("a", { class: "btn btn--primary inicio__atalho", href: "#/ordens/nova" }, h("span", { "aria-hidden": "true" }, "＋"), "Nova OS"),
    ),
  );
}

// ---------- Configuração inicial (só para o administrador; some quando tudo estiver pronto) ----------

function configuracaoInicial(p: Painel, ia: boolean, totalClientes: number): HTMLElement | false {
  const totalOS = Object.values(p.porStatus).reduce((soma, n) => soma + n, 0);
  const passos = [
    { feito: ia, texto: "Cadastrar a chave da IA", href: "#/configuracoes" },
    { feito: (p.totalUsuarios ?? 1) > 1, texto: "Adicionar a equipe", href: "#/equipe" },
    { feito: totalClientes > 0, texto: "Cadastrar um cliente", href: "#/clientes" },
    { feito: totalOS > 0, texto: "Abrir a primeira OS", href: "#/ordens/nova" },
  ];
  const feitos = passos.filter((x) => x.feito).length;
  if (feitos === passos.length) return false;
  const proximo = passos.find((x) => !x.feito);

  return h(
    "section",
    { class: "inicio__config", "aria-label": "Configuração inicial" },
    h(
      "div",
      { class: "inicio__config-cabeca" },
      h("h2", {}, "Configuração inicial"),
      h("p", {}, `${feitos} de ${passos.length} concluídos`),
      h("span", { class: "inicio__progresso", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(passos.length), "aria-valuenow": String(feitos) }, h("span", { style: `width: ${(feitos / passos.length) * 100}%` })),
    ),
    h(
      "ol",
      { class: "inicio__passos" },
      passos.map((x) =>
        h(
          "li",
          {},
          h(
            "a",
            { class: `inicio__passo${x.feito ? " inicio__passo--feito" : ""}${x === proximo ? " inicio__passo--proximo" : ""}`, href: x.href },
            h("span", { class: "inicio__passo-icone", "aria-hidden": "true" }, x.feito ? "✓" : x === proximo ? "!" : "○"),
            h("span", {}, h("span", { class: "inicio__passo-texto" }, x.texto), x.feito ? h("span", { class: "sr-only" }, " (concluído)") : x === proximo && h("small", {}, "Falta este →")),
          ),
        ),
      ),
    ),
  );
}

// ---------- Indicadores ----------

const ICONES: Record<string, string> = {
  aberto: '<rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  atraso: '<circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v4l2.5 2M9.5 3h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  finalizado: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  dinheiro: '<rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 9.5v5M17.5 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  entrada: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

function iconeSvg(nome: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONES[nome];
  return svg;
}

interface Indicador {
  icone: string;
  valor: string | number;
  rotulo: string;
  dica?: string;
  href?: string;
  alerta?: boolean;
}

function cartaoIndicador(i: Indicador): HTMLElement {
  const conteudo = [
    h("span", { class: "inicio__kpi-icone" }, iconeSvg(i.icone)),
    h("span", { class: "inicio__kpi-texto" }, h("strong", {}, i.valor), h("span", {}, i.rotulo)),
    i.dica && h("small", { class: "inicio__kpi-dica" }, i.dica),
  ];
  const classe = `inicio__kpi${i.alerta ? " inicio__kpi--alerta" : ""}`;
  return i.href ? h("a", { class: classe, href: i.href, "aria-label": `${i.rotulo}: ${i.valor}. Ver lista` }, ...conteudo) : h("div", { class: classe }, ...conteudo);
}

function indicadores(p: Painel): HTMLElement {
  const faturado = p.ultimos30Dias.faturado;
  return h(
    "div",
    { class: "inicio__kpis" },
    cartaoIndicador({ icone: "aberto", valor: p.emAberto, rotulo: "OS em aberto", dica: "ver →", href: "#/ordens" }),
    cartaoIndicador({ icone: "atraso", valor: p.atrasadas, rotulo: p.atrasadas === 1 ? "Atrasada" : "Atrasadas", dica: "ver →", href: "#/ordens", alerta: p.atrasadas > 0 }),
    cartaoIndicador({
      icone: "finalizado",
      valor: p.ultimos30Dias.finalizadas,
      rotulo: "Finalizadas em 30 dias",
      dica: `de ${p.ultimos30Dias.abertas} ${p.ultimos30Dias.abertas === 1 ? "aberta" : "abertas"}`,
      href: "#/ordens?status=FINALIZADO",
    }),
    typeof faturado === "number"
      ? cartaoIndicador({ icone: "dinheiro", valor: `R$ ${faturado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, rotulo: "Faturado em 30 dias" })
      : cartaoIndicador({ icone: "entrada", valor: p.ultimos30Dias.abertas, rotulo: "Abertas em 30 dias" }),
  );
}

/** Ordem do fluxo da OS (usada nos cartões e na barra). */
const ORDEM_STATUS = Object.keys(ROTULO_STATUS) as StatusOS[];

const porcento = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 100) : 0);

/** Cartões por status + barra com a distribuição. */
function secaoStatus(p: Painel): HTMLElement {
  const total = ORDEM_STATUS.reduce((soma, s) => soma + (p.porStatus[s] ?? 0), 0);
  const barra = h(
    "div",
    { class: "distribuicao", role: "img", "aria-label": `Distribuição de ${total} OS por status` },
    total === 0
      ? h("span", { class: "distribuicao__vazio" }, "Nenhuma OS registrada ainda")
      : ORDEM_STATUS.filter((s) => (p.porStatus[s] ?? 0) > 0).map((s) =>
          h("span", {
            class: `distribuicao__parte status--${s.toLowerCase()}`,
            style: `flex-grow: ${p.porStatus[s]}`,
            title: `${ROTULO_STATUS[s]}: ${p.porStatus[s]}`,
          }),
        ),
  );
  return h(
    "section",
    { class: "painel painel--status" },
    h(
      "div",
      { class: "painel__topo" },
      h("h2", {}, "OS por status"),
      h("span", { class: "painel__total" }, h("strong", {}, total), total === 1 ? " ordem" : " ordens"),
    ),
    barra,
    h(
      "div",
      { class: "status-grade" },
      ORDEM_STATUS.map((s) => {
        const qtd = p.porStatus[s] ?? 0;
        return h(
          "a",
          {
            class: `status-cartao status--${s.toLowerCase()}${qtd === 0 ? " status-cartao--vazio" : ""}`,
            href: `#/ordens?status=${s}`,
            "aria-label": `${ROTULO_STATUS[s]}: ${qtd} OS. Ver lista`,
          },
          h("span", { class: "status-cartao__rotulo" }, h("span", { class: "status-cartao__ponto", "aria-hidden": "true" }), ROTULO_STATUS[s]),
          h("span", { class: "status-cartao__valor" }, qtd),
          h(
            "span",
            { class: "status-cartao__barra", "aria-hidden": "true" },
            h("span", { style: `width: ${porcento(qtd, total)}%` }),
          ),
          h("span", { class: "status-cartao__pct" }, total > 0 ? `${porcento(qtd, total)}% do total` : "—"),
        );
      }),
    ),
  );
}
