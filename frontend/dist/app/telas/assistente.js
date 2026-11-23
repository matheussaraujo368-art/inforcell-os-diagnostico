/**
 * Assistente de bancada: chat livre do técnico com a IA, fora de uma OS.
 * Texto, fotos, vídeo (enviado como quadros), ditado por voz e leitura da resposta em voz alta.
 */
import { api, iaDisponivel, pode } from "../api.js";
import { avisoIAIndisponivel, caixaErro, h, preencher } from "../dom.js";
import { reduzirImagem } from "../foto.js";
import { ditadoDisponivel, extrairQuadros, iniciarDitado, lerEmVozAlta, markdownParaHtml, textoPuro, vozDisponivel } from "../midia.js";
const MAX_IMAGENS = 8;
const QUADROS_VIDEO = 6;
const SUGESTOES = [
    "iPhone 11 não liga e consome 0 mA na fonte. Por onde começo?",
    "Como achar curto na linha principal (VDD_MAIN / VPH_PWR)?",
    "Procedimento completo para celular que caiu na água",
    "Celular reinicia a cada 3 minutos: o que pode ser?",
    "Como diferenciar tela original de paralela?",
    "Quanto cobramos em média pela troca de conector de carga?",
];
// ---------- Ícones (SVG simples, sem dependências) ----------
function icone(caminho) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = caminho;
    return svg;
}
const ICONES = {
    foto: '<rect x="3" y="5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 5 10 3h4l1.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15.5 10.5 6-3.5v10l-6-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    microfone: '<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    enviar: '<path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    mais: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    lixeira: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    ouvir: '<path d="M4 9.5h4l5-4v13l-5-4H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    robo: '<rect x="4" y="7" width="16" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/><path d="M12 7V4M9 4h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
const tempoRelativo = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1)
        return "agora";
    if (min < 60)
        return `${min} min`;
    const horas = Math.round(min / 60);
    if (horas < 24)
        return `${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? "ontem" : dias < 7 ? `${dias} dias` : new Date(iso).toLocaleDateString("pt-BR");
};
// ---------- Tela ----------
export async function telaAssistente(el, { params }) {
    const [disponivel, conversas] = await Promise.all([iaDisponivel(), api.get("/bancada/conversas")]);
    let conversaAtual = params[0] ? await api.get(`/bancada/conversas/${params[0]}`) : null;
    let anexos = [];
    let tipoAnexo = "foto";
    let enviando = false;
    let pararDitado = null;
    // ----- Lateral: conversas -----
    const listaConversas = h("ul", { class: "chat-lista" });
    const desenharLista = () => {
        listaConversas.replaceChildren(...(conversas.length
            ? conversas.map((c) => {
                const apagar = h("button", { class: "chat-lista__apagar", type: "button", "aria-label": `Apagar conversa ${c.titulo}`, title: "Apagar" }, icone(ICONES.lixeira));
                apagar.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    if (!window.confirm(`Apagar a conversa "${c.titulo}"?`))
                        return;
                    void api.delete(`/bancada/conversas/${c.id}`).then(() => {
                        conversas.splice(conversas.indexOf(c), 1);
                        if (conversaAtual?.id === c.id)
                            novaConversa();
                        desenharLista();
                    });
                });
                return h("li", {}, h("a", { class: `chat-lista__item${conversaAtual?.id === c.id ? " chat-lista__item--ativa" : ""}`, href: `#/assistente/${c.id}` }, h("span", { class: "chat-lista__titulo" }, c.titulo), h("span", { class: "chat-lista__data" }, tempoRelativo(c.updatedAt))), apagar);
            })
            : [h("li", { class: "chat-lista__vazia" }, "Suas conversas aparecem aqui.")]));
    };
    const botaoNova = h("button", { class: "btn btn--primary btn--sm btn--block chat-nova", type: "button" }, icone(ICONES.mais), "Nova conversa");
    // ----- Mensagens -----
    const areaMensagens = h("div", { class: "chat-mensagens", role: "log", "aria-live": "polite", "aria-label": "Conversa com o assistente" });
    const areaErro = h("div", { class: "chat-erro" });
    const rolarParaFim = () => {
        requestAnimationFrame(() => (areaMensagens.scrollTop = areaMensagens.scrollHeight));
    };
    const balaoTecnico = (texto, resumoAnexo, miniaturas = []) => h("div", { class: "msg msg--tecnico" }, h("div", { class: "msg__balao" }, miniaturas.length > 0 && h("div", { class: "msg__miniaturas" }, miniaturas.slice(0, 8).map((u) => h("img", { src: u, alt: "" }))), resumoAnexo && h("span", { class: "msg__anexo" }, resumoAnexo), texto && h("p", {}, texto)));
    const balaoIA = (texto, passos) => {
        const corpo = h("div", { class: "msg__markdown" });
        corpo.innerHTML = markdownParaHtml(texto); // texto escapado dentro de markdownParaHtml
        const copiar = h("button", { class: "msg__acao", type: "button", title: "Copiar resposta" }, icone(ICONES.copiar), "Copiar");
        copiar.addEventListener("click", () => {
            void navigator.clipboard.writeText(textoPuro(texto)).then(() => {
                copiar.lastChild.textContent = "Copiado";
                setTimeout(() => (copiar.lastChild.textContent = "Copiar"), 1500);
            });
        });
        const ouvir = vozDisponivel() ? h("button", { class: "msg__acao", type: "button", title: "Ouvir resposta" }, icone(ICONES.ouvir), "Ouvir") : null;
        ouvir?.addEventListener("click", () => {
            ouvir.classList.add("msg__acao--ativa");
            ouvir.lastChild.textContent = "Parar";
            lerEmVozAlta(texto, () => {
                ouvir.classList.remove("msg__acao--ativa");
                ouvir.lastChild.textContent = "Ouvir";
            });
        });
        return h("div", { class: "msg msg--ia" }, h("span", { class: "msg__avatar" }, icone(ICONES.robo)), h("div", { class: "msg__balao" }, passos && passos.length > 0 && h("div", { class: "msg__passos" }, passos.map((p) => h("span", { class: "msg__passo" }, p.resumo))), corpo, h("div", { class: "msg__acoes" }, copiar, ouvir)));
    };
    const resumoAnexo = (a) => a ? (a.tipo === "video" ? `Vídeo (${a.quantidade} quadros)` : `${a.quantidade} foto${a.quantidade > 1 ? "s" : ""}`) : null;
    const boasVindas = () => h("div", { class: "chat-boasvindas" }, h("span", { class: "chat-boasvindas__icone" }, icone(ICONES.robo)), h("h2", {}, "Assistente de bancada"), h("p", {}, "Pergunte qualquer coisa de reparo, mande foto da placa ou um vídeo do defeito. Ele também consulta os casos e preços da sua assistência."), h("div", { class: "chat-sugestoes" }, SUGESTOES.map((s) => h("button", {
        class: "chat-sugestao",
        type: "button",
        onClick: () => {
            campo.value = s;
            ajustarAltura();
            void enviar();
        },
    }, s))));
    const desenharMensagens = () => {
        if (!conversaAtual || conversaAtual.mensagens.length === 0) {
            areaMensagens.replaceChildren(boasVindas());
            return;
        }
        areaMensagens.replaceChildren(...conversaAtual.mensagens.map((m) => (m.autor === "IA" ? balaoIA(m.conteudo, m.passos) : balaoTecnico(m.conteudo, resumoAnexo(m.anexos)))));
        rolarParaFim();
    };
    // ----- Campo de mensagem -----
    const campo = h("textarea", {
        class: "chat-campo",
        rows: 1,
        placeholder: "Pergunte ao assistente… (Enter envia, Shift+Enter quebra linha)",
        "aria-label": "Mensagem para o assistente",
        maxlength: 8000,
    });
    const ajustarAltura = () => {
        campo.style.height = "auto";
        campo.style.height = `${Math.min(campo.scrollHeight, 200)}px`;
    };
    campo.addEventListener("input", ajustarAltura);
    campo.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
            ev.preventDefault();
            void enviar();
        }
    });
    const bandeja = h("div", { class: "chat-bandeja" });
    const desenharBandeja = () => {
        bandeja.hidden = anexos.length === 0;
        bandeja.replaceChildren(h("span", { class: "chat-bandeja__rotulo" }, tipoAnexo === "video" ? `Vídeo: ${anexos.length} quadros` : `${anexos.length} foto(s)`), ...anexos.map((a, i) => h("span", { class: "chat-bandeja__item" }, h("img", { src: a.url, alt: a.rotulo }), h("button", {
            type: "button",
            "aria-label": `Remover ${a.rotulo}`,
            onClick: () => {
                anexos.splice(i, 1);
                desenharBandeja();
            },
        }, "×"))), h("button", { class: "chat-bandeja__limpar", type: "button", onClick: () => ((anexos = []), desenharBandeja()) }, "Limpar"));
    };
    const mostrarErro = (msg) => {
        areaErro.replaceChildren(caixaErro(msg));
        setTimeout(() => areaErro.replaceChildren(), 6000);
    };
    // Foto
    const entradaFoto = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
    entradaFoto.addEventListener("change", async () => {
        const arquivos = [...(entradaFoto.files ?? [])];
        entradaFoto.value = "";
        if (!arquivos.length)
            return;
        if (tipoAnexo === "video")
            anexos = [];
        tipoAnexo = "foto";
        for (const arq of arquivos) {
            if (anexos.length >= MAX_IMAGENS) {
                mostrarErro(`Máximo de ${MAX_IMAGENS} fotos por mensagem.`);
                break;
            }
            try {
                const r = await reduzirImagem(arq);
                anexos.push({ imagem: r.imagem, url: r.url, rotulo: arq.name });
            }
            catch (e) {
                mostrarErro(e instanceof Error ? e.message : "Imagem inválida.");
            }
        }
        desenharBandeja();
        campo.focus();
    });
    // Vídeo → quadros
    const entradaVideo = h("input", { type: "file", accept: "video/*", hidden: true });
    const botaoVideo = h("button", { class: "chat-ferramenta", type: "button", title: "Anexar vídeo", "aria-label": "Anexar vídeo" }, icone(ICONES.video));
    entradaVideo.addEventListener("change", async () => {
        const arq = entradaVideo.files?.[0];
        entradaVideo.value = "";
        if (!arq)
            return;
        botaoVideo.classList.add("chat-ferramenta--ocupado");
        try {
            const quadros = await extrairQuadros(arq, QUADROS_VIDEO);
            tipoAnexo = "video";
            anexos = quadros.map((q) => ({ imagem: q.imagem, url: q.url, rotulo: `Quadro em ${q.segundo.toFixed(1)} s` }));
            desenharBandeja();
            campo.focus();
        }
        catch (e) {
            mostrarErro(e instanceof Error ? e.message : "Não foi possível ler o vídeo.");
        }
        finally {
            botaoVideo.classList.remove("chat-ferramenta--ocupado");
        }
    });
    const botaoFoto = h("button", { class: "chat-ferramenta", type: "button", title: "Anexar foto", "aria-label": "Anexar foto" }, icone(ICONES.foto));
    botaoFoto.addEventListener("click", () => entradaFoto.click());
    botaoVideo.addEventListener("click", () => entradaVideo.click());
    // Ditado
    const botaoMic = h("button", { class: "chat-ferramenta", type: "button", title: "Ditar por voz", "aria-label": "Ditar por voz", "aria-pressed": "false" }, icone(ICONES.microfone));
    if (!ditadoDisponivel()) {
        botaoMic.disabled = true;
        botaoMic.title = "Ditado por voz disponível no Chrome e no Edge";
    }
    botaoMic.addEventListener("click", () => {
        if (pararDitado) {
            pararDitado();
            pararDitado = null;
            return;
        }
        pararDitado = iniciarDitado(campo, (gravando) => {
            botaoMic.classList.toggle("chat-ferramenta--gravando", gravando);
            botaoMic.setAttribute("aria-pressed", String(gravando));
            if (!gravando)
                pararDitado = null;
        }, mostrarErro);
    });
    const botaoEnviar = h("button", { class: "chat-enviar", type: "button", title: "Enviar (Enter)", "aria-label": "Enviar" }, icone(ICONES.enviar));
    botaoEnviar.addEventListener("click", () => void enviar());
    // ----- Enviar -----
    async function enviar() {
        const texto = campo.value.trim();
        if (enviando || (!texto && anexos.length === 0))
            return;
        if (!disponivel)
            return mostrarErro("O assistente de IA não está configurado.");
        pararDitado?.();
        enviando = true;
        botaoEnviar.disabled = true;
        const anexosEnvio = anexos;
        const tipoEnvio = tipoAnexo;
        // mostra a pergunta na hora e o indicador "pensando"
        if (areaMensagens.querySelector(".chat-boasvindas"))
            areaMensagens.replaceChildren();
        const resumo = anexosEnvio.length ? (tipoEnvio === "video" ? `Vídeo (${anexosEnvio.length} quadros)` : `${anexosEnvio.length} foto(s)`) : null;
        const otimista = balaoTecnico(texto, resumo, anexosEnvio.map((a) => a.url));
        const pensando = h("div", { class: "msg msg--ia msg--pensando" }, h("span", { class: "msg__avatar" }, icone(ICONES.robo)), h("div", { class: "msg__balao" }, h("span", { class: "pontos", "aria-label": "O assistente está pensando" }, h("i", {}), h("i", {}), h("i", {})), h("span", {}, "Analisando…")));
        areaMensagens.append(otimista, pensando);
        rolarParaFim();
        campo.value = "";
        ajustarAltura();
        anexos = [];
        desenharBandeja();
        try {
            const corpo = { texto, ...(anexosEnvio.length ? { anexos: { tipo: tipoEnvio, imagens: anexosEnvio.map((a) => a.imagem) } } : {}) };
            const r = conversaAtual
                ? await api.post(`/bancada/conversas/${conversaAtual.id}/mensagens`, corpo)
                : await api.post("/bancada/conversas", corpo);
            if (!conversaAtual) {
                conversaAtual = { ...r.conversa, mensagens: [] };
                conversas.unshift(r.conversa);
                history.replaceState(null, "", `#/assistente/${r.conversa.id}`);
            }
            else {
                const item = conversas.find((c) => c.id === r.conversa.id);
                if (item) {
                    item.updatedAt = r.conversa.updatedAt;
                    conversas.splice(conversas.indexOf(item), 1);
                    conversas.unshift(item);
                }
            }
            conversaAtual.mensagens.push(...r.mensagens);
            pensando.replaceWith(balaoIA(r.mensagens[1].conteudo, r.mensagens[1].passos));
            desenharLista();
            rolarParaFim();
        }
        catch (e) {
            // devolve o que foi digitado para tentar de novo
            otimista.remove();
            pensando.remove();
            campo.value = texto;
            anexos = anexosEnvio;
            tipoAnexo = tipoEnvio;
            desenharBandeja();
            ajustarAltura();
            if (!areaMensagens.children.length)
                desenharMensagens();
            mostrarErro(e instanceof Error ? e.message : "Não foi possível falar com o assistente.");
        }
        finally {
            enviando = false;
            botaoEnviar.disabled = false;
            campo.focus();
        }
    }
    function novaConversa() {
        conversaAtual = null;
        history.replaceState(null, "", "#/assistente");
        desenharMensagens();
        desenharLista();
        campo.focus();
    }
    botaoNova.addEventListener("click", novaConversa);
    const compositor = h("div", { class: "chat-compositor" }, bandeja, h("div", { class: "chat-compositor__linha" }, h("div", { class: "chat-ferramentas" }, botaoFoto, botaoVideo, botaoMic, entradaFoto, entradaVideo), campo, botaoEnviar), h("p", { class: "chat-rodape" }, "A IA pode errar: confirme medições e valores no esquemático. Fotos e vídeos não ficam salvos."));
    preencher(el, h("div", { class: "chat" }, h("aside", { class: "chat-lateral", "aria-label": "Conversas" }, botaoNova, h("span", { class: "chat-lateral__rotulo" }, "Conversas recentes"), listaConversas), h("section", { class: "chat-principal" }, !disponivel && avisoIAIndisponivel(pode.configurar()), areaMensagens, areaErro, compositor)));
    desenharLista();
    desenharMensagens();
    desenharBandeja();
    ajustarAltura();
    campo.focus();
}
