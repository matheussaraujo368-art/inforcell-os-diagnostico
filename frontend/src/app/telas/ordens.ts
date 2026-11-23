/** HU03/HU04 — Lista, abertura e acompanhamento das Ordens de Serviço. */
import {
  api,
  Cliente,
  iaDisponivel,
  Equipamento,
  OrdemDetalhe,
  OrdemResumo,
  Pagina,
  pode,
  SessaoDiagnostico,
  StatusOS,
  usuarioAtual,
} from "../api.js";
import {
  aoEnviar,
  cabecalhoTela,
  avisoIAIndisponivel,
  caixaAviso,
  caixaOk,
  campo,
  data,
  dataHora,
  dataParaIso,
  h,
  isoParaData,
  moeda,
  numeroOS,
  ocupado,
  ouNulo,
  paginador,
  paraNumero,
  preencher,
  ROTULO_STATUS,
  tagStatus,
} from "../dom.js";
import { campoFoto } from "../foto.js";
import { acrescentarTexto, atalhos, etapaForm, iconeAparelho, iconeBusca, ROTULO_TIPO, rotuloObrig } from "../componentes.js";
import { definirAviso, hashComFiltros, irPara } from "../nav.js";
import type { ContextoTela } from "../main.js";

// ---------- Lista ----------

export async function telaOrdens(el: HTMLElement, { consulta }: ContextoTela): Promise<void> {
  const busca = consulta.get("busca") ?? "";
  const status = consulta.get("status") ?? "";
  const pagina = Number(consulta.get("pagina")) || 1;
  const q = new URLSearchParams({ pagina: String(pagina) });
  if (busca) q.set("busca", busca);
  if (status) q.set("status", status);
  const r = await api.get<Pagina<OrdemResumo>>(`/ordens?${q}`);

  const filtro = h(
    "form",
    { class: "filtros", role: "search" },
    campo({ rotulo: "Buscar por nº da OS, cliente, IMEI ou modelo", nome: "busca", tipo: "search", valor: busca }),
    campo({
      rotulo: "Status",
      nome: "status",
      valor: status,
      opcoes: [
        { valor: "", rotulo: "Todos" },
        ...(Object.keys(ROTULO_STATUS) as StatusOS[]).map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] })),
      ],
    }),
    h("button", { class: "btn btn--outline btn--sm", type: "submit" }, "Filtrar"),
  );
  aoEnviar(filtro, async (d) => irPara(hashComFiltros("#/ordens", { busca: d.busca, status: d.status })));

  preencher(el,
    cabecalhoTela("Ordens de Serviço", pode.abrirOS() && h("a", { class: "btn btn--primary btn--sm", href: "#/ordens/nova" }, "Nova OS")),
    filtro,
    r.dados.length === 0
      ? h("p", { class: "vazio" }, busca || status ? "Nenhuma OS encontrada com estes filtros." : "Nenhuma OS aberta até agora.")
      : h(
          "div",
          { class: "tabela" },
          h(
            "table",
            {},
            h(
              "thead",
              {},
              h("tr", {}, ["Nº", "Cliente", "Equipamento", "Técnico", "Status", "Entrada"].map((t) => h("th", {}, t))),
            ),
            h(
              "tbody",
              {},
              r.dados.map((o) =>
                h(
                  "tr",
                  {},
                  h("td", {}, h("a", { href: `#/ordens/${o.id}` }, numeroOS(o.numero))),
                  h("td", {}, o.cliente.nome),
                  h("td", {}, `${o.equipamento.marca} ${o.equipamento.modelo}`),
                  h("td", {}, o.tecnico?.nome ?? "Sem técnico"),
                  h("td", {}, tagStatus(o.status)),
                  h("td", {}, data(o.createdAt)),
                ),
              ),
            ),
          ),
        ),
    paginador(r.total, r.pagina, r.porPagina, (p) => hashComFiltros("#/ordens", { busca, status, pagina: p })),
  );
}

