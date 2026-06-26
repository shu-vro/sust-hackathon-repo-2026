import express, { type Application, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./src/config/env.ts";
import { requestLogger } from "./src/middleware/logger.ts";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.ts";
import { healthRouter } from "./src/routes/health/health.router.ts";
import { v1Router } from "./src/routes/v1/index.ts";

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(requestLogger);

  app.use(async function (req:Request, res: Response, next: NextFunction) {
    req._success = async (data, status) => {
        res.status(status || 200).json(data);
    }
  })

  app.use("/health", healthRouter);
  app.use(config.apiPrefix, v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
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