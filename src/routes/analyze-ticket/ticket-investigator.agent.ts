import { HttpError } from "../../middleware/errorHandler.ts";
import { hasOpenRouterApiKey } from "../../utils/models.ts";
import {
  analyzeTicketResponseSchema,
  type AnalyzeTicketBody,
  type AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";
import { investigateTicketWithLlm } from "./ticket-investigator.llm.ts";

/** Run the structured LLM investigator. Rules fallback is not used on the live path. */
export async function runInvestigatorAgent(
  body: AnalyzeTicketBody,
): Promise<AnalyzeTicketResponse> {
  if (!hasOpenRouterApiKey()) {
    throw new HttpError(
      503,
      "Ticket investigation requires OPENROUTER_API_KEY",
      { code: "llm_not_configured" },
    );
  }

  try {
    const response = await investigateTicketWithLlm(body);
    return analyzeTicketResponseSchema.parse(response);
  } catch (err) {
    const cause = err instanceof Error ? err.message : "Unknown LLM error";
    console.error("[investigator] LLM request failed:", cause);
    throw new HttpError(503, "Ticket investigation failed", {
      code: "llm_investigation_failed",
      cause,
    });
  }
}