// ---------- Abertura ----------

export async function telaNovaOrdem(el: HTMLElement, { consulta }: ContextoTela): Promise<void> {
  if (!pode.abrirOS()) {
    preencher(el,cabecalhoTela("Nova OS"), caixaAviso("Somente atendente ou administrador pode abrir uma OS."));
    return;
  }

  const clienteInicial = Number(consulta.get("clienteId")) || null;
  const equipamentoInicial = Number(consulta.get("equipamentoId")) || null;
  const tecnicos = await api.get<{ id: number; nome: string }[]>("/usuarios/tecnicos");

  const seletorCliente = h("select", { name: "clienteId", required: true });
  const seletorEquipamento = h("select", { name: "equipamentoId", required: true, disabled: true });
  const avisoEquipamento = h("span", { "aria-live": "polite" });

  let equipamentosAtuais: Equipamento[] = [];
  const carregarEquipamentos = async (preferido: number | null): Promise<void> => {
    const clienteId = Number(seletorCliente.value);
    equipamentosAtuais = [];
    avisoEquipamento.replaceChildren();
    if (!clienteId) {
      seletorEquipamento.replaceChildren(h("option", { value: "" }, "Escolha o cliente primeiro"));
      seletorEquipamento.disabled = true;
      return;
    }
    const lista = await api.get<Equipamento[]>(`/equipamentos?clienteId=${clienteId}`);
    equipamentosAtuais = lista;
    seletorEquipamento.replaceChildren(
      h("option", { value: "" }, lista.length ? "Selecione o equipamento" : "Nenhum equipamento cadastrado"),
      ...lista.map((e) => h("option", { value: e.id }, `${e.marca} ${e.modelo}${e.imei ? ` · IMEI ${e.imei}` : ""}`)),
    );
    seletorEquipamento.disabled = lista.length === 0;
    if (preferido && lista.some((e) => e.id === preferido)) seletorEquipamento.value = String(preferido);
    else if (lista.length === 1) seletorEquipamento.value = String(lista[0].id);
    if (lista.length === 0) {
      avisoEquipamento.replaceChildren(
        h("span", { class: "campo__ajuda" }, "Este cliente ainda não tem equipamento. ", h("a", { href: `#/clientes/${clienteId}` }, "Cadastrar equipamento")),
      );
    }
    seletorEquipamento.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const carregarClientes = async (busca: string, preferido: number | null): Promise<void> => {
    const q = new URLSearchParams({ porPagina: "100" });
    if (busca) q.set("busca", busca);
    const r = await api.get<Pagina<Cliente>>(`/clientes?${q}`);
    const lista = [...r.dados];
    if (preferido && !lista.some((c) => c.id === preferido)) lista.unshift(await api.get<Cliente>(`/clientes/${preferido}`));
    seletorCliente.replaceChildren(
      h("option", { value: "" }, lista.length ? "Selecione o cliente" : "Nenhum cliente encontrado"),
      ...lista.map((c) => h("option", { value: c.id }, `${c.nome} · ${c.telefone}`)),
    );
    if (preferido) seletorCliente.value = String(preferido);
    else if (lista.length === 1) seletorCliente.value = String(lista[0].id);
    await carregarEquipamentos(equipamentoInicial);
  };

  const areaErroCarga = h("div", {});
  seletorCliente.addEventListener("change", () => {
    void ocupado(null, "", areaErroCarga, () => carregarEquipamentos(null));
  });

  let atraso = 0;
  const buscaCliente = h("input", {
    type: "search",
    placeholder: "Digite nome, CPF ou telefone",
    onInput: () => {
      window.clearTimeout(atraso);
      atraso = window.setTimeout(() => {
        void ocupado(null, "", areaErroCarga, () => carregarClientes(buscaCliente.value.trim(), null));
      }, 300);
    },
  });

  // ---------- Etapa 1: cliente ----------
  buscaCliente.classList.add("busca__entrada");
  const etapaCliente = etapaForm(
    1,
    "Cliente",
    "Busque pelo nome, CPF ou telefone e selecione.",
    h("a", { class: "btn btn--outline btn--sm", href: "#/clientes" }, "+ Novo cliente"),
    h(
      "div",
      { class: "grade-2" },
      h("label", { class: "campo" }, h("span", { class: "campo__rotulo" }, "Buscar"), h("span", { class: "busca" }, iconeBusca(), buscaCliente)),
      h("label", { class: "campo" }, rotuloObrig("Cliente"), seletorCliente),
    ),
  );

  // ---------- Etapa 2: aparelho ----------
  const fichaAparelho = h("div", { class: "ficha-aparelho", hidden: true });
  const etapaAparelho = etapaForm(
    2,
    "Aparelho",
    "Os aparelhos do cliente aparecem aqui.",
    null,
    h("label", { class: "campo" }, rotuloObrig("Equipamento"), seletorEquipamento, avisoEquipamento),
    fichaAparelho,
  );

  // ---------- Etapa 3: defeito e recebimento ----------
  const defeito = h("textarea", {
    name: "defeitoRelatado",
    required: true,
    minlength: 3,
    rows: 4,
    placeholder: "Descreva o que o cliente relatou. Ex.: não liga depois que caiu; tela com listras…",
  }) as HTMLTextAreaElement;
  const acessorios = h("input", { name: "acessorios", maxlength: 255, placeholder: "Capa, chip, carregador…" }) as HTMLInputElement;
  const etapaDefeito = etapaForm(
    3,
    "Defeito e recebimento",
    "Toque nos atalhos para preencher mais rápido.",
    null,
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo", for: "nova-os-defeito" }, "Defeito relatado", h("span", { class: "campo__obrig", "aria-hidden": "true" }, " *")),
      atalhos(["Não liga", "Não carrega", "Tela quebrada", "Touch não funciona", "Sem áudio", "Molhou", "Bateria viciada", "Reiniciando", "Sem sinal", "Câmera"], (t) =>
        acrescentarTexto(defeito, t, "; "),
      ),
      Object.assign(defeito, { id: "nova-os-defeito" }),
    ),
    h(
      "div",
      { class: "campo" },
      h("label", { class: "campo__rotulo", for: "nova-os-acessorios" }, "Acessórios entregues"),
      atalhos(["Capa", "Chip", "Carregador", "Cabo", "Película", "Cartão de memória", "Caixa"], (t) => acrescentarTexto(acessorios, t, ", ")),
      Object.assign(acessorios, { id: "nova-os-acessorios" }),
    ),
  );

  // ---------- Etapa 4: atendimento ----------
  const seletorTecnico = h(
    "select",
    { name: "tecnicoId" },
    h("option", { value: "" }, "Definir depois"),
    tecnicos.map((t) => h("option", { value: t.id }, t.nome)),
  ) as HTMLSelectElement;
  const previsao = h("input", { type: "date", name: "previsaoEntrega" }) as HTMLInputElement;
  const prazo = (dias: number): void => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    previsao.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    previsao.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const etapaAtendimento = etapaForm(
    4,
    "Atendimento",
    "Opcional: pode ser definido depois.",
    null,
    h(
      "div",
      { class: "grade-2" },
      h(
        "label",
        { class: "campo" },
        h("span", { class: "campo__rotulo" }, "Técnico responsável"),
        seletorTecnico,
        tecnicos.length === 0 &&
          h("span", { class: "campo__ajuda" }, "Nenhum técnico cadastrado. ", pode.gerirEquipe() ? h("a", { href: "#/equipe" }, "Adicionar na Equipe") : "Peça ao administrador."),
      ),
      h(
        "div",
        { class: "campo" },
        h("label", { class: "campo__rotulo", for: "nova-os-previsao" }, "Previsão de entrega"),
        Object.assign(previsao, { id: "nova-os-previsao" }),
        h(
          "div",
          { class: "atalhos" },
          [
            ["Hoje", 0],
            ["Amanhã", 1],
            ["3 dias", 3],
            ["1 semana", 7],
          ].map(([rotulo, dias]) => h("button", { type: "button", class: "atalho", onClick: () => prazo(Number(dias)) }, String(rotulo))),
        ),
      ),
    ),
  );

  // ---------- Resumo lateral ----------
  const linhaResumo = (rotulo: string): { dd: HTMLElement; itens: HTMLElement[] } => {
    const dd = h("dd", {}, "—");
    return { dd, itens: [h("dt", {}, rotulo), dd] };
  };
  const rCliente = linhaResumo("Cliente");
  const rAparelho = linhaResumo("Aparelho");
  const rDefeito = linhaResumo("Defeito");
  const rTecnico = linhaResumo("Técnico");
  const rPrevisao = linhaResumo("Previsão");
  const progresso = h("span", { class: "resumo__progresso-barra" });
  const contador = h("span", { class: "resumo__contador" });
  const botaoAbrir = h("button", { class: "btn btn--primary btn--block", type: "submit" }, "Abrir OS") as HTMLButtonElement;
  const areaErro = h("div", {});

  const textoOpcao = (sel: HTMLSelectElement): string => (sel.value ? sel.selectedOptions[0]?.textContent ?? "" : "");
  const atualizarResumo = (): void => {
    const cliente = textoOpcao(seletorCliente as HTMLSelectElement);
    const aparelho = textoOpcao(seletorEquipamento as HTMLSelectElement);
    rCliente.dd.textContent = cliente || "—";
    rAparelho.dd.textContent = aparelho || "—";
    rDefeito.dd.textContent = defeito.value.trim() || "—";
    rTecnico.dd.textContent = textoOpcao(seletorTecnico) || "Definir depois";
    rPrevisao.dd.textContent = previsao.value ? previsao.value.split("-").reverse().join("/") : "—";
    const feitos = [cliente, aparelho, defeito.value.trim().length >= 3].filter(Boolean).length;
    progresso.style.width = `${(feitos / 3) * 100}%`;
    contador.textContent = feitos === 3 ? "Pronta para abrir" : `${feitos} de 3 obrigatórios`;
    contador.classList.toggle("resumo__contador--ok", feitos === 3);

    // ficha do aparelho escolhido
    const eq = equipamentosAtuais.find((e) => String(e.id) === (seletorEquipamento as HTMLSelectElement).value);
    fichaAparelho.hidden = !eq;
    if (eq) {
      fichaAparelho.replaceChildren(
        h("span", { class: "ficha-aparelho__icone" }, iconeAparelho(eq.tipo)),
        h(
          "div",
          {},
          h("strong", {}, `${eq.marca} ${eq.modelo}`),
          h(
            "span",
            { class: "item__sub" },
            [ROTULO_TIPO[eq.tipo] ?? eq.tipo, eq.cor, eq.imei && `IMEI ${eq.imei}`, eq.numeroSerie && `Série ${eq.numeroSerie}`].filter(Boolean).join(" · "),
          ),
        ),
      );
    }
  };

  const resumo = h(
    "aside",
    { class: "resumo-os", "aria-label": "Resumo da OS" },
    h("h2", {}, "Resumo"),
    h("div", { class: "resumo__progresso" }, progresso),
    contador,
    h("dl", { class: "resumo__lista" }, rCliente.itens, rAparelho.itens, rDefeito.itens, rTecnico.itens, rPrevisao.itens),
    botaoAbrir,
    h("a", { class: "btn btn--outline btn--sm btn--block", href: "#/ordens" }, "Cancelar"),
    areaErro,
  );

  const form = h(
    "form",
    { class: "nova-os" },
    h("div", { class: "nova-os__etapas" }, etapaCliente, etapaAparelho, etapaDefeito, etapaAtendimento, areaErroCarga),
    resumo,
  ) as HTMLFormElement;
  form.addEventListener("input", atualizarResumo);
  form.addEventListener("change", atualizarResumo);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = new FormData(form);
    const valor = (k: string): string => String(d.get(k) ?? "").trim();
    void ocupado(botaoAbrir, "Abrindo…", areaErro, async () => {
      const os = await api.post<OrdemResumo>("/ordens", {
        clienteId: Number(valor("clienteId")),
        equipamentoId: Number(valor("equipamentoId")),
        defeitoRelatado: valor("defeitoRelatado"),
        acessorios: ouNulo(valor("acessorios")),
        tecnicoId: valor("tecnicoId") ? Number(valor("tecnicoId")) : null,
        previsaoEntrega: dataParaIso(valor("previsaoEntrega")),
      });
      definirAviso({ tipo: "ok", texto: `${numeroOS(os.numero)} aberta com sucesso.` });
      irPara(`#/ordens/${os.id}`);
    });
  });

  await carregarClientes("", clienteInicial);
  atualizarResumo();
  preencher(el, cabecalhoTela("Nova Ordem de Serviço"), form);
}

