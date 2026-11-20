import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Criptografia de segredos guardados no banco (hoje: a chave de IA de cada empresa).
 *
 * Usa AES-256-GCM, que além de esconder o texto detecta qualquer alteração no valor salvo.
 * A chave de criptografia vem de CHAVE_CRIPTOGRAFIA (ou do JWT_SECRET) e nunca vai para o banco:
 * quem tiver só uma cópia do banco não consegue ler as chaves.
 */

const VERSAO = "v1";
let chaveDerivada: Buffer | null = null;

function chave(): Buffer {
  chaveDerivada ??= crypto.scryptSync(env.CHAVE_CRIPTOGRAFIA ?? env.JWT_SECRET, "inforcell-os/segredos", 32);
  return chaveDerivada;
}

/** Devolve o texto cifrado no formato "v1:iv:tag:dados" (base64). */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return [VERSAO, iv.toString("base64"), cifra.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

/**
 * Decifra um valor produzido por cifrar(). Devolve null se o valor estiver corrompido ou se a
 * chave de criptografia do servidor tiver mudado desde que ele foi salvo.
 */
export function decifrar(valor: string): string | null {
  const [versao, iv, tag, dados] = valor.split(":");
  if (versao !== VERSAO || !iv || !tag || !dados) return null;
  try {
    const decifra = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
    decifra.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Mostra só o começo e o fim da chave, para o administrador reconhecer qual está salva. */
export function mascararChave(chaveApi: string): string {
  if (chaveApi.length <= 14) return "••••";
  return `${chaveApi.slice(0, 7)}…${chaveApi.slice(-4)}`;
}
