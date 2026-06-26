import type { Request, Response } from "express";
import { HttpError, asyncHandler } from "../../middleware/errorHandler.ts";

interface HealthReport {
  status: "ok";
}

const VERSION = process.env.APP_VERSION ?? "0.1.0";

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  const body: HealthReport = {
    status: "ok",
  };
  res.status(200).json(body);
});