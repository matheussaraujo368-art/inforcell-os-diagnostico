import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { usuarioAtual } from "../middlewares/auth";
import { AppError, parseId } from "../utils/http";
import { conversarBancada, HISTORICO_MAX } from "../services/bancada.service";
import { criarFerramentasBancada } from "../services/ferramentasAgente";
import { iaDisponivel, MENSAGEM_IA_NAO_CONFIGURADA } from "../services/ia.service";

/**
 * Assistente de bancada: conversas livres de cada usuário com a IA.
 * Cada pessoa vê só as próprias conversas, sempre dentro da empresa dela.
 * Fotos e quadros de vídeo vão só para a IA naquela resposta e não são guardados.
 */
export const bancadaRoutes = Router();

const imagemSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  dados: z
    .string()
    .max(7_000_000, "Imagem grande demais (máximo 5 MB).")
    .regex(/^[A-Za-z0-9+/=]+$/, "Imagem em formato inválido."),
});

const mensagemSchema = z
  .object({
    texto: z.string().max(8000, "Mensagem longa demais.").default(""),
    anexos: z
      .object({
        tipo: z.enum(["foto", "video"]),
        imagens: z.array(imagemSchema).min(1).max(8, "Envie no máximo 8 imagens por mensagem."),
      })
      .optional(),
  })
  .refine((d) => d.texto.trim().length > 0 || d.anexos, "Escreva uma mensagem ou anexe uma foto ou vídeo.");

async function buscarConversa(id: number, usuarioId: number, empresaId: number) {
  const conversa = await prisma.conversaBancada.findFirst({ where: { id, usuarioId, empresaId } });
  if (!conversa) throw new AppError(404, "Conversa não encontrada.");
  return conversa;
}

function tituloDe(texto: string, anexos?: { tipo: string }): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (limpo) return limpo.length > 60 ? `${limpo.slice(0, 57)}…` : limpo;
  return anexos?.tipo === "video" ? "Análise de vídeo" : "Análise de foto";
}

/** Envia a mensagem à IA e salva pergunta e resposta juntas (se a IA falhar, nada é salvo). */
async function responder(conversaId: number | null, req: Parameters<Parameters<typeof bancadaRoutes.post>[1]>[0]) {
  const u = usuarioAtual(req);
  const { texto, anexos } = mensagemSchema.parse(req.body);
  if (!(await iaDisponivel(u.empresaId))) throw new AppError(503, MENSAGEM_IA_NAO_CONFIGURADA);

  const anteriores = conversaId
    ? await prisma.mensagemBancada.findMany({
        where: { conversaId },
        orderBy: { id: "desc" },
        take: HISTORICO_MAX,
        select: { autor: true, conteudo: true },
      })
    : [];
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId }, select: { nome: true } });
  const resposta = await conversarBancada(
    u.empresaId,
    empresa.nome,
    anteriores.reverse(),
    texto,
    anexos,
    criarFerramentasBancada(u.empresaId),
  );

  const resumoAnexos = anexos ? { tipo: anexos.tipo, quantidade: anexos.imagens.length } : undefined;
  return prisma.$transaction(async (tx) => {
    const conversa = conversaId
      ? await tx.conversaBancada.update({ where: { id: conversaId }, data: { updatedAt: new Date() } })
      : await tx.conversaBancada.create({ data: { empresaId: u.empresaId, usuarioId: u.id, titulo: tituloDe(texto, anexos) } });
    const pergunta = await tx.mensagemBancada.create({
      data: { conversaId: conversa.id, autor: "TECNICO", conteudo: texto.trim(), anexos: resumoAnexos },
    });
    const respostaIA = await tx.mensagemBancada.create({
      data: { conversaId: conversa.id, autor: "IA", conteudo: resposta.texto, passos: resposta.passos.length ? (resposta.passos as unknown as Prisma.InputJsonValue) : undefined },
    });
    return { conversa, mensagens: [pergunta, respostaIA] };
  });
}

bancadaRoutes.get("/conversas", async (req, res) => {
  const u = usuarioAtual(req);
  res.json(
    await prisma.conversaBancada.findMany({
      where: { usuarioId: u.id, empresaId: u.empresaId },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: { id: true, titulo: true, updatedAt: true },
    }),
  );
});

bancadaRoutes.get("/conversas/:id", async (req, res) => {
  const u = usuarioAtual(req);
  const conversa = await buscarConversa(parseId(req.params.id), u.id, u.empresaId);
  const mensagens = await prisma.mensagemBancada.findMany({ where: { conversaId: conversa.id }, orderBy: { id: "asc" } });
  res.json({ ...conversa, mensagens });
});

/** Começa uma conversa nova com a primeira mensagem. */
bancadaRoutes.post("/conversas", async (req, res) => {
  res.status(201).json(await responder(null, req));
});

bancadaRoutes.post("/conversas/:id/mensagens", async (req, res) => {
  const u = usuarioAtual(req);
  const conversa = await buscarConversa(parseId(req.params.id), u.id, u.empresaId);
  res.status(201).json(await responder(conversa.id, req));
});

bancadaRoutes.patch("/conversas/:id", async (req, res) => {
  const u = usuarioAtual(req);
  const conversa = await buscarConversa(parseId(req.params.id), u.id, u.empresaId);
  const { titulo } = z.object({ titulo: z.string().trim().min(1).max(120) }).parse(req.body);
  res.json(await prisma.conversaBancada.update({ where: { id: conversa.id }, data: { titulo }, select: { id: true, titulo: true, updatedAt: true } }));
});

bancadaRoutes.delete("/conversas/:id", async (req, res) => {
  const u = usuarioAtual(req);
  const conversa = await buscarConversa(parseId(req.params.id), u.id, u.empresaId);
  await prisma.conversaBancada.delete({ where: { id: conversa.id } });
  res.status(204).end();
});