// ---------- Detalhe ----------

const ROTULO_ACAO: Partial<Record<StatusOS, string>> = {
  EM_DIAGNOSTICO: "Iniciar diagnóstico",
  AGUARDANDO_APROVACAO: "Enviar para aprovação",
  EM_REPARO: "Iniciar reparo",
  EM_TESTES: "Enviar para testes",
  FINALIZADO: "Finalizar",
  ENTREGUE: "Registrar entrega",
  CANCELADO: "Cancelar OS",
};

const ENCERRADOS: StatusOS[] = ["FINALIZADO", "ENTREGUE", "CANCELADO"];

export async function telaOrdem(el: HTMLElement, { params }: ContextoTela): Promise<void> {
  const id = Number(params[0]);

  const carregar = async (aviso?: string): Promise<void> => {
    const [os, tecnicos, saude] = await Promise.all([
      api.get<OrdemDetalhe>(`/ordens/${id}`),
      pode.atribuirTecnico() ? api.get<{ id: number; nome: string }[]>("/usuarios/tecnicos") : Promise.resolve([]),
      pode.diagnosticar() ? iaDisponivel() : Promise.resolve(false),
    ]);

    const areaErroComprovante = h("div", {});
    const botaoComprovante = h(
      "button",
      {
        class: "btn btn--outline btn--sm",
        type: "button",
        onClick: () => void ocupado(botaoComprovante, "Gerando…", areaErroComprovante, () => abrirComprovante(os.id)),
      },
      "Comprovante",
    );

    preencher(el,
      h("p", { class: "migalha" }, h("a", { href: "#/ordens" }, "← Ordens de Serviço")),
      cabecalhoTela(numeroOS(os.numero), tagStatus(os.status), pode.comprovante() && botaoComprovante),
      areaErroComprovante,
      aviso && caixaOk(aviso),
      h(
        "div",
        { class: "colunas" },
        h(
          "div",
          { class: "colunas__principal" },
          secaoDados(os),
          os.status !== "ENTREGUE" && secaoOrcamento(os, carregar),
          secaoReparos(os, carregar),
          secaoHistorico(os),
        ),
        h(
          "aside",
          { class: "colunas__lado" },
          secaoStatus(os, carregar),
          secaoTecnico(os, tecnicos, carregar),
          secaoAssistente(os, saude),
        ),
      ),
    );
  };

  await carregar();
}

