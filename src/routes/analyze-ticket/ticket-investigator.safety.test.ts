import { describe, expect, test } from "bun:test";
import type { AnalyzeTicketBody, AnalyzeTicketResponse } from "./analyze-ticket.schema.ts";
import { sanitizeInvestigatorResponse } from "./ticket-investigator.safety.ts";
import { assertCustomerReplySafety } from "./test-assertions.ts";

const baseBody: AnalyzeTicketBody = {
  ticket_id: "TKT-SAFE",
  complaint: "Test complaint",
  language: "en",
};

function makeResponse(
  overrides: Partial<AnalyzeTicketResponse> = {},
): AnalyzeTicketResponse {
  return {
    ticket_id: "TKT-SAFE",
    relevant_transaction_id: "TXN-1",
    evidence_verdict: "consistent",
    case_type: "wrong_transfer",
    severity: "high",
    department: "dispute_resolution",
    agent_summary: "Summary.",
    recommended_next_action: "Review case.",
    customer_reply: "We are reviewing your case.",
    human_review_required: true,
    ...overrides,
  };
}

describe("sanitizeInvestigatorResponse", () => {
  test("injects PIN/OTP warning when missing from customer_reply", () => {
    const result = sanitizeInvestigatorResponse(
      baseBody,
      makeResponse({ customer_reply: "Thank you for contacting us." }),
    );
    expect(result.customer_reply.toLowerCase()).toMatch(/\bpin\b|\botp\b/);
    assertCustomerReplySafety(result.customer_reply);
  });

  test("strips credential requests from customer_reply", () => {
    const result = sanitizeInvestigatorResponse(
      baseBody,
      makeResponse({
        customer_reply: "Please share your OTP with us to verify.",
      }),
    );
    expect(result.customer_reply.toLowerCase()).not.toMatch(
      /share your otp with us/i,
    );
    assertCustomerReplySafety(result.customer_reply);
  });

  test("replaces unauthorized refund promise language", () => {
    const result = sanitizeInvestigatorResponse(
      baseBody,
      makeResponse({
        case_type: "refund_request",
        customer_reply: "We will refund you within 24 hours.",
      }),
    );
    expect(result.customer_reply.toLowerCase()).not.toMatch(/we will refund/);
    assertCustomerReplySafety(result.customer_reply);
  });

  test("uses safe refund language for payment_failed cases", () => {
    const result = sanitizeInvestigatorResponse(
      baseBody,
      makeResponse({
        case_type: "payment_failed",
        customer_reply: "Your payment will be refunded soon.",
      }),
    );
    expect(result.customer_reply.toLowerCase()).toContain(
      "eligible amount will be returned",
    );
  });

  test("replaces third-party channel instructions", () => {
    const result = sanitizeInvestigatorResponse(
      baseBody,
      makeResponse({
        customer_reply:
          "Contact us on whatsapp to send your transaction details.",
      }),
    );
    expect(result.customer_reply.toLowerCase()).not.toMatch(/\bwhatsapp\b/);
  });

  test("forces Bangla reply when language is bn but reply is English-only", () => {
    const result = sanitizeInvestigatorResponse(
      { ...baseBody, language: "bn" },
      makeResponse({
        customer_reply: "We have noted your concern about transaction TXN-1.",
      }),
    );
    expect(/[\u0980-\u09FF]/u.test(result.customer_reply)).toBe(true);
  });

  test("skips credential warning for merchant settlement replies", () => {
    const result = sanitizeInvestigatorResponse(
      {
        ...baseBody,
        user_type: "merchant",
        language: "en",
      },
      makeResponse({
        case_type: "merchant_settlement_delay",
        customer_reply:
          "We have noted your settlement concern and will update you through official channels.",
      }),
    );
    expect(result.customer_reply.toLowerCase()).not.toMatch(/\botp\b/);
  });

  test("always sets ticket_id from request body", () => {
    const result = sanitizeInvestigatorResponse(
      { ...baseBody, ticket_id: "TKT-FORCED" },
      makeResponse({ ticket_id: "TKT-WRONG" }),
    );
    expect(result.ticket_id).toBe("TKT-FORCED");
  });
});
