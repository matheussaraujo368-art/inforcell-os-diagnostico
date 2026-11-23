/**
 * Componentes visuais reaproveitados nos formulários (Nova OS, Clientes…):
 * etapas numeradas, atalhos (chips), ícones e máscaras de digitação.
 */
import { h } from "./dom.js";


export const ROTULO_TIPO: Record<string, string> = { CELULAR: "Celular", TABLET: "Tablet", NOTEBOOK: "Notebook", DESKTOP: "Computador", OUTRO: "Outro" };
/** Ícone simples do tipo de aparelho (celular/tablet ou computador). */
export function iconeAparelho(tipo: string): HTMLElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    tipo === "CELULAR" || tipo === "TABLET"
      ? '<rect x="6" y="2.5" width="12" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
      : '<rect x="4" y="4.5" width="16" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 19h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return svg as unknown as HTMLElement;
}

export const rotuloObrig = (texto: string): HTMLElement =>
  h("span", { class: "campo__rotulo" }, texto, h("span", { class: "campo__obrig", "aria-hidden": "true" }, " *"));

export function etapaForm(numero: number, titulo: string, descricao: string, acao: HTMLElement | null, ...conteudo: (HTMLElement | false)[]): HTMLElement {
  return h(
    "section",
    { class: "etapa-form" },
    h(
      "header",
      { class: "etapa-form__topo" },
      h("span", { class: "etapa-form__numero", "aria-hidden": "true" }, numero),
      h("div", { class: "etapa-form__titulos" }, h("h2", {}, titulo), h("p", {}, descricao)),
      acao,
    ),
    h("div", { class: "etapa-form__corpo" }, ...conteudo),
  );
}

/** Botões de atalho que acrescentam um texto ao campo. */
export function atalhos(textos: string[], aoEscolher: (t: string) => void): HTMLElement {
  return h(
    "div",
    { class: "atalhos" },
    textos.map((t) => h("button", { type: "button", class: "atalho", onClick: () => aoEscolher(t) }, `+ ${t}`)),
  );
}

/** Acrescenta o texto ao campo sem repetir e avisa o formulário da mudança. */
export function acrescentarTexto(campoTexto: HTMLInputElement | HTMLTextAreaElement, texto: string, separador: string): void {
  const atual = campoTexto.value.trim();
  if (atual.toLowerCase().includes(texto.toLowerCase())) return;
  campoTexto.value = atual ? `${atual.replace(/[;,.\s]+$/, "")}${separador}${texto}` : texto;
  campoTexto.dispatchEvent(new Event("input", { bubbles: true }));
  campoTexto.focus();
}

export function iconeBusca(): HTMLElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "busca__icone");
  svg.innerHTML = '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return svg as unknown as HTMLElement;
}


// ---------- Máscaras (a API guarda só os dígitos) ----------

const digitos = (v: string): string => v.replace(/\D/g, "");

export function formatarTelefone(v: string): string {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarCpf(v: string): string {
  const d = digitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Aplica a máscara enquanto a pessoa digita. */
export function comMascara<T extends HTMLInputElement>(entrada: T, formatar: (v: string) => string): T {
  entrada.addEventListener("input", () => {
    entrada.value = formatar(entrada.value);
  });
  if (entrada.value) entrada.value = formatar(entrada.value);
  return entrada;
}

/** Link do WhatsApp para um telefone brasileiro (ou null se o número não servir). */
export function linkWhatsApp(telefone: string, texto = ""): string | null {
  const d = digitos(telefone);
  const numero = d.length === 10 || d.length === 11 ? `55${d}` : (d.length === 12 || d.length === 13) && d.startsWith("55") ? d : null;
  return numero ? `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}` : null;
}

export const iniciais = (nome: string): string =>
  nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÁ-Ú]/.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

// ---------- Painel recolhível com botão que alterna ----------

let contadorRecolhivel = 0;

export interface Recolhivel {
  painel: HTMLElement;
  botao: HTMLButtonElement;
  abrir: () => void;
  fechar: () => void;
  aberto: () => boolean;
}

/**
 * Painel que abre e fecha deslizando, controlado por um botão que se transforma:
 * "+ Novo …" (fechado) ↔ "× Recolher" (aberto). O conteúdo fechado fica fora da
 * navegação por teclado (inert).
 */
export function painelRecolhivel(rotuloAbrir: string, conteudo: HTMLElement, aoAbrir?: () => void): Recolhivel {
  const id = `recolhivel-${++contadorRecolhivel}`;
  const interno = h("div", { class: "recolhivel__interno" }, conteudo);
  const painel = h("div", { class: "recolhivel", id, "data-aberto": "false" }, interno);
  painel.inert = true;

  const texto = h("span", { class: "btn-alternar__texto" }, rotuloAbrir);
  const botao = h(
    "button",
    { class: "btn btn--sm btn-alternar", type: "button", "aria-expanded": "false", "aria-controls": id },
    h("span", { class: "btn-alternar__icone", "aria-hidden": "true" }),
    texto,
  ) as HTMLButtonElement;

  const definir = (abrir: boolean): void => {
    painel.dataset.aberto = String(abrir);
    painel.inert = !abrir;
    botao.setAttribute("aria-expanded", String(abrir));
    botao.classList.toggle("btn-alternar--aberto", abrir);
    texto.textContent = abrir ? "Recolher" : rotuloAbrir;
    if (abrir) {
      aoAbrir?.();
      window.setTimeout(() => painel.querySelector<HTMLElement>("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea")?.focus(), 220);
    }
  };
  botao.addEventListener("click", () => definir(painel.dataset.aberto !== "true"));
  // Esc recolhe quando o foco está dentro do painel
  painel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      definir(false);
      botao.focus();
    }
  });

  return { painel, botao, abrir: () => definir(true), fechar: () => definir(false), aberto: () => painel.dataset.aberto === "true" };
}
