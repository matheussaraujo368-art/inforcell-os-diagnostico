/** Cadastro público: cada assistência cria a própria conta e passa a ter um painel separado. */
import { cadastrarEmpresa } from "../api.js";
import { comMascara, formatarTelefone } from "../componentes.js";
import { aoEnviar, campo, h, ouNulo } from "../dom.js";
import { definirAviso, irPara } from "../nav.js";
import { botaoAcesso, comIcone, ICONE, layoutAcesso, recursosSenha, vitrine } from "./acesso.js";

const etapa = (numero: string, titulo: string): HTMLElement =>
  h("h2", { class: "form__secao acesso-etapa" }, h("span", { class: "acesso-etapa__num" }, numero), titulo);

export function telaCadastro(el: HTMLElement, destino: string): void {
  const campoAssistencia = campo({ rotulo: "Nome da assistência", nome: "nomeEmpresa", obrigatorio: true, atributos: { minlength: 2, maxlength: 120, autocomplete: "organization", autofocus: true, placeholder: "Ex.: Inforcell Assistência" } });
  const campoTelefone = campo({ rotulo: "Telefone", nome: "telefoneEmpresa", tipo: "tel", ajuda: "Opcional. Aparece no comprovante da OS.", atributos: { autocomplete: "tel", placeholder: "(99) 99999-9999" } });
  const campoNome = campo({ rotulo: "Seu nome", nome: "nome", obrigatorio: true, atributos: { minlength: 2, maxlength: 120, autocomplete: "name", placeholder: "Nome e sobrenome" } });
  const campoEmail = campo({ rotulo: "E-mail", nome: "email", tipo: "email", obrigatorio: true, atributos: { maxlength: 160, autocomplete: "username", placeholder: "voce@assistencia.com" } });
  const campoSenha = campo({ rotulo: "Senha", nome: "senha", tipo: "password", obrigatorio: true, ajuda: "Mínimo de 8 caracteres.", atributos: { minlength: 8, maxlength: 72, autocomplete: "new-password", placeholder: "Crie uma senha" } });
  const campoConfirmacao = campo({ rotulo: "Confirme a senha", nome: "confirmacao", tipo: "password", obrigatorio: true, atributos: { minlength: 8, maxlength: 72, autocomplete: "new-password", placeholder: "Repita a senha" } });

  comIcone(campoAssistencia, ICONE.loja);
  comMascara(comIcone(campoTelefone, ICONE.telefone), formatarTelefone);
  comIcone(campoNome, ICONE.pessoa);
  comIcone(campoEmail, ICONE.email);
  const senha = comIcone(campoSenha, ICONE.cadeado);
  const confirmacao = comIcone(campoConfirmacao, ICONE.cadeado);
  recursosSenha(campoSenha, senha);
  recursosSenha(campoConfirmacao, confirmacao);

  // Dica ao vivo: as senhas conferem?
  const conferencia = h("span", { class: "acesso-confere", role: "status", hidden: true });
  campoConfirmacao.append(conferencia);
  const atualizarConferencia = (): void => {
    if (!confirmacao.value) {
      conferencia.hidden = true;
      return;
    }
    const iguais = senha.value === confirmacao.value;
    conferencia.hidden = false;
    conferencia.textContent = iguais ? "✓ As senhas conferem" : "As senhas ainda não são iguais";
    conferencia.classList.toggle("acesso-confere--ok", iguais);
  };
  senha.addEventListener("input", atualizarConferencia);
  confirmacao.addEventListener("input", atualizarConferencia);

  const form = h(
    "form",
    { class: "form" },
    etapa("1", "Sua assistência"),
    campoAssistencia,
    campoTelefone,
    etapa("2", "Sua conta de administrador"),
    campoNome,
    campoEmail,
    campoSenha,
    campoConfirmacao,
    botaoAcesso("Criar conta"),
  );
  aoEnviar(
    form,
    async (d) => {
      if (d.senha !== d.confirmacao) throw new Error("As senhas não são iguais.");
      await cadastrarEmpresa({ nomeEmpresa: d.nomeEmpresa, telefoneEmpresa: ouNulo(d.telefoneEmpresa), nome: d.nome, email: d.email, senha: d.senha });
      definirAviso({ tipo: "ok", texto: `Conta criada. Bem-vindo(a) ao painel da ${d.nomeEmpresa}!` });
      irPara(destino);
    },
    "Criando conta…",
  );

  el.replaceChildren(
    layoutAcesso(
      vitrineCadastro(),
      h("p", { class: "eyebrow" }, "// inforcell os"),
      h("h1", { class: "tela__titulo", tabindex: "-1" }, "Cadastrar assistência"),
      h("p", { class: "login__texto acesso__subtitulo" }, "Crie o painel da sua assistência. Os clientes e as Ordens de Serviço ficam visíveis só para a sua equipe."),
      form,
      h("div", { class: "acesso__divisor", role: "presentation" }, h("span", {}, "ou")),
      h("p", { class: "login__alternar acesso__alternar" }, "Já tem conta? ", h("a", { href: "#/login" }, "Entrar")),
    ),
  );
}

function vitrineCadastro(): HTMLElement {
  return vitrine(
    ["Sua assistência ", "pronta em minutos"],
    "Crie a conta agora e comece a abrir Ordens de Serviço com diagnóstico guiado por IA.",
    [
      { icone: ICONE.escudo, titulo: "Painel só seu", texto: "Clientes e OS ficam isolados por assistência." },
      { icone: ICONE.equipe, titulo: "Equipe com perfis", texto: "Administrador, atendente e técnico." },
      { icone: ICONE.agente, titulo: "Agente de IA", texto: "Use a sua própria chave da API." },
    ],
    h(
      "ol",
      { class: "acesso__passos", "aria-label": "Primeiros passos" },
      h("li", {}, h("strong", {}, "Crie a conta"), h("span", {}, "agora, nesta tela")),
      h("li", {}, h("strong", {}, "Cadastre a equipe"), h("span", {}, "em Equipe")),
      h("li", {}, h("strong", {}, "Configure a chave"), h("span", {}, "em Configurações")),
    ),
  );
}