function secaoDados(os: OrdemDetalhe): HTMLElement {
  return h(
    "section",
    { class: "painel" },
    h("h2", {}, "Dados da OS"),
    h(
      "dl",
      { class: "dados" },
      h("dt", {}, "Cliente"),
      h("dd", {}, h("a", { href: `#/clientes/${os.cliente.id}` }, os.cliente.nome), ` · ${os.cliente.telefone}`),
      h("dt", {}, "Equipamento"),
      h("dd", {}, `${os.equipamento.marca} ${os.equipamento.modelo}`, os.equipamento.imei && ` · IMEI ${os.equipamento.imei}`),
      h("dt", {}, "Defeito relatado"),
      h("dd", { class: "texto-livre" }, os.defeitoRelatado),
      h("dt", {}, "Acessórios"),
      h("dd", {}, os.acessorios ?? "—"),
      h("dt", {}, "Atendente"),
      h("dd", {}, os.atendente.nome),
      h("dt", {}, "Entrada"),
      h("dd", {}, dataHora(os.createdAt)),
      h("dt", {}, "Previsão de entrega"),
      h("dd", {}, data(os.previsaoEntrega)),
      h("dt", {}, "Orçamento"),
      h("dd", {}, moeda(os.valorOrcamento)),
    ),
  );
}

