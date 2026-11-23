/**
 * Configurações da empresa — chave e modelo do assistente de IA (Anthropic).
 * Só o administrador acessa. A chave é enviada uma vez, testada e guardada criptografada no
 * servidor; esta tela nunca recebe a chave completa de volta.
 */
import { api, ModeloCatalogo, pode, SituacaoIA, TesteIA } from "../api.js";
import { cabecalhoTela, caixaAviso, caixaOk, campo, h, ocupado, preencher } from "../dom.js";

/** Modelos devolvidos pelo último teste da chave (lista real da conta). */
let modelosDaConta: string[] = [];

function descricaoOrigem(s: SituacaoIA): HTMLElement {
  if (s.origem === "empresa") return h("span", { class: "etiqueta etiqueta--finalizado" }, "Ativo · chave da empresa");
  if (s.origem === "servidor") return h("span", { class: "etiqueta etiqueta--em_diagnostico" }, "Ativo · chave do servidor");
  return h("span", { class: "etiqueta etiqueta--cancelado" }, "Desativado");
}

/** Custo estimado de um diagnóstico completo (~4 respostas com consultas): ~60 mil tokens de entrada e ~6 mil de saída. */
const custoDiagnostico = (m: ModeloCatalogo): number => (60_000 * m.entrada + 6_000 * m.saida) / 1_000_000;
const dolar = (v: number): string =>
  `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v < 0.1 ? 3 : 2, maximumFractionDigits: v < 0.1 ? 3 : 2 })}`;
const precoCurto = (m: ModeloCatalogo): string => `US$ ${m.entrada.toLocaleString("pt-BR")} / ${m.saida.toLocaleString("pt-BR")}`;

/** Seletor agrupado + cartão com os detalhes do modelo escolhido. */
function seletorModelo(s: SituacaoIA): HTMLElement {
  const conhecidos = new Set(s.catalogo.map((m) => m.id));
  const daConta = new Set(modelosDaConta);
  const disponivel = (id: string): boolean => modelosDaConta.length === 0 || daConta.has(id);
  const opcao = (m: ModeloCatalogo): HTMLElement =>
    h(
      "option",
      { value: m.id, disabled: !disponivel(m.id) && m.id !== s.modelo },
      `${m.id === s.modeloPadrao ? "★ " : ""}${m.nome}${m.id === s.modeloPadrao ? " (recomendado)" : ""} — ${precoCurto(m)}${disponivel(m.id) ? "" : " · indisponível nesta chave"}`,
    );
  const extras = [...new Set([s.modelo, ...modelosDaConta])].filter((id) => !conhecidos.has(id));
  const select = h(
    "select",
    { name: "modelo", id: "config-modelo" },
    h("optgroup", { label: "Atuais (recomendados)" }, s.catalogo.filter((m) => m.grupo === "atual").map(opcao)),
    h("optgroup", { label: "Gerações anteriores (não recomendadas)" }, s.catalogo.filter((m) => m.grupo === "anterior").map(opcao)),
    extras.length > 0 && h("optgroup", { label: "Outros disponíveis na sua chave" }, extras.map((id) => h("option", { value: id }, id))),
  ) as HTMLSelectElement;
  select.value = s.modelo;

  const detalhe = h("div", { class: "modelo-detalhe", "aria-live": "polite" });
  const atualizar = (): void => {
    const m = s.catalogo.find((x) => x.id === select.value);
    if (!m) {
      detalhe.replaceChildren(h("p", { class: "item__sub" }, "Modelo fora do catálogo: preço e detalhes no console da Anthropic."));
      return;
    }
    detalhe.replaceChildren(
      h(
        "div",
        { class: "modelo-detalhe__topo" },
        h("strong", {}, m.nome),
        h("span", { class: `selo-modelo selo-modelo--${m.grupo}` }, m.grupo === "atual" ? "Atual" : "Geração anterior"),
        m.id === s.modeloPadrao && h("span", { class: "selo-modelo selo-modelo--atual" }, "★ Recomendado"),
        h("span", { class: "selo-modelo" }, m.velocidade),
      ),
      h("p", {}, m.descricao),
      h(
        "dl",
        { class: "modelo-detalhe__numeros" },
        h("div", {}, h("dt", {}, "Entrada"), h("dd", {}, `US$ ${m.entrada.toLocaleString("pt-BR")}`), h("span", {}, "por milhão de tokens")),
        h("div", {}, h("dt", {}, "Saída"), h("dd", {}, `US$ ${m.saida.toLocaleString("pt-BR")}`), h("span", {}, "por milhão de tokens")),
        h("div", { class: "modelo-detalhe__destaque" }, h("dt", {}, "Diagnóstico completo"), h("dd", {}, `≈ ${dolar(custoDiagnostico(m))}`), h("span", {}, "estimativa")),
      ),
    );
  };
  select.addEventListener("change", atualizar);
  atualizar();

  return h(
    "div",
    { class: "campo" },
    h("label", { class: "campo__rotulo", for: "config-modelo" }, "Modelo"),
    select,
    detalhe,
    h(
      "span",
      { class: "campo__ajuda" },
      modelosDaConta.length
        ? "A lista foi conferida com a sua chave. Valores do site da Anthropic; o custo real aparece em console.anthropic.com > Usage."
        : "Clique em Testar conexão para conferir quais modelos a sua chave pode usar.",
    ),
  );
}

