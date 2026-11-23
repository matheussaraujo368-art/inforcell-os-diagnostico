/** HU01 — Login e configuração da URL da API. */
import { consultarSaude, entrar } from "../api.js";
import { definirUrlApi, urlApi, urlPadrao } from "../config.js";
import { aoEnviar, caixaAviso, caixaErro, caixaOk, campo, h } from "../dom.js";
import { irPara } from "../nav.js";
import { botaoAcesso, comIcone, ICONE, layoutAcesso, recursosSenha, vitrine } from "./acesso.js";

// ---------- Tela ----------

export function telaLogin(el: HTMLElement, destino: string): void {
  const campoEmail = campo({ rotulo: "E-mail", nome: "email", tipo: "email", obrigatorio: true, atributos: { autocomplete: "username", autofocus: true, placeholder: "voce@assistencia.com" } });
  const campoSenha = campo({ rotulo: "Senha", nome: "senha", tipo: "password", obrigatorio: true, atributos: { autocomplete: "current-password", placeholder: "Sua senha" } });
  comIcone(campoEmail, ICONE.email);
  const senha = comIcone(campoSenha, ICONE.cadeado);

  recursosSenha(campoSenha, senha);
  const botao = botaoAcesso("Entrar");
  const form = h("form", { class: "form" }, campoEmail, campoSenha, botao);
  aoEnviar(
    form,
    async (d) => {
      await entrar(d.email, d.senha);
      irPara(destino);
    },
    "Entrando…",
  );

  el.replaceChildren(
    layoutAcesso(
      vitrineLogin(),
      h("p", { class: "eyebrow" }, "// inforcell os"),
      h("h1", { class: "tela__titulo", tabindex: "-1" }, "Acessar o sistema"),
      h("p", { class: "acesso__subtitulo" }, "Entre com o e-mail e a senha da sua assistência."),
      form,
      h("div", { class: "acesso__divisor", role: "presentation" }, h("span", {}, "ou")),
      h("p", { class: "login__alternar acesso__alternar" }, "Ainda não tem conta? ", h("a", { href: "#/cadastro" }, "Cadastrar assistência")),
      configuracaoApi(),
      h("p", { class: "login__voltar" }, h("a", { href: "index.html" }, "← Voltar à página inicial")),
    ),
  );
}

function vitrineLogin(): HTMLElement {
  return vitrine(
    ["Do sintoma à causa, ", "guiado por IA"],
    "Ordens de serviço e diagnóstico de bancada no mesmo lugar, para celulares e computadores.",
    [
      { icone: ICONE.agente, titulo: "Agente de diagnóstico", texto: "Consulta casos, base e preços da sua assistência." },
      { icone: ICONE.os, titulo: "Ordens de serviço", texto: "Do balcão à entrega, com histórico e comprovante." },
      { icone: ICONE.camera, titulo: "Assistente de bancada", texto: "Pergunte com foto, vídeo ou voz." },
    ],
    h(
      "div",
      { class: "acesso__demo", "aria-hidden": "true" },
      h("div", { class: "acesso__demo-topo" }, h("i", {}), h("i", {}), h("i", {}), h("span", {}, "os-0042 · iPhone 11")),
      h("div", { class: "acesso__demo-passos" }, h("span", {}, "› 5 casos semelhantes"), h("span", {}, "› 4 reparos e preços")),
      h("p", {}, h("strong", {}, "Próximo teste: "), "consumo na fonte ao pressionar Power"),
      h("div", { class: "acesso__demo-barra" }, h("span", {})),
    ),
  );
}

function configuracaoApi(): HTMLElement {
  const resultado = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form" },
    campo({
      rotulo: "URL base da API",
      nome: "url",
      tipo: "url",
      valor: urlApi(),
      ajuda: `Fica salva neste navegador. Deixe em branco para usar o padrão (${urlPadrao()}).`,
    }),
    h("button", { class: "btn btn--outline btn--sm", type: "submit" }, "Salvar e testar"),
  );
  aoEnviar(
    form,
    async (d) => {
      const url = definirUrlApi(d.url);
      form.querySelector<HTMLInputElement>('input[name="url"]')!.value = url;
      await testar(url, resultado);
    },
    "Testando…",
  );
  form.appendChild(resultado);

  return h("details", { class: "login__config" }, h("summary", {}, "Configurar conexão com a API"), form);
}

async function testar(url: string, area: HTMLElement): Promise<void> {
  area.replaceChildren();
  const saude = await consultarSaude();
  if (!saude) area.replaceChildren(caixaErro(new Error(`A API não respondeu em ${url}.`)));
  else if (saude.ia) area.replaceChildren(caixaOk("API conectada, com o assistente de IA ativo."));
  else area.replaceChildren(caixaAviso("API conectada, mas o assistente de IA não está configurado no servidor."));
}
