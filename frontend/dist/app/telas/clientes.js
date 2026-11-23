/** HU02 — Clientes e seus equipamentos. */
import { api, pode } from "../api.js";
import { aoEnviar, cabecalhoTela, caixaOk, campo, data, h, numeroOS, ocupado, ouNulo, paginador, preencher, tagStatus } from "../dom.js";
import { comMascara, etapaForm, painelRecolhivel, formatarCpf, formatarTelefone, iconeAparelho, iconeBusca, iniciais, linkWhatsApp, rotuloObrig } from "../componentes.js";
import { definirAviso, hashComFiltros, irPara } from "../nav.js";
const TIPOS = [
    { valor: "CELULAR", rotulo: "Celular" },
    { valor: "TABLET", rotulo: "Tablet" },
    { valor: "NOTEBOOK", rotulo: "Notebook" },
    { valor: "DESKTOP", rotulo: "Desktop" },
    { valor: "OUTRO", rotulo: "Outro" },
];
// ---------- Formulários reutilizados na criação e na edição ----------
function dadosCliente(d) {
    return { nome: d.nome, telefone: d.telefone, cpf: ouNulo(d.cpf), email: ouNulo(d.email), endereco: ouNulo(d.endereco) };
}
function formCliente(atual, salvar) {
    const form = h("form", { class: "form form--grade" }, campo({ rotulo: "Nome", nome: "nome", valor: atual?.nome, obrigatorio: true, atributos: { minlength: 2, maxlength: 120 } }), campo({ rotulo: "Telefone", nome: "telefone", tipo: "tel", valor: atual?.telefone, obrigatorio: true, ajuda: "Com DDD: 10 ou 11 dígitos." }), campo({ rotulo: "CPF", nome: "cpf", valor: atual?.cpf, ajuda: "Opcional: 11 dígitos." }), campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: atual?.email }), campo({ rotulo: "Endereço", nome: "endereco", valor: atual?.endereco, atributos: { maxlength: 255 } }), h("div", { class: "form__acoes" }, h("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Salvar cliente")));
    const tel = form.querySelector('input[name="telefone"]');
    const doc = form.querySelector('input[name="cpf"]');
    if (tel)
        comMascara(tel, formatarTelefone);
    if (doc)
        comMascara(doc, formatarCpf);
    aoEnviar(form, salvar);
    return form;
}
function dadosEquipamento(d) {
    return {
        tipo: d.tipo,
        marca: d.marca,
        modelo: d.modelo,
        imei: ouNulo(d.imei),
        numeroSerie: ouNulo(d.numeroSerie),
        cor: ouNulo(d.cor),
        observacoes: ouNulo(d.observacoes),
    };
}
function formEquipamento(atual, salvar) {
    const form = h("form", { class: "form form--grade" }, campo({ rotulo: "Tipo", nome: "tipo", valor: atual?.tipo ?? "CELULAR", obrigatorio: true, opcoes: TIPOS }), campo({ rotulo: "Marca", nome: "marca", valor: atual?.marca, obrigatorio: true, atributos: { maxlength: 60 } }), campo({ rotulo: "Modelo", nome: "modelo", valor: atual?.modelo, obrigatorio: true, atributos: { maxlength: 80 } }), campo({
        rotulo: "IMEI",
        nome: "imei",
        valor: atual?.imei,
        ajuda: "De 14 a 16 dígitos, sem espaços.",
        atributos: { inputmode: "numeric", pattern: "\\d{14,16}", title: "De 14 a 16 dígitos, sem espaços" },
    }), campo({ rotulo: "Nº de série", nome: "numeroSerie", valor: atual?.numeroSerie, atributos: { maxlength: 80 } }), campo({ rotulo: "Cor", nome: "cor", valor: atual?.cor, atributos: { maxlength: 40 } }), campo({ rotulo: "Observações", nome: "observacoes", valor: atual?.observacoes, linhas: 2 }), h("div", { class: "form__acoes" }, h("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Salvar equipamento")));
    aoEnviar(form, salvar);
    return form;
}
// ---------- Lista ----------
const MARCAS = ["Apple", "Samsung", "Motorola", "Xiaomi", "Realme", "LG", "Asus", "Lenovo", "Dell", "Acer", "HP", "Positivo", "Multilaser"];
export async function telaClientes(el, { consulta }) {
    const busca = consulta.get("busca") ?? "";
    const pagina = Number(consulta.get("pagina")) || 1;
    const listaArea = h("div", { class: "clientes-lista-area" });
    const contador = h("p", { class: "tela__sub" });
    const carregarLista = async (termo, pag) => {
        const q = new URLSearchParams({ pagina: String(pag) });
        if (termo)
            q.set("busca", termo);
        const r = await api.get(`/clientes?${q}`);
        contador.textContent = termo
            ? `${r.total} resultado(s) para "${termo}"`
            : `${r.total} cliente${r.total === 1 ? "" : "s"} cadastrado${r.total === 1 ? "" : "s"}`;
        listaArea.replaceChildren(r.dados.length === 0
            ? estadoVazio(termo)
            : h("ul", { class: "clientes-lista" }, r.dados.map(linhaCliente)), paginador(r.total, r.pagina, r.porPagina, (p) => hashComFiltros("#/clientes", { busca: termo, pagina: p })) ?? "");
    };
    // Busca enquanto digita (sem recarregar a tela)
    const entradaBusca = h("input", {
        type: "search",
        name: "busca",
        value: busca,
        placeholder: "Buscar por nome, CPF ou telefone…",
        "aria-label": "Buscar cliente",
        autocomplete: "off",
    });
    let atraso = 0;
    entradaBusca.addEventListener("input", () => {
        window.clearTimeout(atraso);
        atraso = window.setTimeout(() => {
            const termo = entradaBusca.value.trim();
            history.replaceState(null, "", hashComFiltros("#/clientes", { busca: termo }));
            void carregarLista(termo, 1);
        }, 300);
    });
    const barraBusca = h("div", { class: "barra-busca", role: "search" }, h("span", { class: "busca" }, iconeBusca(), entradaBusca));
    // Painel de novo cliente: abre e recolhe pelo botão do topo
    let recolhivel = null;
    if (pode.cadastrar())
        recolhivel = painelRecolhivel("Novo cliente", formNovoCliente(() => recolhivel?.fechar()));
    await carregarLista(busca, pagina);
    preencher(el, cabecalhoTela("Clientes", recolhivel?.botao), contador, recolhivel?.painel, barraBusca, listaArea);
    if (consulta.get("novo") === "1" || (!busca && listaArea.querySelector(".estado-vazio") !== null))
        recolhivel?.abrir();
}
function linhaCliente(c) {
    const zap = linkWhatsApp(c.telefone);
    return h("li", { class: "cliente-linha" }, h("span", { class: "avatar", "aria-hidden": "true" }, iniciais(c.nome)), h("div", { class: "cliente-linha__principal" }, h("a", { class: "cliente-linha__nome", href: `#/clientes/${c.id}` }, c.nome), h("span", { class: "item__sub" }, [c.cpf ? `CPF ${formatarCpf(c.cpf)}` : null, c.email].filter(Boolean).join(" · ") || "Sem CPF e e-mail")), h("div", { class: "cliente-linha__contato" }, h("span", { class: "mono" }, formatarTelefone(c.telefone)), zap && h("a", { class: "chip-zap", href: zap, target: "_blank", rel: "noopener", "aria-label": `Abrir WhatsApp de ${c.nome}` }, "WhatsApp")), h("div", { class: "cliente-linha__acoes" }, pode.abrirOS() && h("a", { class: "btn btn--outline btn--sm", href: `#/ordens/nova?clienteId=${c.id}` }, "Nova OS"), h("a", { class: "btn btn--sm btn--fantasma", href: `#/clientes/${c.id}`, "aria-label": `Ver ${c.nome}` }, "Ver →")));
}
function estadoVazio(termo) {
    return h("div", { class: "estado-vazio" }, h("span", { class: "estado-vazio__icone", "aria-hidden": "true" }, iconeBusca()), h("strong", {}, termo ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"), h("p", {}, termo ? "Confira a grafia ou busque pelo telefone ou CPF." : "Cadastre o primeiro cliente e o aparelho dele para abrir uma OS."));
}
/** Formulário em etapas: dados do cliente + aparelho (opcional) + resumo com as ações. */
function formNovoCliente(fechar) {
    const nome = h("input", { name: "nome", required: true, minlength: 2, maxlength: 120, placeholder: "Nome completo", autocomplete: "off" });
    const telefone = comMascara(h("input", { name: "telefone", type: "tel", required: true, inputmode: "numeric", placeholder: "(99) 99999-9999" }), formatarTelefone);
    const cpf = comMascara(h("input", { name: "cpf", inputmode: "numeric", placeholder: "000.000.000-00" }), formatarCpf);
    const email = h("input", { name: "email", type: "email", placeholder: "cliente@email.com" });
    const endereco = h("input", { name: "endereco", maxlength: 255, placeholder: "Rua, número, bairro" });
    const rotulo = (texto, obrig = false) => (obrig ? rotuloObrig(texto) : h("span", { class: "campo__rotulo" }, texto));
    const etapaDados = etapaForm(1, "Dados do cliente", "Nome e telefone são obrigatórios. O telefone é usado no WhatsApp.", null, h("label", { class: "campo" }, rotulo("Nome", true), nome), h("div", { class: "grade-2" }, h("label", { class: "campo" }, rotulo("Telefone (WhatsApp)", true), telefone), h("label", { class: "campo" }, rotulo("CPF"), cpf)), h("div", { class: "grade-2" }, h("label", { class: "campo" }, rotulo("E-mail"), email), h("label", { class: "campo" }, rotulo("Endereço"), endereco)));
    // ----- Aparelho (opcional) -----
    const comAparelho = h("input", { type: "checkbox", checked: true });
    const tipo = h("div", { class: "segmentado", role: "radiogroup", "aria-label": "Tipo de aparelho" }, TIPOS.map((t, i) => h("label", { class: "segmentado__opcao" }, h("input", { type: "radio", name: "tipo", value: t.valor, checked: i === 0 }), h("span", {}, iconeAparelho(t.valor), t.rotulo))));
    const marca = h("input", { name: "marca", maxlength: 60, list: "lista-marcas", placeholder: "Ex.: Apple, Samsung", autocomplete: "off" });
    const modelo = h("input", { name: "modelo", maxlength: 80, placeholder: "Ex.: iPhone 11, Galaxy A12" });
    const imei = h("input", { name: "imei", inputmode: "numeric", pattern: "\\d{14,16}", title: "De 14 a 16 dígitos, sem espaços", placeholder: "Discar *#06# no aparelho" });
    const cor = h("input", { name: "cor", maxlength: 40, placeholder: "Ex.: Preto" });
    const camposAparelho = h("div", { class: "etapa-form__corpo-interno" }, h("div", { class: "campo" }, rotulo("Tipo"), tipo), h("div", { class: "grade-2" }, h("label", { class: "campo" }, rotulo("Marca", true), marca, h("datalist", { id: "lista-marcas" }, MARCAS.map((m) => h("option", { value: m })))), h("label", { class: "campo" }, rotulo("Modelo", true), modelo)), h("div", { class: "grade-2" }, h("label", { class: "campo" }, rotulo("IMEI"), imei, h("span", { class: "campo__ajuda" }, "Opcional. 14 a 16 dígitos.")), h("label", { class: "campo" }, rotulo("Cor"), cor)));
    const atualizarAparelho = () => {
        camposAparelho.hidden = !comAparelho.checked;
        marca.required = modelo.required = comAparelho.checked;
    };
    comAparelho.addEventListener("change", atualizarAparelho);
    const etapaAparelho = etapaForm(2, "Aparelho", "Já cadastre o aparelho que chegou para conserto.", h("label", { class: "interruptor" }, comAparelho, h("span", { class: "interruptor__trilho", "aria-hidden": "true" }), h("span", {}, "Cadastrar agora")), camposAparelho);
    // ----- Resumo -----
    const linha = (r) => {
        const dd = h("dd", {}, "—");
        return { dd, itens: [h("dt", {}, r), dd] };
    };
    const rNome = linha("Cliente");
    const rTel = linha("Telefone");
    const rApar = linha("Aparelho");
    const avatar = h("span", { class: "avatar avatar--grande", "aria-hidden": "true" }, "?");
    const areaErro = h("div", {});
    const botaoSalvar = h("button", { class: "btn btn--outline btn--block", type: "submit", value: "salvar" }, "Salvar cliente");
    const botaoOS = pode.abrirOS() ? h("button", { class: "btn btn--primary btn--block", type: "submit", value: "os" }, "Salvar e abrir OS") : null;
    const atualizarResumo = () => {
        rNome.dd.textContent = nome.value.trim() || "—";
        avatar.textContent = nome.value.trim() ? iniciais(nome.value) : "?";
        rTel.dd.textContent = telefone.value || "—";
        const ap = [marca.value.trim(), modelo.value.trim()].filter(Boolean).join(" ");
        rApar.dd.textContent = comAparelho.checked ? ap || "—" : "Cadastrar depois";
    };
    const form = h("form", { class: "nova-os" }, h("div", { class: "nova-os__etapas" }, etapaDados, etapaAparelho), h("aside", { class: "resumo-os", "aria-label": "Resumo do cadastro" }, h("div", { class: "resumo__cabeca" }, avatar, h("h2", {}, "Novo cliente")), h("dl", { class: "resumo__lista" }, rNome.itens, rTel.itens, rApar.itens), botaoOS, botaoSalvar, h("button", { class: "btn btn--sm btn--fantasma btn--block", type: "button", onClick: fechar }, "Cancelar"), areaErro));
    form.addEventListener("input", atualizarResumo);
    form.addEventListener("change", atualizarResumo);
    form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const acao = ev.submitter?.getAttribute("value") ?? "salvar";
        const botao = acao === "os" && botaoOS ? botaoOS : botaoSalvar;
        const d = new FormData(form);
        const v = (k) => String(d.get(k) ?? "").trim();
        void ocupado(botao, "Salvando…", areaErro, async () => {
            const criado = await api.post("/clientes", dadosCliente({ nome: v("nome"), telefone: v("telefone"), cpf: v("cpf"), email: v("email"), endereco: v("endereco") }));
            let equipamentoId = null;
            if (comAparelho.checked) {
                try {
                    const eq = await api.post("/equipamentos", {
                        clienteId: criado.id,
                        ...dadosEquipamento({ tipo: v("tipo"), marca: v("marca"), modelo: v("modelo"), imei: v("imei"), numeroSerie: "", cor: v("cor"), observacoes: "" }),
                    });
                    equipamentoId = eq.id;
                }
                catch (e) {
                    definirAviso({ tipo: "erro", texto: `Cliente salvo, mas o aparelho não: ${e instanceof Error ? e.message : "erro"}. Cadastre o aparelho abaixo.` });
                    irPara(`#/clientes/${criado.id}`);
                    return;
                }
            }
            if (acao === "os") {
                irPara(`#/ordens/nova?clienteId=${criado.id}${equipamentoId ? `&equipamentoId=${equipamentoId}` : ""}`);
            }
            else {
                definirAviso({ tipo: "ok", texto: `Cliente ${criado.nome} cadastrado${equipamentoId ? " com o aparelho" : ""}.` });
                irPara(`#/clientes/${criado.id}`);
            }
        });
    });
    atualizarAparelho();
    atualizarResumo();
    return h("section", { class: "novo-cliente" }, form);
}
// ---------- Detalhe ----------
export async function telaCliente(el, { params }) {
    const id = Number(params[0]);
    const carregar = async (aviso) => {
        const c = await api.get(`/clientes/${id}`);
        const nomeEquipamento = (equipamentoId) => {
            const eq = c.equipamentos.find((e) => e.id === equipamentoId);
            return eq ? `${eq.marca} ${eq.modelo}` : "—";
        };
        preencher(el, cabecalhoTela(c.nome, pode.abrirOS() && h("a", { class: "btn btn--primary btn--sm", href: `#/ordens/nova?clienteId=${c.id}` }, "Abrir OS")), aviso && caixaOk(aviso), h("section", { class: "painel" }, h("h2", {}, "Dados do cliente"), pode.cadastrar()
            ? formCliente(c, async (d) => {
                await api.patch(`/clientes/${c.id}`, dadosCliente(d));
                await carregar("Cliente atualizado.");
            })
            : h("dl", { class: "dados" }, h("dt", {}, "Telefone"), h("dd", {}, c.telefone), h("dt", {}, "CPF"), h("dd", {}, c.cpf ?? "—"), h("dt", {}, "E-mail"), h("dd", {}, c.email ?? "—"), h("dt", {}, "Endereço"), h("dd", {}, c.endereco ?? "—"))), h("section", { class: "painel" }, h("h2", {}, "Equipamentos"), c.equipamentos.length === 0 && h("p", { class: "vazio" }, "Nenhum equipamento cadastrado para este cliente."), h("ul", { class: "lista-itens" }, c.equipamentos.map((eq) => h("li", { class: "item" }, h("div", { class: "item__topo" }, h("div", {}, h("strong", {}, `${eq.marca} ${eq.modelo}`), h("p", { class: "item__sub" }, [TIPOS.find((t) => t.valor === eq.tipo)?.rotulo, eq.imei && `IMEI ${eq.imei}`, eq.numeroSerie && `Série ${eq.numeroSerie}`, eq.cor]
            .filter(Boolean)
            .join(" · "))), pode.abrirOS() &&
            h("a", { class: "btn btn--outline btn--sm", href: `#/ordens/nova?clienteId=${c.id}&equipamentoId=${eq.id}` }, "Abrir OS")), h("details", { class: "dobra" }, h("summary", {}, "Editar equipamento"), formEquipamento(eq, async (d) => {
            await api.patch(`/equipamentos/${eq.id}`, dadosEquipamento(d));
            await carregar("Equipamento atualizado.");
        }))))), pode.cadastrar() &&
            h("details", { class: "dobra", open: c.equipamentos.length === 0 }, h("summary", {}, "Adicionar equipamento"), formEquipamento(null, async (d) => {
                await api.post("/equipamentos", { ...dadosEquipamento(d), clienteId: c.id });
                await carregar("Equipamento adicionado.");
            }))), h("section", { class: "painel" }, h("h2", {}, "Ordens de Serviço"), c.ordens.length === 0
            ? h("p", { class: "vazio" }, "Nenhuma OS aberta para este cliente.")
            : h("ul", { class: "lista-itens" }, c.ordens.map((o) => h("li", { class: "item item__topo" }, h("div", {}, h("a", { href: `#/ordens/${o.id}` }, numeroOS(o.numero)), h("p", { class: "item__sub" }, `${nomeEquipamento(o.equipamentoId)} · entrada em ${data(o.createdAt)}`)), tagStatus(o.status))))));
    };
    await carregar();
}
