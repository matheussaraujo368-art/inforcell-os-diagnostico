/**
 * Chave de IA por empresa: criptografia, mensagens de erro e rotas de Configurações.
 * Os testes de rota que gravam no banco rodam só com TESTAR_BANCO=1 (npm run test:api).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import Anthropic from "@anthropic-ai/sdk";
import { criarApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cifrar, decifrar, mascararChave } from "../src/services/cripto";
import { definirClienteIA, montarSystemPrompt, traduzirErroIA } from "../src/services/ia.service";

const app = criarApp();
const temBanco = process.env.TESTAR_BANCO === "1";

describe("criptografia da chave de IA", () => {
  const chave = "sk-ant-api03-exemplo-de-chave-0123456789abcd";

  it("cifra e decifra de volta", () => {
    const cifrada = cifrar(chave);
    expect(cifrada).not.toContain(chave);
    expect(cifrada.startsWith("v1:")).toBe(true);
    expect(decifrar(cifrada)).toBe(chave);
  });

  it("gera um valor diferente a cada vez (IV aleatório)", () => {
    expect(cifrar(chave)).not.toBe(cifrar(chave));
  });

  it("recusa valor alterado ou em formato desconhecido", () => {
    const partes = cifrar(chave).split(":");
    const dados = Buffer.from(partes[3], "base64");
    dados[0] ^= 1;
    partes[3] = dados.toString("base64");
    expect(decifrar(partes.join(":"))).toBeNull();
    expect(decifrar("texto-qualquer")).toBeNull();
  });

  it("mascara a chave mostrando só começo e fim", () => {
    expect(mascararChave(chave)).toBe("sk-ant-…abcd");
    expect(mascararChave("curta")).toBe("••••");
  });
});

describe("mensagens de erro da IA", () => {
  const erro = (status: number, mensagem: string) =>
    Anthropic.APIError.generate(status, { error: { message: mensagem } }, mensagem, new Headers());

  it("explica chave recusada, modelo inexistente, limite e falta de créditos", () => {
    expect(traduzirErroIA(erro(401, "invalid x-api-key"), "m").message).toMatch(/chave de IA foi recusada/);
    expect(traduzirErroIA(erro(404, "model not found"), "modelo-x").message).toMatch(/"modelo-x" não foi encontrado/);
    expect(traduzirErroIA(erro(429, "rate limit"), "m").status).toBe(429);
    expect(traduzirErroIA(erro(400, "Your credit balance is too low"), "m").message).toMatch(/sem créditos/);
    expect(traduzirErroIA(erro(529, "overloaded"), "m").message).toMatch(/sobrecarregado/);
  });

  it("o prompt usa o nome da empresa", () => {
    expect(montarSystemPrompt("Assistência Teste")).toContain("agente de diagnóstico da Assistência Teste");
    expect(montarSystemPrompt("")).toContain("da Inforcell");
    expect(montarSystemPrompt("X")).toContain("foco principal em CELULARES");
  });
});

describe("rotas de Configurações sem banco", () => {
  it("exigem login", async () => {
    expect((await request(app).get("/api/configuracoes/ia")).status).toBe(401);
    expect((await request(app).get("/api/configuracoes/ia/status")).status).toBe(401);
    expect((await request(app).put("/api/configuracoes/ia").send({ chave: "x" })).status).toBe(401);
  });
});

describe.skipIf(!temBanco)("configuração da IA pelo administrador", () => {
  const tokens: Record<string, string> = {};
  let empresaId = 0;

  beforeAll(async () => {
    definirClienteIA(null); // usa o cliente real (que não é chamado sem chave)
    for (const p of ["admin", "tecnico"]) {
      const r = await request(app).post("/api/auth/login").send({ email: `${p}@inforcell.local`, senha: "inforcell123" });
      tokens[p] = r.body.token;
      empresaId = r.body.empresa.id;
    }
    await prisma.empresa.update({ where: { id: empresaId }, data: { iaChaveCifrada: null, iaModelo: null } });
  });
  afterAll(async () => {
    await prisma.empresa.update({ where: { id: empresaId }, data: { iaChaveCifrada: null, iaModelo: null } });
  });

  it("só o administrador vê e altera a configuração", async () => {
    expect((await request(app).get("/api/configuracoes/ia").set("Authorization", `Bearer ${tokens.tecnico}`)).status).toBe(403);
    const r = await request(app).get("/api/configuracoes/ia").set("Authorization", `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.chaveMascarada).toBeNull();
  });

  it("o técnico consulta só o status", async () => {
    const r = await request(app).get("/api/configuracoes/ia/status").set("Authorization", `Bearer ${tokens.tecnico}`);
    expect(r.status).toBe(200);
    expect(typeof r.body.disponivel).toBe("boolean");
  });

  it("recusa chave em formato errado sem chamar a Anthropic", async () => {
    const r = await request(app).put("/api/configuracoes/ia").set("Authorization", `Bearer ${tokens.admin}`).send({ chave: "chave-errada-1234567890" });
    expect(r.status).toBe(400);
  });

  it("nunca devolve a chave completa", async () => {
    const chave = "sk-ant-api03-chave-salva-direto-no-banco-wxyz";
    await prisma.empresa.update({ where: { id: empresaId }, data: { iaChaveCifrada: cifrar(chave) } });
    const r = await request(app).get("/api/configuracoes/ia").set("Authorization", `Bearer ${tokens.admin}`);
    expect(r.body.origem).toBe("empresa");
    expect(r.body.chaveMascarada).toBe("sk-ant-…wxyz");
    expect(JSON.stringify(r.body)).not.toContain(chave);

    const d = await request(app).delete("/api/configuracoes/ia/chave").set("Authorization", `Bearer ${tokens.admin}`);
    expect(d.status).toBe(200);
    expect(d.body.chaveMascarada).toBeNull();
  });
});
