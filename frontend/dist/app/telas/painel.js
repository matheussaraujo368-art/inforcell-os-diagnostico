/** HU08 — Painel da empresa: situação das Ordens de Serviço. */
import { api, empresaAtual, iaDisponivel, pode } from "../api.js";
import { avisoIAIndisponivel, cabecalhoTela, h, preencher, ROTULO_STATUS } from "../dom.js";
const indicador = (rotulo, valor, destaque = false) => h("div", { class: `indicador${destaque && valor > 0 ? " indicador--alerta" : ""}` }, h("span", { class: "indicador__valor" }, valor), h("span", { class: "indicador__rotulo" }, rotulo));
export async function telaPainel(el) {
    const [p, clientes, ia] = await Promise.all([
        api.get("/dashboard"),
        api.get("/clientes?porPagina=1"),
        pode.diagnosticar() ? iaDisponivel() : Promise.resolve(true),
    ]);
    const semClientes = clientes.total === 0;
    preencher(el, cabecalhoTela(empresaAtual()?.nome ?? "Painel", pode.abrirOS() && h("a", { class: "btn btn--primary btn--sm", href: "#/ordens/nova" }, "Nova OS")), !ia && avisoIAIndisponivel(pode.configurar()), semClientes && pode.cadastrar() && primeirosPassos(), h("div", { class: "indicadores" }, indicador("OS em aberto", p.emAberto), indicador("Atrasadas", p.atrasadas, true), indicador("Abertas em 30 dias", p.ultimos30Dias.abertas), indicador("Finalizadas em 30 dias", p.ultimos30Dias.finalizadas)), secaoStatus(p), p.abertasPorTecnico.length > 0 && secaoTecnicos(p));
}
/** Ordem do fluxo da OS (usada nos cartões e na barra). */
const ORDEM_STATUS = Object.keys(ROTULO_STATUS);
const porcento = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);
/** Cartões por status + barra com a distribuição. */
function secaoStatus(p) {
    const total = ORDEM_STATUS.reduce((soma, s) => soma + (p.porStatus[s] ?? 0), 0);
    const barra = h("div", { class: "distribuicao", role: "img", "aria-label": `Distribuição de ${total} OS por status` }, total === 0
        ? h("span", { class: "distribuicao__vazio" }, "Nenhuma OS registrada ainda")
        : ORDEM_STATUS.filter((s) => (p.porStatus[s] ?? 0) > 0).map((s) => h("span", {
            class: `distribuicao__parte status--${s.toLowerCase()}`,
            style: `flex-grow: ${p.porStatus[s]}`,
            title: `${ROTULO_STATUS[s]}: ${p.porStatus[s]}`,
        })));
    return h("section", { class: "painel painel--status" }, h("div", { class: "painel__topo" }, h("h2", {}, "OS por status"), h("span", { class: "painel__total" }, h("strong", {}, total), total === 1 ? " ordem" : " ordens")), barra, h("div", { class: "status-grade" }, ORDEM_STATUS.map((s) => {
        const qtd = p.porStatus[s] ?? 0;
        return h("a", {
            class: `status-cartao status--${s.toLowerCase()}${qtd === 0 ? " status-cartao--vazio" : ""}`,
            href: `#/ordens?status=${s}`,
            "aria-label": `${ROTULO_STATUS[s]}: ${qtd} OS. Ver lista`,
        }, h("span", { class: "status-cartao__rotulo" }, h("span", { class: "status-cartao__ponto", "aria-hidden": "true" }), ROTULO_STATUS[s]), h("span", { class: "status-cartao__valor" }, qtd), h("span", { class: "status-cartao__barra", "aria-hidden": "true" }, h("span", { style: `width: ${porcento(qtd, total)}%` })), h("span", { class: "status-cartao__pct" }, total > 0 ? `${porcento(qtd, total)}% do total` : "—"));
    })));
}
/** OS abertas por técnico, com barra proporcional ao maior. */
function secaoTecnicos(p) {
    const maior = Math.max(...p.abertasPorTecnico.map((t) => t.quantidade), 1);
    return h("section", { class: "painel" }, h("div", { class: "painel__topo" }, h("h2", {}, "OS abertas por técnico")), h("ul", { class: "ranking" }, p.abertasPorTecnico.map((t) => h("li", { class: "ranking__item" }, h("span", { class: "ranking__avatar", "aria-hidden": "true" }, t.nome.trim().charAt(0).toUpperCase()), h("span", { class: "ranking__nome" }, t.nome), h("span", { class: "ranking__barra", "aria-hidden": "true" }, h("span", { style: `width: ${porcento(t.quantidade, maior)}%` })), h("strong", { class: "ranking__valor" }, t.quantidade)))));
}
function primeirosPassos() {
    return h("section", { class: "painel" }, h("h2", {}, "Primeiros passos"), h("ol", { class: "passos" }, pode.configurar() && h("li", {}, h("a", { href: "#/configuracoes" }, "Cadastre a chave da IA"), " para usar o diagnóstico guiado."), pode.gerirEquipe() && h("li", {}, h("a", { href: "#/equipe" }, "Adicione sua equipe"), " (atendentes e técnicos)."), h("li", {}, h("a", { href: "#/clientes" }, "Cadastre um cliente"), " e o equipamento dele."), h("li", {}, h("a", { href: "#/ordens/nova" }, "Abra a primeira Ordem de Serviço"), ".")));
}
