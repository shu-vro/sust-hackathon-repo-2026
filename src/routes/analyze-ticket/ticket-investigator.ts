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
import { investigateTicketWithRules } from "./ticket-investigator.rules.ts";

/**
 * Main entry point — implement this function.
 *
 * Read `body.complaint` and `body.transaction_history`, then return every
 * required field below. `ticket_id` must match `body.ticket_id`.
 */
export function investigateTicket(
  body: AnalyzeTicketBody,
): AnalyzeTicketResponse {
  // ── Replace the line below with your logic (LLM, rules, hybrid, etc.) ──
  return investigateTicketWithRules(body);

  // Example shape your implementation must return:
  //
  // return {
  //   ticket_id: body.ticket_id,
  //   relevant_transaction_id: "TXN-9901", // or null
  //   evidence_verdict: "consistent",      // consistent | inconsistent | insufficient_data
  //   case_type: "merchant_settlement_delay",
  //   severity: "medium",                  // low | medium | high | critical
  //   department: "merchant_operations",
  //   agent_summary: "...",
  //   recommended_next_action: "...",
  //   customer_reply: "...",
  //   human_review_required: false,
  //   confidence: 0.92,                    // optional
  //   reason_codes: ["merchant_settlement", "delay", "pending"], // optional
  // };
}
