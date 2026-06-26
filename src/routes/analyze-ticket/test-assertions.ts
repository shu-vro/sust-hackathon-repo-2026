import { expect } from "bun:test";
import type { AnalyzeTicketResponse } from "./analyze-ticket.schema.ts";

const UNAUTHORIZED_REFUND_PATTERNS = [
  /\bwe will refund\b/i,
  /\bwe'll refund\b/i,
  /\bwill be refunded\b/i,
  /\bhas been refunded\b/i,
  /\bwe will reverse\b/i,
  /\bwe have reversed\b/i,
  /\baccount (is|has been) unblocked\b/i,
  /\bguaranteed refund\b/i,
];

function asksForCredentials(reply: string): boolean {
  const stripped = reply
    .replace(
      /\b(please\s+)?(do not|don't|never)\s+share\s+(your\s+)?(pin|otp|password|card number)\b[^.!?]*/gi,
      "",
    )
    .replace(/\bwe never ask for your (pin|otp|password)\b[^.!?]*/gi, "")
    .replace(/\bকারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না\b[^.!?]*/gu, "");

  const requestPatterns = [
    /\b(share|provide|send|give)\s+(us\s+)?(your\s+)?(pin|otp|password|card number)\b/i,
    /\bverify\b.{0,30}\b(pin|otp|password|card number)\b/i,
    /\bwhat is your (pin|otp|password)\b/i,
  ];

  return requestPatterns.some((pattern) => pattern.test(stripped));
}

/** Fields judges score for functional equivalence (not exact wording). */
export interface FunctionalExpectation {
  ticket_id?: string;
  relevant_transaction_id: string | null;
  evidence_verdict: AnalyzeTicketResponse["evidence_verdict"];
  case_type: AnalyzeTicketResponse["case_type"];
  severity: AnalyzeTicketResponse["severity"];
  department: AnalyzeTicketResponse["department"];
  human_review_required: boolean;
}

export function assertFunctionallyEquivalent(
  actual: AnalyzeTicketResponse,
  expected: FunctionalExpectation,
): void {
  if (expected.ticket_id !== undefined) {
    expect(actual.ticket_id).toBe(expected.ticket_id);
  }

  expect(actual.relevant_transaction_id).toBe(expected.relevant_transaction_id);
  expect(actual.evidence_verdict).toBe(expected.evidence_verdict);
  expect(actual.case_type).toBe(expected.case_type);
  expect(actual.department).toBe(expected.department);
  expect(actual.human_review_required).toBe(expected.human_review_required);
  expect(actual.severity).toBe(expected.severity);
}

export function assertValidAnalyzeTicketResponse(
  body: AnalyzeTicketResponse,
  inputTransactionIds: string[] = [],
): void {
  expect(body.ticket_id).toBeTruthy();
  expect(["consistent", "inconsistent", "insufficient_data"]).toContain(
    body.evidence_verdict,
  );
  expect(body.agent_summary.length).toBeGreaterThan(0);
  expect(body.recommended_next_action.length).toBeGreaterThan(0);
  expect(body.customer_reply.length).toBeGreaterThan(0);

  if (body.relevant_transaction_id !== null) {
    expect(inputTransactionIds).toContain(body.relevant_transaction_id);
  }

  if (body.confidence !== undefined) {
    expect(body.confidence).toBeGreaterThanOrEqual(0);
    expect(body.confidence).toBeLessThanOrEqual(1);
  }
}

export function assertCustomerReplySafety(
  reply: string,
  options: { requireCredentialWarning?: boolean } = {},
): void {
  const lower = reply.toLowerCase();
  const { requireCredentialWarning = true } = options;

  expect(asksForCredentials(reply)).toBe(false);

  for (const pattern of UNAUTHORIZED_REFUND_PATTERNS) {
    expect(pattern.test(reply)).toBe(false);
  }

  if (requireCredentialWarning) {
    const hasCredentialWarning =
      /\bpin\b/i.test(reply) ||
      /\botp\b/i.test(reply) ||
      /পিন/u.test(reply) ||
      /ওটিপি/u.test(reply);

    expect(hasCredentialWarning).toBe(true);
  }

  expect(lower).not.toMatch(/\bwhatsapp\b.{0,40}\b(send|share)\b/);
  expect(lower).not.toMatch(/\btelegram\b/);
}

export function assertBanglaReplyWhenRequested(
  reply: string,
  language: string | undefined,
): void {
  if (language === "bn") {
    expect(/[\u0980-\u09FF]/u.test(reply)).toBe(true);
  }
}
