import type { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.ts";
import validateUserInput from "../../utils/validate-user-input.ts";
import { investigateTicket } from "./ticket-investigator.ts";
import {
  analyzeTicketResponseSchema,
  type AnalyzeTicketBody,
} from "./analyze-ticket.schema.ts";

export const postAnalyzeTicket = asyncHandler(
  async (req: Request<unknown, unknown, AnalyzeTicketBody>, res: Response) => {
    const gate = await validateUserInput(req.body);

    if (!gate.pass) {
      res.status(422).json({
        error: {
          code: "semantic_validation_error",
          message: "Complaint failed security guardrails",
          details: {
            reasons: gate.reasons,
            risk_flags: gate.risk_flags,
          },
        },
      });
      return;
    }

    const response = await investigateTicket(gate.sanitized);
    const validated = analyzeTicketResponseSchema.parse(response);

    res.status(200).json(validated);
  },
);