export async function telaConfiguracoes(el: HTMLElement): Promise<void> {
  if (!pode.configurar()) {
    preencher(el, cabecalhoTela("Configurações"), caixaAviso("Somente o administrador pode alterar as configurações."));
    return;
  }

  const carregar = async (situacao?: SituacaoIA, aviso?: string): Promise<void> => {
    const s = situacao ?? (await api.get<SituacaoIA>("/configuracoes/ia"));
    const areaErro = h("div", {});

    // ----- formulário: chave + modelo -----
    const campoChave = campo({
      rotulo: s.chaveMascarada ? "Trocar a chave da API" : "Chave da API da Anthropic",
      nome: "chave",
      tipo: "password",
      obrigatorio: !s.chaveMascarada && !s.servidorTemChave,
      ajuda: s.chaveMascarada ? "Deixe em branco para manter a chave atual." : 'Começa com "sk-ant-". Veja abaixo como criar.',
      atributos: { autocomplete: "off", spellcheck: "false", placeholder: "sk-ant-api03-…", maxlength: 300 },
    });
    const campoModelo = seletorModelo(s);
    const botaoSalvar = h("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Salvar e testar");
    const form = h("form", { class: "form" }, campoChave, campoModelo, h("div", { class: "form__acoes" }, botaoSalvar));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const dados = new FormData(form);
      const chave = String(dados.get("chave") ?? "").trim();
      const modelo = String(dados.get("modelo") ?? "").trim();
      void ocupado(botaoSalvar, "Testando a chave…", areaErro, async () => {
        const r = await api.put<SituacaoIA & { teste: TesteIA }>("/configuracoes/ia", { ...(chave ? { chave } : {}), modelo });
        modelosDaConta = r.teste.modelos;
        await carregar(r, `Tudo certo! A IA respondeu usando o modelo ${r.teste.nomeModelo}.`);
      });
    });

    // ----- ações rápidas -----
    const botaoTestar = h("button", { class: "btn btn--outline btn--sm", type: "button" }, "Testar conexão");
    botaoTestar.addEventListener("click", () =>
      void ocupado(botaoTestar, "Testando…", areaErro, async () => {
        const r = await api.post<TesteIA>("/configuracoes/ia/testar");
        modelosDaConta = r.modelos;
        await carregar(undefined, `Conexão funcionando com o modelo ${r.nomeModelo}.`);
      }),
    );
    const botaoRemover = h("button", { class: "btn btn--perigo btn--sm", type: "button" }, "Remover chave");
    botaoRemover.addEventListener("click", () => {
      if (!window.confirm("Remover a chave de IA desta empresa? O diagnóstico com IA deixará de funcionar até cadastrar outra.")) return;
      void ocupado(botaoRemover, "Removendo…", areaErro, async () => {
        modelosDaConta = [];
        await carregar(await api.delete<SituacaoIA>("/configuracoes/ia/chave"), "Chave removida.");
      });
    });

    preencher(
      el,
      cabecalhoTela("Configurações"),
      aviso && caixaOk(aviso),
      areaErro,
      s.chaveIlegivel &&
        caixaAviso("A chave salva não pôde ser lida porque o segredo do servidor mudou. Cadastre a chave de novo."),
      h(
        "div",
        { class: "colunas" },
        h(
          "div",
          { class: "colunas__principal" },
          h(
            "section",
            { class: "painel" },
            h("div", { class: "item__topo" }, h("h2", {}, "Assistente de IA"), descricaoOrigem(s)),
            h(
              "dl",
              { class: "dados dados--compacto" },
              h("dt", {}, "Chave"),
              h(
                "dd",
                { class: "mono" },
                s.chaveMascarada ?? (s.origem === "servidor" ? "Chave do servidor (configurada no Render)" : "Nenhuma"),
              ),
              h("dt", {}, "Modelo"),
              h("dd", { class: "mono" }, s.modelo),
            ),
            s.origem !== null && h("div", { class: "form__acoes config-acoes" }, botaoTestar, s.chaveMascarada && botaoRemover),
          ),
          h("section", { class: "painel" }, h("h2", {}, s.chaveMascarada ? "Alterar" : "Cadastrar chave"), form),
        ),
        h(
          "aside",
          { class: "colunas__lado" },
          h(
            "section",
            { class: "painel" },
            h("h2", {}, "Como conseguir a chave"),
            h(
              "ol",
              { class: "passos" },
              h("li", {}, "Entre em ", h("a", { href: "https://console.anthropic.com", target: "_blank", rel: "noopener" }, "console.anthropic.com"), " e crie uma conta."),
              h("li", {}, "Em ", h("strong", {}, "Billing"), ", adicione créditos. A API é paga por uso."),
              h("li", {}, "Em ", h("strong", {}, "API Keys"), ", clique em ", h("strong", {}, "Create Key"), " e copie a chave."),
              h("li", {}, "Cole aqui e clique em ", h("strong", {}, "Salvar e testar"), "."),
            ),
          ),
          h(
            "section",
            { class: "painel" },
            h("h2", {}, "Segurança e privacidade"),
            h(
              "ul",
              { class: "lista-simples" },
              h("li", {}, "A chave fica criptografada no servidor e não aparece mais depois de salva."),
              h("li", {}, "Só o administrador vê esta tela."),
              h("li", {}, "O nome do cliente nunca é enviado à IA. CPF, telefone e e-mail digitados são removidos antes (LGPD)."),
            ),
          ),
        ),
      ),
    );
  };

  await carregar();
}
