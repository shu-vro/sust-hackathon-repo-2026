import type { Request, Response } from "express";
import { asyncHandler } from "../../../middleware/errorHandler.ts";

interface EchoRequestBody {
  message: string;
  repeat?: number;
}

export const postEcho = asyncHandler(async (req: Request<unknown, unknown, EchoRequestBody>, res: Response) => {
  const { message, repeat = 1 } = req.body;
  res.status(200).json({
    message,
    repeated: Array.from({ length: repeat }, () => message),
  });
});