function secaoOrcamento(os: OrdemDetalhe, carregar: (aviso?: string) => Promise<void>): HTMLElement {
  const form = h(
    "form",
    { class: "form form--grade" },
    campo({
      rotulo: "Valor do orçamento (R$)",
      nome: "valorOrcamento",
      valor: os.valorOrcamento === null ? "" : String(os.valorOrcamento).replace(".", ","),
      atributos: { inputmode: "decimal", placeholder: "0,00" },
    }),
    campo({ rotulo: "Previsão de entrega", nome: "previsaoEntrega", tipo: "date", valor: isoParaData(os.previsaoEntrega) }),
    campo({ rotulo: "Observações", nome: "observacoes", valor: os.observacoes, linhas: 2 }),
    h("div", { class: "form__acoes" }, h("button", { class: "btn btn--outline btn--sm", type: "submit" }, "Salvar")),
  );
  aoEnviar(form, async (d) => {
    const valor = d.valorOrcamento ? paraNumero(d.valorOrcamento) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) throw new Error("Informe um valor de orçamento válido, como 150,00.");
    await api.patch(`/ordens/${os.id}`, {
      valorOrcamento: valor,
      previsaoEntrega: dataParaIso(d.previsaoEntrega),
      observacoes: ouNulo(d.observacoes),
    });
    await carregar("OS atualizada.");
  });
  return h("section", { class: "painel" }, h("h2", {}, "Orçamento e prazo"), form);
}

