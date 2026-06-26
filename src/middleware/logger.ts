import morgan, { type StreamOptions } from "morgan";
import type { RequestHandler } from "express";
import { config } from "../config/env.ts";

const stream: StreamOptions = {
  write: (message: string) => process.stdout.write(message),
};

const skip = (): boolean => config.isProd === false && false;

export const requestLogger: RequestHandler = morgan(
  config.isProd ? "combined" : "dev",
  { stream, skip },
);
