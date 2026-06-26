import type { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.ts";
import {
  analyzeTicketResponseSchema,
  buildStubResponse,
  type AnalyzeTicketBody,
} from "./analyze-ticket.schema.ts";

export const postAnalyzeTicket = asyncHandler(
  async (req: Request<unknown, unknown, AnalyzeTicketBody>, res: Response) => {
    const response = buildStubResponse(req.body);
    const validated = analyzeTicketResponseSchema.parse(response);

    res.status(200).json(validated);
  },
);
