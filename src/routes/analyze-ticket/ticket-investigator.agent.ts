import { hasOpenRouterApiKey } from "../../utils/models.ts";
import {
  analyzeTicketResponseSchema,
  type AnalyzeTicketBody,
  type AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";
import { investigateTicketWithLlm } from "./ticket-investigator.llm.ts";
import { investigateTicketWithRules } from "./ticket-investigator.rules.ts";

/** Run the LLM investigator with rules fallback when the API key is missing or the LLM fails. */
export async function runInvestigatorAgent(
  body: AnalyzeTicketBody,
): Promise<AnalyzeTicketResponse> {
  if (!hasOpenRouterApiKey()) {
    return investigateTicketWithRules(body);
  }

  try {
    const response = await investigateTicketWithLlm(body);
    return analyzeTicketResponseSchema.parse(response);
  } catch {
    return investigateTicketWithRules(body);
  }
}
