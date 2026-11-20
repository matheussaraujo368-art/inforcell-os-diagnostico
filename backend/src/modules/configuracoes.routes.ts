import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { autorizar, usuarioAtual } from "../middlewares/auth";
import { AppError } from "../utils/http";
import { cifrar, decifrar, mascararChave } from "../services/cripto";
import { configIADaEmpresa, iaDisponivel, MODELOS_SUGERIDOS, testarChave } from "../services/ia.service";

/**
 * Configurações da empresa — assistente de IA.
 *
 * O administrador cola a chave da Anthropic; ela é testada, criptografada e salva no banco.
 * A chave completa nunca volta para o navegador: as respostas trazem só o começo e o fim dela.
 */
export const configuracoesRoutes = Router();

/** Testar chaves consulta a Anthropic: limita para não virar um "testador de chaves". */
const limitarTestes = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { erro: "Muitos testes de chave em pouco tempo. Aguarde alguns minutos." },
});

// Qualquer perfil logado pode saber se a IA está disponível (as telas de OS e diagnóstico usam isso).
configuracoesRoutes.get("/ia/status", async (req, res) => {
  const u = usuarioAtual(req);
  res.json({ disponivel: await iaDisponivel(u.empresaId) });
});

configuracoesRoutes.use(autorizar("ADMIN"));

async function situacaoIA(empresaId: number) {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { iaChaveCifrada: true, iaModelo: true },
  });
  const chaveEmpresa = empresa.iaChaveCifrada ? decifrar(empresa.iaChaveCifrada) : null;
  const config = await configIADaEmpresa(empresaId);
  return {
    /** "empresa", "servidor" ou null (sem IA). */
    origem: config?.origem ?? null,
    chaveMascarada: chaveEmpresa ? mascararChave(chaveEmpresa) : null,
    /** A chave salva não pôde ser lida (o segredo do servidor mudou): é preciso cadastrar de novo. */
    chaveIlegivel: Boolean(empresa.iaChaveCifrada && !chaveEmpresa),
    servidorTemChave: Boolean(env.ANTHROPIC_API_KEY),
    modelo: empresa.iaModelo || env.ANTHROPIC_MODEL,
    modeloPadrao: env.ANTHROPIC_MODEL,
    modelosSugeridos: MODELOS_SUGERIDOS,
  };
}

configuracoesRoutes.get("/ia", async (req, res) => {
  res.json(await situacaoIA(usuarioAtual(req).empresaId));
});

const salvarSchema = z
  .object({
    chave: z
      .string()
      .trim()
      .min(20, "Chave muito curta.")
      .max(300)
      .regex(/^sk-ant-[\w-]+$/, 'A chave da Anthropic começa com "sk-ant-". Copie-a de novo em console.anthropic.com.')
      .optional(),
    modelo: z
      .string()
      .trim()
      .max(80)
      .regex(/^[\w.-]+$/, "Nome de modelo inválido.")
      .optional(),
  })
  .refine((d) => d.chave || d.modelo, "Informe a chave ou o modelo.");

/** Salva a chave e/ou o modelo. Antes de salvar, testa a combinação na Anthropic. */
configuracoesRoutes.put("/ia", limitarTestes, async (req, res) => {
  const u = usuarioAtual(req);
  const dados = salvarSchema.parse(req.body);
  const atual = await configIADaEmpresa(u.empresaId);
  const chave = dados.chave ?? atual?.apiKey;
  const modelo = dados.modelo ?? atual?.modelo ?? env.ANTHROPIC_MODEL;
  if (!chave) throw new AppError(400, "Cadastre a chave da Anthropic antes de escolher o modelo.");

  const teste = await testarChave(chave, modelo);
  await prisma.empresa.update({
    where: { id: u.empresaId },
    data: {
      ...(dados.chave ? { iaChaveCifrada: cifrar(dados.chave) } : {}),
      // Guarda o modelo só se for diferente do padrão do servidor.
      iaModelo: teste.modelo === env.ANTHROPIC_MODEL ? null : teste.modelo,
    },
  });
  res.json({ ...(await situacaoIA(u.empresaId)), teste });
});

/** Testa a configuração atual sem alterar nada. */
configuracoesRoutes.post("/ia/testar", limitarTestes, async (req, res) => {
  const config = await configIADaEmpresa(usuarioAtual(req).empresaId);
  if (!config) throw new AppError(400, "Nenhuma chave de IA configurada para testar.");
  res.json({ origem: config.origem, ...(await testarChave(config.apiKey, config.modelo)) });
});

/** Remove a chave da empresa. Se o servidor tiver chave própria, ela passa a valer. */
configuracoesRoutes.delete("/ia/chave", async (req, res) => {
  const u = usuarioAtual(req);
  await prisma.empresa.update({ where: { id: u.empresaId }, data: { iaChaveCifrada: null } });
  res.json(await situacaoIA(u.empresaId));
});
