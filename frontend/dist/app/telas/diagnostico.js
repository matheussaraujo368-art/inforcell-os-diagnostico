/** HU05/HU06 — Sessão do assistente de diagnóstico com IA. */
import { api, iaDisponivel, ErroApi, pode } from "../api.js";
import { aoEnviar, avisoIAIndisponivel, cabecalhoTela, caixaAviso, caixaErro, caixaOk, campo, dataHora, h, moeda, numeroOS, ocupado, paraNumero, preencher } from "../dom.js";
import { campoFoto } from "../foto.js";
const ROTULO_PROBABILIDADE = { alta: "Alta", media: "Média", baixa: "Baixa" };
const ROTULO_AVALIACAO = {
    DENTRO_DO_ESPERADO: "Dentro do esperado",
    ABAIXO_DO_ESPERADO: "Abaixo do esperado",
    ACIMA_DO_ESPERADO: "Acima do esperado",
    INDEFINIDO: "Sem avaliação",
};
function listaCausas(causas) {
    return h("ol", { class: "causas" }, causas.map((c) => h("li", {}, h("div", { class: "item__topo" }, h("strong", {}, c.causa), h("span", { class: `etiqueta etiqueta--${c.probabilidade}` }, ROTULO_PROBABILIDADE[c.probabilidade])), c.justificativa && h("p", { class: "item__sub" }, c.justificativa))));
}
/** Consultas que o agente fez antes de responder. */
function passosAgente(o) {
    const passos = o.passosAgente ?? [];
    if (!passos.length)
        return false;
    return h("div", { class: "agente-passos" }, h("span", { class: "agente-passos__titulo" }, `Agente · ${passos.length} consulta(s) ao sistema`), h("ul", {}, passos.map((p) => h("li", {}, p.resumo))));
}
function cartaoOrcamento(o, acoes) {
    if (!o.itens.length)
        return false;
    const areaErro = h("div", {});
    const total = o.valorTotal;
    const botao = acoes && total !== null && total > 0
        ? h("button", { class: "btn btn--primary btn--sm", type: "button" }, `Aplicar ${moeda(total)} como orçamento da OS`)
        : null;
    botao?.addEventListener("click", () => void ocupado(botao, "Aplicando…", areaErro, async () => {
        await api.patch(`/ordens/${acoes.sessao.osId}`, { valorOrcamento: total });
        await acoes.recarregar(undefined, `Orçamento de ${moeda(total)} aplicado na OS. Revise antes de pedir a aprovação do cliente.`);
    }));
    const atual = acoes?.sessao.os.valorOrcamento;
    return h("div", { class: "cartao-agente" }, h("h3", {}, "Orçamento sugerido"), h("table", { class: "orcamento" }, h("tbody", {}, o.itens.map((i) => h("tr", {}, h("td", {}, i.descricao, h("span", { class: "item__sub" }, i.tipo === "peca" ? " · peça" : " · serviço")), h("td", { class: "orcamento__valor" }, i.valor !== null ? moeda(i.valor) : "cotar"))), total !== null && h("tr", { class: "orcamento__total" }, h("td", {}, "Total"), h("td", { class: "orcamento__valor" }, moeda(total))))), o.prazoDias !== null && h("p", { class: "item__sub" }, `Prazo estimado: ${o.prazoDias} dia(s)`), o.observacao && h("p", { class: "item__sub texto-livre" }, o.observacao), atual !== null && atual !== undefined && h("p", { class: "item__sub" }, `Orçamento atual da OS: ${moeda(atual)}`), botao && h("div", { class: "form__acoes" }, botao), areaErro);
}
/** Deixa só os dígitos e acrescenta o código do Brasil, para o link do WhatsApp. */
function telefoneWhatsApp(telefone) {
    const d = telefone.replace(/\D/g, "");
    if (d.length === 10 || d.length === 11)
        return `55${d}`;
    if ((d.length === 12 || d.length === 13) && d.startsWith("55"))
        return d;
    return null;
}
/** O nome do cliente entra só aqui, no navegador: a IA escreve {cliente}. */
function cartaoMensagemCliente(modelo, acoes) {
    const cliente = acoes?.sessao.os.cliente;
    const primeiroNome = cliente?.nome.trim().split(/\s+/)[0] ?? "";
    const texto = modelo.split("{cliente}").join(primeiroNome || "cliente");
    const areaAviso = h("span", { class: "item__sub", role: "status" });
    const copiar = h("button", { class: "btn btn--outline btn--sm", type: "button" }, "Copiar");
    copiar.addEventListener("click", () => {
        navigator.clipboard.writeText(texto).then(() => (areaAviso.textContent = "Copiado."), () => (areaAviso.textContent = "Não foi possível copiar. Selecione o texto manualmente."));
    });
    const numero = cliente ? telefoneWhatsApp(cliente.telefone) : null;
    return h("div", { class: "cartao-agente" }, h("h3", {}, "Mensagem para o cliente"), h("p", { class: "texto-livre mensagem-cliente" }, texto), h("div", { class: "form__acoes" }, copiar, numero &&
        h("a", { class: "btn btn--primary btn--sm", href: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, target: "_blank", rel: "noopener" }, "Abrir no WhatsApp"), areaAviso));
}
function balaoIA(o, acoes = null) {
    const etapa = o.proximaEtapa;
    return [
        passosAgente(o),
        o.analiseImagem && h("div", { class: "etapa" }, h("strong", {}, "Análise da foto: "), h("span", { class: "texto-livre" }, o.analiseImagem)),
        h("p", { class: "texto-livre" }, o.mensagem),
        o.interpretacaoUltimoResultado &&
            h("p", { class: "texto-livre" }, h("strong", {}, "Interpretação: "), o.interpretacaoUltimoResultado, o.avaliacaoUltimaMedicao && ` (${ROTULO_AVALIACAO[o.avaliacaoUltimaMedicao]})`),
        o.alertasSeguranca.length > 0 &&
            h("div", { class: "alerta alerta--aviso" }, h("strong", {}, "Segurança"), h("ul", {}, o.alertasSeguranca.map((a) => h("li", {}, a)))),
        etapa &&
            h("div", { class: "etapa" }, h("h3", {}, `Próximo teste: ${etapa.titulo}`), h("p", { class: "texto-livre" }, etapa.procedimento), h("dl", { class: "dados dados--compacto" }, etapa.instrumento && [h("dt", {}, "Instrumento"), h("dd", {}, etapa.instrumento)], etapa.pontoMedicao && [h("dt", {}, "Ponto de medição"), h("dd", {}, etapa.pontoMedicao)], etapa.resultadoEsperado && [h("dt", {}, "Esperado"), h("dd", {}, etapa.resultadoEsperado)])),
        o.diagnosticoConcluido && o.diagnosticoSugerido && h("p", { class: "texto-livre" }, h("strong", {}, "Diagnóstico sugerido: "), o.diagnosticoSugerido),
        o.sugestaoOrcamento && cartaoOrcamento(o.sugestaoOrcamento, acoes),
        o.mensagemCliente && cartaoMensagemCliente(o.mensagemCliente, acoes),
    ].filter(Boolean);
}
function tabelaMedicoes(medicoes) {
    return h("div", { class: "tabela" }, h("table", {}, h("thead", {}, h("tr", {}, ["Ponto", "Grandeza", "Valor", "Esperado", "Avaliação"].map((t) => h("th", {}, t)))), h("tbody", {}, medicoes.map((m) => h("tr", {}, h("td", {}, m.pontoMedicao), h("td", {}, m.grandeza), h("td", {}, `${Number(m.valor).toLocaleString("pt-BR")} ${m.unidade}`), h("td", {}, m.resultadoEsperado ?? "—"), h("td", {}, ROTULO_AVALIACAO[m.avaliacao]))))));
}
export async function telaDiagnostico(el, { params }) {
    if (!pode.diagnosticar()) {
        preencher(el, cabecalhoTela("Assistente de diagnóstico"), caixaAviso("O assistente é usado por técnicos e administradores."));
        return;
    }
    const id = Number(params[0]);
    /** `falha` mantém visível um erro da IA depois de recarregar a conversa. */
    const carregar = async (falha, aviso) => {
        const [s, saude] = await Promise.all([api.get(`/diagnosticos/${id}`), iaDisponivel()]);
        const msgUltimaIA = [...s.mensagens].reverse().find((m) => m.autor === "IA");
        const ultimaIA = msgUltimaIA?.dadosEstruturados ?? null;
        const ultimaDoTecnico = s.mensagens[s.mensagens.length - 1]?.autor === "TECNICO";
        const ativa = s.status === "ATIVA";
        preencher(el, h("p", { class: "migalha" }, h("a", { href: `#/ordens/${s.osId}` }, `← ${numeroOS(s.os.numero)}`)), cabecalhoTela("Assistente de diagnóstico", h("span", { class: `etiqueta ${ativa ? "etiqueta--em_diagnostico" : "etiqueta--finalizado"}` }, ativa ? "Em andamento" : "Concluído")), h("p", { class: "texto-livre sintoma" }, h("strong", {}, "Sintoma: "), s.sintoma), aviso && caixaOk(aviso), !saude && ativa && avisoIAIndisponivel(pode.configurar(), "Seus resultados ainda podem ser registrados."), h("div", { class: "colunas" }, h("div", { class: "colunas__principal" }, h("section", { class: "painel" }, h("h2", {}, "Conversa"), h("ol", { class: "conversa", "aria-live": "polite" }, s.mensagens.map((m) => h("li", { class: `balao balao--${m.autor === "IA" ? "ia" : "tecnico"}` }, h("p", { class: "balao__autor" }, m.autor === "IA" ? "Assistente" : s.tecnico.nome, ` · ${dataHora(m.createdAt)}`), m.autor === "IA" && m.dadosEstruturados
            ? balaoIA(m.dadosEstruturados, m === msgUltimaIA ? { sessao: s, recarregar: carregar } : null)
            : h("p", { class: "texto-livre" }, m.conteudo)))), falha ? caixaErro(falha) : null, ativa && ultimaDoTecnico && botaoContinuar(s.id, carregar), ativa && formResultado(s.id, ultimaIA, carregar)), ativa && secaoConcluir(s.id, ultimaIA, carregar), !ativa && h("section", { class: "painel" }, h("h2", {}, "Diagnóstico final"), h("p", { class: "texto-livre" }, s.diagnosticoFinal ?? "—")), s.medicoes.length > 0 && h("section", { class: "painel" }, h("h2", {}, "Medições"), tabelaMedicoes(s.medicoes))), h("aside", { class: "colunas__lado" }, h("section", { class: "painel" }, h("h2", {}, "Causas possíveis"), s.causasPossiveis?.length ? listaCausas(s.causasPossiveis) : h("p", { class: "vazio" }, "Sem causas registradas.")))));
    };
    await carregar();
}
function botaoContinuar(id, carregar) {
    const areaErro = h("div", {});
    const botao = h("button", {
        class: "btn btn--outline btn--sm",
        type: "button",
        onClick: () => void ocupado(botao, "O agente está analisando…", areaErro, async () => {
            await api.post(`/diagnosticos/${id}/continuar`);
            await carregar();
        }),
    }, "Pedir orientação novamente");
    return h("div", { class: "continuar" }, botao, areaErro);
}
function formResultado(id, ultima, carregar) {
    const etapa = ultima?.proximaEtapa ?? null;
    const foto = campoFoto();
    const form = h("form", { class: "form" }, campo({ rotulo: "Resultado do teste", nome: "texto", obrigatorio: true, linhas: 3, atributos: { placeholder: "O que você observou ao fazer o teste?" } }), h("details", { class: "dobra" }, h("summary", {}, "Incluir medição"), h("div", { class: "form form--grade" }, campo({ rotulo: "Ponto de medição", nome: "pontoMedicao", valor: etapa?.pontoMedicao, atributos: { maxlength: 120 } }), campo({ rotulo: "Grandeza", nome: "grandeza", atributos: { maxlength: 40, placeholder: "Tensão, corrente…" } }), campo({ rotulo: "Valor", nome: "valor", atributos: { inputmode: "decimal", placeholder: "5,02" } }), campo({ rotulo: "Unidade", nome: "unidade", atributos: { maxlength: 10, placeholder: "V, mA, Ω" } }), campo({ rotulo: "Resultado esperado", nome: "resultadoEsperado", valor: etapa?.resultadoEsperado?.slice(0, 120), atributos: { maxlength: 120 } }))), h("details", { class: "dobra" }, h("summary", {}, "Anexar foto"), foto.elemento), h("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Enviar resultado"));
    aoEnviar(form, async (d) => {
        const corpo = { texto: d.texto };
        const imagem = await foto.obter();
        if (imagem)
            corpo.imagem = imagem;
        if (d.valor || d.grandeza || d.unidade) {
            const valor = paraNumero(d.valor);
            if (!d.valor || !Number.isFinite(valor))
                throw new Error("Informe um valor numérico para a medição, como 5,02.");
            if (!d.pontoMedicao || !d.grandeza || !d.unidade)
                throw new Error("Para registrar a medição, preencha ponto, grandeza e unidade.");
            corpo.medicao = {
                pontoMedicao: d.pontoMedicao,
                grandeza: d.grandeza,
                valor,
                unidade: d.unidade,
                resultadoEsperado: d.resultadoEsperado || null,
            };
        }
        try {
            await api.post(`/diagnosticos/${id}/mensagens`, corpo);
        }
        catch (e) {
            // Erro 5xx aqui é falha da IA: o resultado já foi gravado, então recarrega a conversa.
            if (e instanceof ErroApi && e.status >= 500) {
                await carregar(e);
                return;
            }
            throw e;
        }
        await carregar();
    }, "O agente está analisando…");
    return form;
}
function secaoConcluir(id, ultima, carregar) {
    const form = h("form", { class: "form" }, campo({
        rotulo: "Diagnóstico final",
        nome: "diagnosticoFinal",
        obrigatorio: true,
        linhas: 3,
        valor: ultima?.diagnosticoSugerido,
        atributos: { minlength: 3 },
        ajuda: "A decisão final é do técnico: revise a sugestão da IA antes de concluir.",
    }), h("label", { class: "campo-check" }, h("input", { type: "checkbox", name: "salvarNaBase" }), "Salvar este caso na base de conhecimento"), h("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Concluir diagnóstico"));
    aoEnviar(form, async (d) => {
        await api.post(`/diagnosticos/${id}/concluir`, { diagnosticoFinal: d.diagnosticoFinal, salvarNaBase: d.salvarNaBase === "on" });
        await carregar(undefined, "Diagnóstico concluído e registrado na OS.");
    }, "Concluindo…");
    return h("details", { class: "painel painel--dobra", open: ultima?.diagnosticoConcluido }, h("summary", {}, "Concluir diagnóstico"), form);
}
