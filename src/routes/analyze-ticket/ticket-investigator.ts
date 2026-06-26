/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LAYER 2 — TICKET INVESTIGATOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Called by the controller AFTER input guardrails pass.
 *  Input:  sanitized ticket (complaint + transaction_history + metadata)
 *  Output: full AnalyzeTicketResponse JSON
 *
 *  Types & enums: analyze-ticket.schema.ts
 *  Test cases:    sample-cases.fixture.ts
 *  Run tests:     bun test src/routes/analyze-ticket
 *
 *  Safety note: customer_reply will be post-processed by layer 3 later.
 *  Still avoid asking for PIN/OTP and avoid promising refunds.
 */

import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";
import { runInvestigatorAgent } from "./ticket-investigator.agent.ts";

/**
 * Main entry point — structured LLM investigator with few-shot sample I/O.
 * Falls back to rule-based analysis when the API key is missing or the LLM fails.
 */
export async function investigateTicket(
  body: AnalyzeTicketBody,
): Promise<AnalyzeTicketResponse> {
  return runInvestigatorAgent(body);
}
