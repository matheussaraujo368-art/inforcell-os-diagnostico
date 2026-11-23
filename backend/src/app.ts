import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { autenticar } from "./middlewares/auth";
import { errorHandler } from "./middlewares/errorHandler";
import { authRoutes } from "./modules/auth.routes";
import { usuariosRoutes } from "./modules/usuarios.routes";
import { clientesRoutes } from "./modules/clientes.routes";
import { equipamentosRoutes } from "./modules/equipamentos.routes";
import { ordensRoutes } from "./modules/ordens.routes";
import { diagnosticosRoutes } from "./modules/diagnosticos.routes";
import { conhecimentoRoutes } from "./modules/conhecimento.routes";
import { dashboardRoutes } from "./modules/dashboard.routes";
import { configuracoesRoutes } from "./modules/configuracoes.routes";
import { bancadaRoutes } from "./modules/bancada.routes";

/**
 * Publica as telas junto com a API, em um único endereço. Serve só o necessário para o site,
 * e não os arquivos de código e de configuração da pasta frontend/.
 */
function servirFrontend(app: express.Express) {
  const raiz = path.resolve(process.cwd(), "../frontend");
  if (!fs.existsSync(path.join(raiz, "app.html"))) return;
  for (const pasta of ["css", "dist", "assets"]) {
    app.use(`/${pasta}`, express.static(path.join(raiz, pasta)));
  }
  app.get(["/", "/index.html"], (_req, res) => res.sendFile("index.html", { root: raiz }));
  app.get("/app.html", (_req, res) => res.sendFile("app.html", { root: raiz }));
}

export function criarApp() {
  const app = express();

  app.set("trust proxy", 1); // a hospedagem fica atrás de um proxy; o limite de tentativas precisa do IP real
  app.use(helmet({ contentSecurityPolicy: false })); // CSP desativada para o comprovante HTML imprimível
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    }),
  );
  // Fotos (e quadros de vídeo) chegam em base64: só o diagnóstico e o assistente aceitam corpo maior.
  const jsonPadrao = express.json({ limit: "1mb" });
  const jsonComFoto = express.json({ limit: "8mb" });
  const jsonBancada = express.json({ limit: "16mb" });
  app.use((req, res, next) =>
    (/\/bancada(\/|$)/.test(req.path) ? jsonBancada : /\/diagnosticos(\/|$)/.test(req.path) ? jsonComFoto : jsonPadrao)(req, res, next),
  );

  app.get("/api/health", (_req, res) => {
    // "ia" indica só a chave do servidor; cada empresa pode ter a própria (GET /api/configuracoes/ia/status).
    res.json({ status: "ok", servico: "inforcell-os-backend", ia: Boolean(env.ANTHROPIC_API_KEY) });
  });

  // Rotas públicas
  app.use("/api/auth", authRoutes);

  // Daqui em diante exige login (RNF02)
  const api = express.Router();
  api.use(autenticar);
  api.use("/usuarios", usuariosRoutes);
  api.use("/clientes", clientesRoutes);
  api.use("/equipamentos", equipamentosRoutes);
  api.use("/ordens", ordensRoutes);
  api.use("/conhecimento", conhecimentoRoutes);
  api.use("/dashboard", dashboardRoutes);
  api.use("/configuracoes", configuracoesRoutes);
  api.use("/bancada", bancadaRoutes);
  api.use("/", diagnosticosRoutes); // /ordens/:osId/diagnosticos e /diagnosticos/:id
  app.use("/api", api);

  app.use("/api", (_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
  servirFrontend(app);
  app.use(errorHandler);
  return app;
}
