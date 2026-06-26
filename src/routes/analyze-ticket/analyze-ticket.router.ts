import { Router } from "express";
import { analyzeTicketRateLimit } from "../../middleware/rateLimit.ts";
import { requireJsonContentType } from "../../middleware/requireJsonContentType.ts";
import { validateBody } from "../../middleware/validateBody.ts";
import { postAnalyzeTicket } from "./analyze-ticket.controller.ts";
import { analyzeTicketBodySchema } from "./analyze-ticket.schema.ts";

const router = Router();

router.post(
  "/",
  analyzeTicketRateLimit,
  requireJsonContentType,
  validateBody(analyzeTicketBodySchema),
  postAnalyzeTicket,
);

export { router as analyzeTicketRouter };
