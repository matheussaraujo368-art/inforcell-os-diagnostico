/**
 * Peças visuais das telas de acesso (login e cadastro): layout com vitrine + cartão,
 * campos com ícone, mostrar/ocultar senha e aviso de Caps Lock.
 * Só visual: os campos continuam sendo os mesmos <input> com os mesmos nomes.
 */
import { h } from "../dom.js";

export function icone(caminho: string, classe = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (classe) svg.setAttribute("class", classe);
  svg.innerHTML = caminho;
  return svg;
}

export const ICONE = {
  email: '<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  cadeado: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  olhoFechado: '<path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.8-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  agente: '<rect x="4" y="7" width="16" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="13" r="1.5" fill="currentColor"/><circle cx="15" cy="13" r="1.5" fill="currentColor"/><path d="M12 7V4M9 4h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  os: '<rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  camera: '<rect x="3" y="6" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12.5" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  loja: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8M10 20v-4.5h4V20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  telefone: '<path d="M6.5 3.5h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  pessoa: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  escudo: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  equipe: '<circle cx="9" cy="8.5" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 19.5a6 6 0 0 1 12 0M16 5.5a3.3 3.3 0 0 1 0 6.3M18 19.5a6 6 0 0 0-2.5-4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

/** Coloca um ícone dentro do campo (à esquerda) e devolve o <input>. */
export function comIcone(rotulo: HTMLElement, caminho: string): HTMLInputElement {
  const entrada = rotulo.querySelector("input")!;
  const envoltorio = h("span", { class: "acesso-campo" }, icone(caminho, "acesso-campo__icone"));
  entrada.replaceWith(envoltorio);
  envoltorio.append(entrada);
  return entrada;
}

/** Botão de olho para mostrar/ocultar a senha + aviso de Caps Lock. */
export function recursosSenha(rotulo: HTMLElement, senha: HTMLInputElement): void {
  const mostrar = h("button", { class: "acesso-campo__acao", type: "button", "aria-label": "Mostrar senha", "aria-pressed": "false", title: "Mostrar senha" }, icone(ICONE.olho)) as HTMLButtonElement;
  mostrar.addEventListener("click", () => {
    const visivel = senha.type === "password";
    senha.type = visivel ? "text" : "password";
    mostrar.replaceChildren(icone(visivel ? ICONE.olhoFechado : ICONE.olho));
    mostrar.setAttribute("aria-pressed", String(visivel));
    mostrar.setAttribute("aria-label", visivel ? "Ocultar senha" : "Mostrar senha");
    mostrar.title = visivel ? "Ocultar senha" : "Mostrar senha";
    senha.focus();
  });
  senha.parentElement!.append(mostrar);

  const capsLock = h("span", { class: "acesso-caps", role: "status", hidden: true }, "Caps Lock está ligado");
  const conferir = (ev: KeyboardEvent): void => {
    capsLock.hidden = !ev.getModifierState?.("CapsLock");
  };
  senha.addEventListener("keydown", conferir);
  senha.addEventListener("keyup", conferir);
  senha.addEventListener("blur", () => (capsLock.hidden = true));
  rotulo.append(capsLock);
}

/** Botão principal com seta. */
export const botaoAcesso = (texto: string): HTMLElement =>
  h("button", { class: "btn btn--primary btn--block acesso-entrar", type: "submit" }, h("span", {}, texto), icone(ICONE.seta));

export interface ItemVitrine {
  icone: string;
  titulo: string;
  texto: string;
}

/** Lado esquerdo (só em telas largas): chamada, lista de benefícios e um destaque. */
export function vitrine(chamada: [string, string], texto: string, itens: ItemVitrine[], destaque: HTMLElement): HTMLElement {
  return h(
    "section",
    { class: "acesso__vitrine", "aria-label": "Sobre o sistema" },
    h("p", { class: "eyebrow" }, "// fixbot.ai"),
    h("h2", { class: "acesso__chamada" }, chamada[0], h("span", {}, chamada[1]), "."),
    h("p", { class: "acesso__texto" }, texto),
    h(
      "ul",
      { class: "acesso__lista" },
      itens.map((i) => h("li", {}, h("span", { class: "acesso__item-icone" }, icone(i.icone)), h("div", {}, h("strong", {}, i.titulo), h("span", {}, i.texto)))),
    ),
    destaque,
  );
}

/** Layout completo: vitrine à esquerda e cartão à direita. */
export function layoutAcesso(vitrineEl: HTMLElement, ...cartao: (HTMLElement | string | false | null | undefined)[]): HTMLElement {
  return h("div", { class: "acesso" }, vitrineEl, h("div", { class: "login acesso__cartao" }, ...cartao));
}
