import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";

/**
 * Light structural checks after LLM output — does not re-derive case decisions.
 */
export function applyStructuralGuardrails(
  body: AnalyzeTicketBody,
  response: AnalyzeTicketResponse,
): AnalyzeTicketResponse {
  const historyIds = new Set(
    (body.transaction_history ?? []).map((txn) => txn.transaction_id),
  );

  let relevant_transaction_id = response.relevant_transaction_id;
  let evidence_verdict = response.evidence_verdict;

  if (
    relevant_transaction_id !== null &&
    !historyIds.has(relevant_transaction_id)
  ) {
    relevant_transaction_id = null;
    evidence_verdict = "insufficient_data";
  }

  return {
    ...response,
    ticket_id: body.ticket_id,
    relevant_transaction_id,
    evidence_verdict,
  };
}
