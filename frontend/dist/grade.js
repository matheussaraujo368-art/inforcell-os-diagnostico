"use strict";
/**
 * Sobreposição do grid de 12 colunas (para conferir o alinhamento das telas).
 * Atalho: Alt+G liga e desliga. Também liga com ?grade=1 no endereço.
 * Script clássico (sem import/export), usado pela página inicial e pelo sistema.
 */
(() => {
    const CHAVE = "inforcell.grade";
    let camada = null;
    const lembrar = (ligado) => {
        try {
            if (ligado)
                localStorage.setItem(CHAVE, "1");
            else
                localStorage.removeItem(CHAVE);
        }
        catch {
            /* navegador sem armazenamento: só não lembra */
        }
    };
    const lembrado = () => {
        try {
            return localStorage.getItem(CHAVE) === "1";
        }
        catch {
            return false;
        }
    };
    function ligar() {
        if (camada)
            return;
        camada = document.createElement("div");
        camada.className = "grade-sobreposicao";
        camada.setAttribute("aria-hidden", "true");
        const linha = document.createElement("div");
        linha.className = "container";
        for (let i = 1; i <= 12; i++) {
            const coluna = document.createElement("div");
            coluna.className = "grade-sobreposicao__coluna";
            const numero = document.createElement("span");
            numero.textContent = String(i);
            coluna.append(numero);
            linha.append(coluna);
        }
        const selo = document.createElement("div");
        selo.className = "grade-selo";
        selo.textContent = "Grid de 12 colunas · Alt+G esconde";
        camada.append(linha, selo);
        document.body.append(camada);
        lembrar(true);
    }
    function desligar() {
        camada?.remove();
        camada = null;
        lembrar(false);
    }
    document.addEventListener("keydown", (ev) => {
        if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.code === "KeyG") {
            ev.preventDefault();
            if (camada)
                desligar();
            else
                ligar();
        }
    });
    if (new URLSearchParams(location.search).get("grade") === "1" || lembrado()) {
        if (document.body)
            ligar();
        else
            document.addEventListener("DOMContentLoaded", ligar, { once: true });
    }
})();
