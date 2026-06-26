import { describe, expect, test } from "bun:test";
import type { AnalyzeTicketBody, AnalyzeTicketResponse } from "./analyze-ticket.schema.ts";
import { applyStructuralGuardrails } from "./ticket-investigator.guardrails.ts";

const baseBody: AnalyzeTicketBody = {
  ticket_id: "TKT-GUARD",
  complaint: "Test complaint",
  transaction_history: [
    {
      transaction_id: "TXN-VALID",
      timestamp: "2026-04-14T10:00:00Z",
      type: "transfer",
      amount: 1000,
      counterparty: "+8801711111111",
      status: "completed",
    },
  ],
};

function makeResponse(
  overrides: Partial<AnalyzeTicketResponse> = {},
): AnalyzeTicketResponse {
  return {
    ticket_id: "WRONG-ID",
    relevant_transaction_id: "TXN-VALID",
    evidence_verdict: "consistent",
    case_type: "wrong_transfer",
    severity: "high",
    department: "dispute_resolution",
    agent_summary: "Summary.",
    recommended_next_action: "Review.",
    customer_reply: "Reply.",
    human_review_required: true,
    ...overrides,
  };
}

describe("applyStructuralGuardrails", () => {
  test("echoes ticket_id from request", () => {
    const result = applyStructuralGuardrails(baseBody, makeResponse());
    expect(result.ticket_id).toBe("TKT-GUARD");
  });

  test("keeps valid relevant_transaction_id from history", () => {
    const result = applyStructuralGuardrails(baseBody, makeResponse());
    expect(result.relevant_transaction_id).toBe("TXN-VALID");
    expect(result.evidence_verdict).toBe("consistent");
  });

  test("nulls unknown transaction id and sets insufficient_data", () => {
    const result = applyStructuralGuardrails(
      baseBody,
      makeResponse({
        relevant_transaction_id: "TXN-UNKNOWN",
        evidence_verdict: "consistent",
      }),
    );
    expect(result.relevant_transaction_id).toBeNull();
    expect(result.evidence_verdict).toBe("insufficient_data");
  });

  test("preserves null relevant_transaction_id", () => {
    const result = applyStructuralGuardrails(
      baseBody,
      makeResponse({
        relevant_transaction_id: null,
        evidence_verdict: "insufficient_data",
        case_type: "other",
      }),
    );
    expect(result.relevant_transaction_id).toBeNull();
    expect(result.evidence_verdict).toBe("insufficient_data");
  });

  test("does not change case_type or department", () => {
    const result = applyStructuralGuardrails(
      baseBody,
      makeResponse({
        relevant_transaction_id: "TXN-UNKNOWN",
        case_type: "payment_failed",
        department: "payments_ops",
      }),
    );
    expect(result.case_type).toBe("payment_failed");
    expect(result.department).toBe("payments_ops");
  });
});
