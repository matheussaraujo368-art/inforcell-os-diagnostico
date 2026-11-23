// ---------- Vídeo → quadros (a IA analisa imagens, não vídeo) ----------
const LADO_MAXIMO = 1280;
function esperar(video, evento) {
    return new Promise((ok, falha) => {
        const limpar = () => {
            video.removeEventListener(evento, aoOk);
            video.removeEventListener("error", aoErro);
        };
        const aoOk = () => {
            limpar();
            ok();
        };
        const aoErro = () => {
            limpar();
            falha(new Error("Não foi possível ler este vídeo. Tente um MP4 gravado no celular."));
        };
        video.addEventListener(evento, aoOk, { once: true });
        video.addEventListener("error", aoErro, { once: true });
    });
}
/** Tira `quantidade` quadros espalhados pelo vídeo e devolve como JPEG. */
export async function extrairQuadros(arquivo, quantidade = 6) {
    if (!arquivo.type.startsWith("video/"))
        throw new Error("Escolha um arquivo de vídeo.");
    const url = URL.createObjectURL(arquivo);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    try {
        await esperar(video, "loadeddata");
        const duracao = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const escala = Math.min(1, LADO_MAXIMO / Math.max(video.videoWidth || 1, video.videoHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * escala));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 480) * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Este navegador não conseguiu processar o vídeo.");
        const quadros = [];
        for (let i = 0; i < quantidade; i++) {
            // pontos espalhados, evitando o primeiro e o último instante (às vezes pretos)
            const segundo = Math.min(duracao - 0.05, (duracao * (i + 0.5)) / quantidade);
            video.currentTime = Math.max(0, segundo);
            await esperar(video, "seeked");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            quadros.push({ imagem: { mediaType: "image/jpeg", dados: dataUrl.slice(dataUrl.indexOf(",") + 1) }, url: dataUrl, segundo });
        }
        return quadros;
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
function construtorFala() {
    const w = window;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export const ditadoDisponivel = () => construtorFala() !== null;
/**
 * Liga o ditado: o texto falado vai sendo escrito no campo. Devolve a função para parar.
 * `aoMudar` avisa quando o ditado liga/desliga (para o botão mudar de visual).
 */
export function iniciarDitado(campo, aoMudar, aoErro) {
    const Construtor = construtorFala();
    if (!Construtor) {
        aoErro("Seu navegador não tem ditado por voz. Use o Chrome ou o Edge.");
        return () => undefined;
    }
    const rec = new Construtor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    const base = campo.value ? `${campo.value.replace(/\s+$/, "")} ` : "";
    let finalizado = "";
    rec.onresult = (e) => {
        let provisorio = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal)
                finalizado += r[0].transcript;
            else
                provisorio += r[0].transcript;
        }
        campo.value = `${base}${finalizado}${provisorio}`.replace(/\s{2,}/g, " ");
        campo.dispatchEvent(new Event("input", { bubbles: true }));
    };
    rec.onerror = (e) => {
        const motivo = {
            "not-allowed": "Permita o uso do microfone para ditar.",
            "no-speech": "Não ouvi nada. Tente falar mais perto do microfone.",
            "audio-capture": "Nenhum microfone encontrado.",
            network: "O ditado precisa de internet.",
        };
        aoErro(motivo[e.error] ?? "O ditado parou por um erro. Tente de novo.");
    };
    rec.onend = () => aoMudar(false);
    rec.start();
    aoMudar(true);
    return () => rec.stop();
}
// ---------- Ler em voz alta ----------
export const vozDisponivel = () => "speechSynthesis" in window;
/** Lê o texto em português. Chamar de novo enquanto lê, para. */
export function lerEmVozAlta(texto, aoTerminar) {
    if (!vozDisponivel())
        return;
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        aoTerminar();
        return;
    }
    const fala = new SpeechSynthesisUtterance(textoPuro(texto));
    fala.lang = "pt-BR";
    const voz = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("pt"));
    if (voz)
        fala.voice = voz;
    fala.onend = aoTerminar;
    fala.onerror = aoTerminar;
    speechSynthesis.speak(fala);
}
// ---------- Markdown simples e seguro ----------
const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function emLinha(s) {
    return s
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}
/**
 * Converte o markdown da resposta em HTML. O texto é escapado ANTES de qualquer formatação,
 * então nada que venha da IA vira código na página.
 */
export function markdownParaHtml(md) {
    const linhas = escapar(md.replace(/\r/g, "")).split("\n");
    const saida = [];
    let lista = null;
    let codigo = null;
    let paragrafo = [];
    const fecharParagrafo = () => {
        if (paragrafo.length)
            saida.push(`<p>${emLinha(paragrafo.join("<br>"))}</p>`);
        paragrafo = [];
    };
    const fecharLista = () => {
        if (lista)
            saida.push(`</${lista}>`);
        lista = null;
    };
    for (const linha of linhas) {
        if (linha.trim().startsWith("```")) {
            if (codigo) {
                saida.push(`<pre><code>${codigo.join("\n")}</code></pre>`);
                codigo = null;
            }
            else {
                fecharParagrafo();
                fecharLista();
                codigo = [];
            }
            continue;
        }
        if (codigo) {
            codigo.push(linha);
            continue;
        }
        const titulo = /^(#{1,4})\s+(.*)$/.exec(linha);
        const itemUl = /^\s*[-*•]\s+(.*)$/.exec(linha);
        const itemOl = /^\s*\d+[.)]\s+(.*)$/.exec(linha);
        if (titulo) {
            fecharParagrafo();
            fecharLista();
            saida.push(`<h4>${emLinha(titulo[2])}</h4>`);
        }
        else if (itemUl || itemOl) {
            fecharParagrafo();
            const tipo = itemUl ? "ul" : "ol";
            if (lista !== tipo) {
                fecharLista();
                saida.push(`<${tipo}>`);
                lista = tipo;
            }
            saida.push(`<li>${emLinha((itemUl ?? itemOl)[1])}</li>`);
        }
        else if (!linha.trim()) {
            fecharParagrafo();
            fecharLista();
        }
        else {
            if (lista)
                fecharLista();
            paragrafo.push(linha);
        }
    }
    if (codigo)
        saida.push(`<pre><code>${codigo.join("\n")}</code></pre>`);
    fecharParagrafo();
    fecharLista();
    return saida.join("");
}
/** Texto sem marcações (para copiar ou ler em voz alta). */
export function textoPuro(md) {
    return md
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[#*`>]/g, "")
        .replace(/^\s*[-•]\s+/gm, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
}