function secaoReparos(os: OrdemDetalhe, carregar: (aviso?: string) => Promise<void>): HTMLElement | null {
  const podeRegistrar = pode.registrarReparo() && (os.status === "EM_REPARO" || os.status === "EM_TESTES");
  if (!podeRegistrar && os.reparos.length === 0) return null;

  let form: HTMLFormElement | null = null;
  if (podeRegistrar) {
    form = h(
      "form",
      { class: "form form--grade" },
      campo({ rotulo: "Reparo realizado", nome: "descricao", obrigatorio: true, linhas: 2, atributos: { minlength: 3 } }),
      campo({ rotulo: "Peças utilizadas", nome: "pecasUtilizadas" }),
      campo({ rotulo: "Valor final (R$)", nome: "valorFinal", atributos: { inputmode: "decimal", placeholder: "0,00" } }),
      h("div", { class: "form__acoes" }, h("button", { class: "btn btn--outline btn--sm", type: "submit" }, "Registrar reparo")),
    );
    aoEnviar(form, async (d) => {
      const valor = d.valorFinal ? paraNumero(d.valorFinal) : null;
      if (valor !== null && (!Number.isFinite(valor) || valor < 0)) throw new Error("Informe um valor final válido, como 150,00.");
      await api.post(`/ordens/${os.id}/reparos`, { descricao: d.descricao, pecasUtilizadas: ouNulo(d.pecasUtilizadas), valorFinal: valor });
      await carregar("Reparo registrado.");
    });
  }

  return h(
    "section",
    { class: "painel" },
    h("h2", {}, "Reparos"),
    os.reparos.length > 0 &&
      h(
        "ul",
        { class: "lista-itens" },
        os.reparos.map((r) =>
          h(
            "li",
            { class: "item" },
            h("p", { class: "texto-livre" }, r.descricao),
            h(
              "p",
              { class: "item__sub" },
              [r.pecasUtilizadas && `Peças: ${r.pecasUtilizadas}`, r.valorFinal !== null && moeda(r.valorFinal), r.tecnico.nome, dataHora(r.createdAt)]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
        ),
      ),
    form,
  );
}

function secaoHistorico(os: OrdemDetalhe): HTMLElement {
  return h(
    "section",
    { class: "painel" },
    h("h2", {}, "Histórico"),
    h(
      "ol",
      { class: "linha-tempo" },
      os.historico.map((m) =>
        h(
          "li",
          {},
          h("strong", {}, ROTULO_STATUS[m.para]),
          h("span", { class: "item__sub" }, ` ${dataHora(m.createdAt)} · ${m.usuario.nome}`),
          m.observacao && h("p", { class: "texto-livre" }, m.observacao),
        ),
      ),
    ),
  );
}

function secaoStatus(os: OrdemDetalhe, carregar: (aviso?: string) => Promise<void>): HTMLElement {
  if (os.proximosStatus.length === 0) {
    return h("section", { class: "painel" }, h("h2", {}, "Status"), h("p", { class: "vazio" }, "Nenhuma mudança de status disponível para o seu perfil."));
  }
  const areaErro = h("div", {});
  const observacao = h("input", { type: "text", maxlength: 255 });
  const botoes = os.proximosStatus.map((status) => {
    const cancelar = status === "CANCELADO";
    const botao = h(
      "button",
      {
        class: `btn btn--sm btn--block ${cancelar ? "btn--perigo" : "btn--primary"}`,
        type: "button",
        onClick: () => {
          if (cancelar && !window.confirm(`Cancelar a ${numeroOS(os.numero)}? Depois disso ela só poderá ser marcada como entregue.`)) return;
          void ocupado(botao, "Atualizando…", areaErro, async () => {
            await api.patch(`/ordens/${os.id}/status`, { status, observacao: observacao.value.trim() || undefined });
            await carregar(`Status alterado para ${ROTULO_STATUS[status]}.`);
          });
        },
      },
      ROTULO_ACAO[status] ?? ROTULO_STATUS[status],
    );
    return botao;
  });
  return h(
    "section",
    { class: "painel" },
    h("h2", {}, "Status"),
    h("label", { class: "campo" }, h("span", { class: "campo__rotulo" }, "Observação (opcional)"), observacao),
    h("div", { class: "pilha" }, botoes),
    areaErro,
  );
}

function secaoTecnico(
  os: OrdemDetalhe,
  tecnicos: { id: number; nome: string }[],
  carregar: (aviso?: string) => Promise<void>,
): HTMLElement {
  const u = usuarioAtual();
  const encerrada = ENCERRADOS.includes(os.status);
  const atual = h("p", {}, os.tecnico?.nome ?? "Sem técnico");
  const atribuir = (tecnicoId: number, mensagem: string): Promise<void> =>
    api.patch(`/ordens/${os.id}/atribuir`, { tecnicoId }).then(() => carregar(mensagem));

  if (pode.atribuirTecnico() && !encerrada) {
    if (tecnicos.length === 0) {
      return h(
        "section",
        { class: "painel" },
        h("h2", {}, "Técnico"),
        h(
          "p",
          { class: "vazio" },
          "Nenhum técnico cadastrado. ",
          pode.gerirEquipe() ? h("a", { href: "#/equipe" }, "Adicionar na equipe") : "Peça ao administrador para adicionar um técnico à equipe.",
        ),
      );
    }
    const form = h(
      "form",
      { class: "form" },
      campo({
        rotulo: "Técnico responsável",
        nome: "tecnicoId",
        obrigatorio: true,
        valor: os.tecnico?.id ?? "",
        opcoes: [{ valor: "", rotulo: "Selecione" }, ...tecnicos.map((t) => ({ valor: String(t.id), rotulo: t.nome }))],
      }),
      h("button", { class: "btn btn--outline btn--sm btn--block", type: "submit" }, "Atribuir técnico"),
    );
    aoEnviar(form, (d) => atribuir(Number(d.tecnicoId), "Técnico atribuído."));
    return h("section", { class: "painel" }, h("h2", {}, "Técnico"), form);
  }

  if (u?.perfil === "TECNICO" && !os.tecnico && !encerrada) {
    const areaErro = h("div", {});
    const botao = h(
      "button",
      {
        class: "btn btn--outline btn--sm btn--block",
        type: "button",
        onClick: () => void ocupado(botao, "Assumindo…", areaErro, () => atribuir(u.id, "Você assumiu esta OS.")),
      },
      "Assumir esta OS",
    );
    return h("section", { class: "painel" }, h("h2", {}, "Técnico"), atual, botao, areaErro);
  }

  return h("section", { class: "painel" }, h("h2", {}, "Técnico"), atual);
}

function secaoAssistente(os: OrdemDetalhe, iaAtiva: boolean): HTMLElement {
  const podeUsar = pode.diagnosticar();
  const lista =
    os.sessoes.length > 0 &&
    h(
      "ul",
      { class: "lista-itens" },
      os.sessoes.map((s) =>
        h(
          "li",
          { class: "item" },
          podeUsar ? h("a", { href: `#/diagnosticos/${s.id}` }, s.sintoma) : h("span", {}, s.sintoma),
          h("p", { class: "item__sub" }, `${s.status === "ATIVA" ? "Em andamento" : "Concluído"} · ${data(s.createdAt)}`),
          s.diagnosticoFinal && h("p", { class: "texto-livre" }, s.diagnosticoFinal),
        ),
      ),
    );

  let inicio: HTMLElement | false = false;
  if (podeUsar && !ENCERRADOS.includes(os.status)) {
    if (iaAtiva) {
      const foto = campoFoto();
      const form = h(
        "form",
        { class: "form" },
        campo({
          rotulo: "Sintoma observado",
          nome: "sintoma",
          obrigatorio: true,
          linhas: 3,
          valor: os.sessoes.length === 0 ? os.defeitoRelatado : "",
          atributos: { minlength: 3 },
        }),
        h("details", { class: "dobra" }, h("summary", {}, "Anexar foto"), foto.elemento),
        h("button", { class: "btn btn--primary btn--sm btn--block", type: "submit" }, "Iniciar com o agente de IA"),
      );
      aoEnviar(
        form,
        async (d) => {
          const imagem = await foto.obter();
          const r = await api.post<{ sessao: SessaoDiagnostico }>(`/ordens/${os.id}/diagnosticos`, { sintoma: d.sintoma, ...(imagem ? { imagem } : {}) });
          irPara(`#/diagnosticos/${r.sessao.id}`);
        },
        "O agente está analisando…",
      );
      inicio = form;
    } else {
      inicio = avisoIAIndisponivel(pode.configurar());
    }
  }

  return h(
    "section",
    { class: "painel" },
    h("h2", {}, "Assistente de diagnóstico"),
    lista,
    inicio,
    !lista && !inicio && h("p", { class: "vazio" }, podeUsar ? "Nenhum diagnóstico nesta OS." : "Nenhum diagnóstico registrado. O assistente é usado pelo técnico."),
  );
}

/** A rota exige o token, então o comprovante é baixado e aberto em uma nova aba para imprimir. */
async function abrirComprovante(id: number): Promise<void> {
  const janela = window.open("", "_blank"); // precisa ser aberta antes do await, ou o navegador bloqueia
  if (!janela) throw new Error("O navegador bloqueou a nova aba. Permita pop-ups para abrir o comprovante.");
  try {
    const html = await api.texto(`/ordens/${id}/comprovante`);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    janela.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    janela.close();
    throw e;
  }
}
