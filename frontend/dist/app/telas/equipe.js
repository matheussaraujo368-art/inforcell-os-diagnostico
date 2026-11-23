/** RF01/RF02 — Usuários da empresa, geridos pelo administrador. */
import { api, pode, usuarioAtual } from "../api.js";
import { cabecalhoTela, caixaAviso, caixaOk, h, ocupado, preencher } from "../dom.js";
import { etapaForm, iniciais, painelRecolhivel, rotuloObrig } from "../componentes.js";
const ROTULO_PERFIL = { ADMIN: "Administrador", ATENDENTE: "Atendente", TECNICO: "Técnico" };
/** O que cada perfil pode fazer (mostrado ao escolher). */
const PERFIS = [
    { valor: "TECNICO", titulo: "Técnico", descricao: "Diagnóstico com o agente de IA, medições e reparos das próprias OS." },
    { valor: "ATENDENTE", titulo: "Atendente", descricao: "Clientes, aparelhos, abertura de OS, aprovação do cliente e entrega." },
    { valor: "ADMIN", titulo: "Administrador", descricao: "Tudo, inclusive equipe, configurações e chave da IA." },
];
/** Senha aleatória legível (sem letras/números que se confundem). */
function gerarSenha(tamanho = 10) {
    const caracteres = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const aleatorio = crypto.getRandomValues(new Uint32Array(tamanho));
    return Array.from(aleatorio, (n) => caracteres[n % caracteres.length]).join("");
}
function forcaSenha(s) {
    if (!s)
        return { nivel: 0, texto: "" };
    if (s.length < 8)
        return { nivel: 1, texto: "Curta demais (mínimo 8)" };
    const variedade = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter((r) => r.test(s)).length;
    return variedade >= 3 && s.length >= 10 ? { nivel: 3, texto: "Forte" } : { nivel: 2, texto: "Razoável" };
}
/** Cartão com o acesso para entregar à pessoa (a senha só aparece agora). */
function cartaoAcesso(nome, email, senha, titulo) {
    const texto = `Olá, ${nome.split(/\s+/)[0]}! Seu acesso ao Inforcell OS:\nEndereço: ${location.origin}${location.pathname}\nE-mail: ${email}\nSenha: ${senha}\nTroque a senha depois do primeiro acesso.`;
    const status = h("span", { class: "item__sub", role: "status" });
    const copiar = h("button", { class: "btn btn--primary btn--sm", type: "button" }, "Copiar acesso");
    copiar.addEventListener("click", () => {
        navigator.clipboard.writeText(texto).then(() => (status.textContent = "Copiado! Cole no WhatsApp ou e-mail da pessoa."), () => (status.textContent = "Não foi possível copiar. Selecione o texto."));
    });
    return h("section", { class: "cartao-acesso", "aria-live": "polite" }, h("h2", {}, titulo), h("p", { class: "item__sub" }, "Anote ou envie agora: por segurança, a senha não aparece de novo."), h("dl", { class: "cartao-acesso__dados" }, h("dt", {}, "E-mail"), h("dd", { class: "mono" }, email), h("dt", {}, "Senha"), h("dd", { class: "mono cartao-acesso__senha" }, senha)), h("div", { class: "form__acoes" }, copiar, status));
}
export async function telaEquipe(el) {
    if (!pode.gerirEquipe()) {
        preencher(el, cabecalhoTela("Equipe"), caixaAviso("Somente o administrador pode gerir a equipe."));
        return;
    }
    const carregar = async (aviso, acesso) => {
        const membros = await api.get("/usuarios");
        const areaErro = h("div", {});
        const ativos = membros.filter((m) => m.ativo);
        const conta = (p) => ativos.filter((m) => m.perfil === p).length;
        // ---------- Formulário em etapas (abre e recolhe pelo botão do topo) ----------
        const formulario = formNovoMembro(async (nome, email, senha) => {
            await carregar(`${nome} foi adicionado(a) à equipe.`, cartaoAcesso(nome, email, senha, "Acesso criado"));
        });
        const recolhivel = painelRecolhivel("Adicionar pessoa", formulario);
        formulario.addEventListener("fechar", () => recolhivel.fechar());
        // ---------- Cartão de cada pessoa ----------
        const cartaoMembro = (m) => {
            const souEu = m.id === usuarioAtual()?.id;
            const acoes = [];
            const seletorPerfil = h("select", { class: "membro__perfil", "aria-label": `Perfil de ${m.nome}`, disabled: souEu || !m.ativo }, PERFIS.map((p) => h("option", { value: p.valor }, p.titulo)));
            seletorPerfil.value = m.perfil;
            seletorPerfil.addEventListener("change", () => void ocupado(null, "", areaErro, async () => {
                await api.patch(`/usuarios/${m.id}`, { perfil: seletorPerfil.value });
                await carregar(`${m.nome} agora é ${ROTULO_PERFIL[seletorPerfil.value]}.`);
            }));
            if (!souEu) {
                if (m.ativo) {
                    const redefinir = h("button", { class: "btn btn--sm btn--fantasma", type: "button" }, "Redefinir senha");
                    redefinir.addEventListener("click", () => {
                        if (!window.confirm(`Gerar uma senha nova para ${m.nome}? A senha atual deixa de funcionar.`))
                            return;
                        const senha = gerarSenha();
                        void ocupado(redefinir, "Gerando…", areaErro, async () => {
                            await api.patch(`/usuarios/${m.id}`, { senha });
                            await carregar(`Senha de ${m.nome} redefinida.`, cartaoAcesso(m.nome, m.email, senha, "Nova senha"));
                        });
                    });
                    acoes.push(redefinir);
                }
                const ativar = h("button", { class: `btn btn--sm ${m.ativo ? "btn--perigo" : "btn--outline"}`, type: "button" }, m.ativo ? "Desativar" : "Reativar");
                ativar.addEventListener("click", () => {
                    if (m.ativo && !window.confirm(`Desativar ${m.nome}? A pessoa não conseguirá mais entrar no sistema.`))
                        return;
                    void ocupado(ativar, "Salvando…", areaErro, async () => {
                        await api.patch(`/usuarios/${m.id}`, { ativo: !m.ativo });
                        await carregar(`${m.nome} foi ${m.ativo ? "desativado(a)" : "reativado(a)"}.`);
                    });
                });
                acoes.push(ativar);
            }
            return h("li", { class: `membro${m.ativo ? "" : " membro--inativo"}` }, h("span", { class: `avatar avatar--${m.perfil.toLowerCase()}`, "aria-hidden": "true" }, iniciais(m.nome)), h("div", { class: "membro__principal" }, h("strong", { class: "membro__nome" }, m.nome, souEu && h("span", { class: "selo-voce" }, "Você")), h("span", { class: "item__sub" }, m.email)), h("span", { class: `situacao situacao--${m.ativo ? "ativo" : "inativo"}` }, m.ativo ? "Ativo" : "Inativo"), seletorPerfil, h("div", { class: "membro__acoes" }, acoes));
        };
        const ordem = { ADMIN: 0, ATENDENTE: 1, TECNICO: 2 };
        const ordenados = [...membros].sort((a, b) => Number(b.ativo) - Number(a.ativo) || ordem[a.perfil] - ordem[b.perfil] || a.nome.localeCompare(b.nome));
        preencher(el, cabecalhoTela("Equipe", recolhivel.botao), h("p", { class: "tela__sub" }, `${ativos.length} pessoa${ativos.length === 1 ? "" : "s"} ativa${ativos.length === 1 ? "" : "s"}${membros.length > ativos.length ? ` · ${membros.length - ativos.length} inativa(s)` : ""}`), aviso && caixaOk(aviso), acesso, areaErro, recolhivel.painel, h("div", { class: "perfis-resumo" }, PERFIS.map((p) => h("div", { class: `perfil-resumo perfil-resumo--${p.valor.toLowerCase()}` }, h("span", { class: "perfil-resumo__valor" }, conta(p.valor)), h("span", { class: "perfil-resumo__rotulo" }, `${p.titulo}${conta(p.valor) === 1 ? "" : p.valor === "ADMIN" ? "es" : "s"}`)))), conta("TECNICO") === 0 &&
            caixaAviso("Ainda não há técnico ativo. Adicione um para atribuir OS e usar o diagnóstico com o agente de IA."), h("ul", { class: "membros" }, ordenados.map(cartaoMembro)));
        if (membros.length === 1 && !aviso)
            recolhivel.abrir();
    };
    await carregar();
}
/** Formulário em etapas para adicionar alguém. Dispara o evento "fechar" ao cancelar. */
function formNovoMembro(aoCriar) {
    const nome = h("input", { name: "nome", required: true, minlength: 2, maxlength: 120, autocomplete: "off", placeholder: "Nome completo" });
    const email = h("input", { name: "email", type: "email", required: true, maxlength: 160, autocomplete: "off", placeholder: "pessoa@email.com" });
    const opcoesPerfil = h("div", { class: "perfis-escolha", role: "radiogroup", "aria-label": "Perfil" }, PERFIS.map((p) => h("label", { class: `perfil-opcao perfil-opcao--${p.valor.toLowerCase()}` }, h("input", { type: "radio", name: "perfil", value: p.valor, checked: p.valor === "TECNICO", required: true }), h("span", { class: "perfil-opcao__caixa" }, h("strong", {}, p.titulo), h("span", {}, p.descricao)))));
    const senha = h("input", { name: "senha", type: "password", required: true, minlength: 8, maxlength: 72, autocomplete: "new-password", placeholder: "Mínimo de 8 caracteres" });
    const mostrar = h("button", { class: "btn btn--sm btn--fantasma", type: "button", "aria-pressed": "false" }, "Mostrar");
    mostrar.addEventListener("click", () => {
        const visivel = senha.type === "password";
        senha.type = visivel ? "text" : "password";
        mostrar.textContent = visivel ? "Ocultar" : "Mostrar";
        mostrar.setAttribute("aria-pressed", String(visivel));
    });
    const gerar = h("button", { class: "btn btn--sm btn--outline", type: "button" }, "Gerar senha");
    gerar.addEventListener("click", () => {
        senha.value = gerarSenha();
        senha.type = "text";
        mostrar.textContent = "Ocultar";
        senha.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const medidor = h("span", { class: "forca" }, h("span", { class: "forca__barra" }));
    const textoForca = h("span", { class: "campo__ajuda" });
    // ----- Resumo -----
    const avatar = h("span", { class: "avatar avatar--grande", "aria-hidden": "true" }, "?");
    const rNome = h("dd", {}, "—");
    const rEmail = h("dd", {}, "—");
    const rPerfil = h("dd", {}, "Técnico");
    const areaErro = h("div", {});
    const botao = h("button", { class: "btn btn--primary btn--block", type: "submit" }, "Adicionar à equipe");
    const secao = h("section", { class: "novo-cliente" });
    const form = h("form", { class: "nova-os" }, h("div", { class: "nova-os__etapas" }, etapaForm(1, "Quem é", "O e-mail será o login da pessoa.", null, h("div", { class: "grade-2" }, h("label", { class: "campo" }, rotuloObrig("Nome"), nome), h("label", { class: "campo" }, rotuloObrig("E-mail"), email))), etapaForm(2, "Perfil", "Define o que a pessoa pode fazer no sistema. Dá para mudar depois.", null, opcoesPerfil), etapaForm(3, "Senha inicial", "Gere uma senha e envie para a pessoa. Ela pode trocar depois.", null, h("div", { class: "campo" }, rotuloObrig("Senha"), h("div", { class: "senha-linha" }, senha, mostrar, gerar), medidor, textoForca))), h("aside", { class: "resumo-os", "aria-label": "Resumo" }, h("div", { class: "resumo__cabeca" }, avatar, h("h2", {}, "Nova pessoa")), h("dl", { class: "resumo__lista" }, h("dt", {}, "Nome"), rNome, h("dt", {}, "E-mail"), rEmail, h("dt", {}, "Perfil"), rPerfil), botao, h("button", { class: "btn btn--sm btn--fantasma btn--block", type: "button", onClick: () => secao.dispatchEvent(new Event("fechar")) }, "Cancelar"), areaErro));
    const atualizar = () => {
        rNome.textContent = nome.value.trim() || "—";
        avatar.textContent = nome.value.trim() ? iniciais(nome.value) : "?";
        rEmail.textContent = email.value.trim() || "—";
        const perfil = (form.querySelector('input[name="perfil"]:checked')?.value ?? "TECNICO");
        rPerfil.textContent = ROTULO_PERFIL[perfil];
        avatar.className = `avatar avatar--grande avatar--${perfil.toLowerCase()}`;
        const f = forcaSenha(senha.value);
        medidor.dataset.nivel = String(f.nivel);
        textoForca.textContent = f.texto;
    };
    form.addEventListener("input", atualizar);
    form.addEventListener("change", atualizar);
    form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const d = new FormData(form);
        const v = (k) => String(d.get(k) ?? "").trim();
        void ocupado(botao, "Adicionando…", areaErro, async () => {
            await api.post("/usuarios", { nome: v("nome"), email: v("email"), perfil: v("perfil"), senha: String(d.get("senha") ?? "") });
            await aoCriar(v("nome"), v("email").toLowerCase(), String(d.get("senha") ?? ""));
        });
    });
    atualizar();
    secao.append(form);
    return secao;
}
