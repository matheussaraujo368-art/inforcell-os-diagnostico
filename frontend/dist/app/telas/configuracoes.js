/**
 * Configurações da empresa — chave e modelo do assistente de IA (Anthropic).
 * Só o administrador acessa. A chave é enviada uma vez, testada e guardada criptografada no
 * servidor; esta tela nunca recebe a chave completa de volta.
 */
import { api, pode } from "../api.js";
import { cabecalhoTela, caixaAviso, caixaOk, campo, h, ocupado, preencher } from "../dom.js";
/** Modelos devolvidos pelo último teste da chave (lista real da conta). */
let modelosDaConta = [];
function descricaoOrigem(s) {
    if (s.origem === "empresa")
        return h("span", { class: "etiqueta etiqueta--finalizado" }, "Ativo · chave da empresa");
    if (s.origem === "servidor")
        return h("span", { class: "etiqueta etiqueta--em_diagnostico" }, "Ativo · chave do servidor");
    return h("span", { class: "etiqueta etiqueta--cancelado" }, "Desativado");
}
export async function telaConfiguracoes(el) {
    if (!pode.configurar()) {
        preencher(el, cabecalhoTela("Configurações"), caixaAviso("Somente o administrador pode alterar as configurações."));
        return;
    }
    const carregar = async (situacao, aviso) => {
        const s = situacao ?? (await api.get("/configuracoes/ia"));
        const areaErro = h("div", {});
        // ----- formulário: chave + modelo -----
        const opcoesModelo = [...new Set([s.modelo, ...(modelosDaConta.length ? modelosDaConta : s.modelosSugeridos)])];
        const campoChave = campo({
            rotulo: s.chaveMascarada ? "Trocar a chave da API" : "Chave da API da Anthropic",
            nome: "chave",
            tipo: "password",
            obrigatorio: !s.chaveMascarada && !s.servidorTemChave,
            ajuda: s.chaveMascarada ? "Deixe em branco para manter a chave atual." : 'Começa com "sk-ant-". Veja abaixo como criar.',
            atributos: { autocomplete: "off", spellcheck: "false", placeholder: "sk-ant-api03-…", maxlength: 300 },
        });
        const campoModelo = campo({
            rotulo: "Modelo",
            nome: "modelo",
            valor: s.modelo,
            opcoes: opcoesModelo.map((m) => ({ valor: m, rotulo: m === s.modeloPadrao ? `${m} (padrão)` : m })),
            ajuda: "Sonnet equilibra qualidade e custo. Opus é o mais capaz e mais caro. Haiku é o mais rápido e barato.",
        });
        const botaoSalvar = h("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Salvar e testar");
        const form = h("form", { class: "form" }, campoChave, campoModelo, h("div", { class: "form__acoes" }, botaoSalvar));
        form.addEventListener("submit", (ev) => {
            ev.preventDefault();
            const dados = new FormData(form);
            const chave = String(dados.get("chave") ?? "").trim();
            const modelo = String(dados.get("modelo") ?? "").trim();
            void ocupado(botaoSalvar, "Testando a chave…", areaErro, async () => {
                const r = await api.put("/configuracoes/ia", { ...(chave ? { chave } : {}), modelo });
                modelosDaConta = r.teste.modelos;
                await carregar(r, `Tudo certo! A IA respondeu usando o modelo ${r.teste.nomeModelo}.`);
            });
        });
        // ----- ações rápidas -----
        const botaoTestar = h("button", { class: "btn btn--outline btn--sm", type: "button" }, "Testar conexão");
        botaoTestar.addEventListener("click", () => void ocupado(botaoTestar, "Testando…", areaErro, async () => {
            const r = await api.post("/configuracoes/ia/testar");
            modelosDaConta = r.modelos;
            await carregar(undefined, `Conexão funcionando com o modelo ${r.nomeModelo}.`);
        }));
        const botaoRemover = h("button", { class: "btn btn--perigo btn--sm", type: "button" }, "Remover chave");
        botaoRemover.addEventListener("click", () => {
            if (!window.confirm("Remover a chave de IA desta empresa? O diagnóstico com IA deixará de funcionar até cadastrar outra."))
                return;
            void ocupado(botaoRemover, "Removendo…", areaErro, async () => {
                modelosDaConta = [];
                await carregar(await api.delete("/configuracoes/ia/chave"), "Chave removida.");
            });
        });
        preencher(el, cabecalhoTela("Configurações"), aviso && caixaOk(aviso), areaErro, s.chaveIlegivel &&
            caixaAviso("A chave salva não pôde ser lida porque o segredo do servidor mudou. Cadastre a chave de novo."), h("div", { class: "colunas" }, h("div", { class: "colunas__principal" }, h("section", { class: "painel" }, h("div", { class: "item__topo" }, h("h2", {}, "Assistente de IA"), descricaoOrigem(s)), h("dl", { class: "dados dados--compacto" }, h("dt", {}, "Chave"), h("dd", { class: "mono" }, s.chaveMascarada ?? (s.origem === "servidor" ? "Chave do servidor (configurada no Render)" : "Nenhuma")), h("dt", {}, "Modelo"), h("dd", { class: "mono" }, s.modelo)), s.origem !== null && h("div", { class: "form__acoes config-acoes" }, botaoTestar, s.chaveMascarada && botaoRemover)), h("section", { class: "painel" }, h("h2", {}, s.chaveMascarada ? "Alterar" : "Cadastrar chave"), form)), h("aside", { class: "colunas__lado" }, h("section", { class: "painel" }, h("h2", {}, "Como conseguir a chave"), h("ol", { class: "passos" }, h("li", {}, "Entre em ", h("a", { href: "https://console.anthropic.com", target: "_blank", rel: "noopener" }, "console.anthropic.com"), " e crie uma conta."), h("li", {}, "Em ", h("strong", {}, "Billing"), ", adicione créditos. A API é paga por uso."), h("li", {}, "Em ", h("strong", {}, "API Keys"), ", clique em ", h("strong", {}, "Create Key"), " e copie a chave."), h("li", {}, "Cole aqui e clique em ", h("strong", {}, "Salvar e testar"), "."))), h("section", { class: "painel" }, h("h2", {}, "Segurança e privacidade"), h("ul", { class: "lista-simples" }, h("li", {}, "A chave fica criptografada no servidor e não aparece mais depois de salva."), h("li", {}, "Só o administrador vê esta tela."), h("li", {}, "O nome do cliente nunca é enviado à IA. CPF, telefone e e-mail digitados são removidos antes (LGPD)."))))));
    };
    await carregar();
}
