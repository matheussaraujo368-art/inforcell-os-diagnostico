/**
 * Campo de foto para o diagnóstico. A imagem é reduzida no navegador (lado maior até 1568 px,
 * o tamanho que a IA aproveita) e convertida para JPEG, o que deixa o envio rápido e barato.
 */
import { h } from "./dom.js";

export interface ImagemEnvio {
  mediaType: "image/jpeg";
  dados: string; // base64 sem o prefixo data:
}

const LADO_MAXIMO = 1568;

async function reduzir(arquivo: File): Promise<{ imagem: ImagemEnvio; url: string }> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (foto).");
  const bitmap = await createImageBitmap(arquivo).catch(() => {
    throw new Error("Não foi possível abrir esta imagem. Tente uma foto em JPG ou PNG.");
  });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não conseguiu processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { imagem: { mediaType: "image/jpeg", dados: url.slice(url.indexOf(",") + 1) }, url };
}

/** Cria o campo e devolve uma função que entrega a foto escolhida (ou undefined). */
export function campoFoto(): { elemento: HTMLElement; obter: () => Promise<ImagemEnvio | undefined>; limpar: () => void } {
  const entrada = h("input", { type: "file", accept: "image/*", capture: "environment", class: "foto__entrada" }) as HTMLInputElement;
  const previa = h("div", { class: "foto__previa" });
  const erro = h("p", { class: "campo__ajuda foto__erro", role: "alert" });
  let atual: Promise<ImagemEnvio | undefined> = Promise.resolve(undefined);

  const limpar = (): void => {
    entrada.value = "";
    previa.replaceChildren();
    erro.textContent = "";
    atual = Promise.resolve(undefined);
  };

  entrada.addEventListener("change", () => {
    const arquivo = entrada.files?.[0];
    erro.textContent = "";
    previa.replaceChildren();
    if (!arquivo) {
      atual = Promise.resolve(undefined);
      return;
    }
    atual = reduzir(arquivo).then(
      ({ imagem, url }) => {
        previa.replaceChildren(
          h("img", { src: url, alt: "Prévia da foto anexada" }),
          h("button", { class: "btn btn--outline btn--sm", type: "button", onClick: limpar }, "Remover foto"),
        );
        return imagem;
      },
      (e: unknown) => {
        erro.textContent = e instanceof Error ? e.message : "Imagem inválida.";
        entrada.value = "";
        return undefined;
      },
    );
  });

  const elemento = h(
    "div",
    { class: "campo foto" },
    h("span", { class: "campo__rotulo" }, "Foto (opcional)"),
    entrada,
    h("span", { class: "campo__ajuda" }, "Foto da placa ou do aparelho. A IA analisa a imagem nesta resposta; a foto não fica salva."),
    erro,
    previa,
  );
  return { elemento, obter: () => atual, limpar };
}
