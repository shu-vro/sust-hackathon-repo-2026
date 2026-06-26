import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./src/config/env.ts";
import { requestLogger } from "./src/middleware/logger.ts";
import {
  errorHandler,
  notFoundHandler,
} from "./src/middleware/errorHandler.ts";
import { analyzeTicketRouter } from "./src/routes/analyze-ticket/analyze-ticket.router.ts";
import { healthRouter } from "./src/routes/health/health.router.ts";
import { hasOpenRouterApiKey } from "./src/utils/models.ts";

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(requestLogger);

  app.use("/health", healthRouter);
  app.use("/analyze-ticket", analyzeTicketRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function startServer(): void {
  if (!hasOpenRouterApiKey()) {
    console.error(
      "[server] OPENROUTER_API_KEY is required — all ticket analysis is routed through the LLM",
    );
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] listening on http://${config.host}:${config.port}`);
    console.log(`[server] env=${config.nodeEnv} api=${config.apiPrefix}`);
  });

  function shutdown(signal: NodeJS.Signals): void {
    console.log(`[server] received ${signal}, shutting down`);
    server.close((err) => {
      if (err) {
        console.error("[server] error during shutdown", err);
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) {
  startServer();
}
