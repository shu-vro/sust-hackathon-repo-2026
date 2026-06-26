import { expect } from "bun:test";
import {
  analyzeTicketResponseSchema,
  type AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";

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

export interface ApiErrorShape {
  error: { code: string; message: string; details?: unknown };
}

export function assertConformsToResponseSchema(
  body: unknown,
): AnalyzeTicketResponse {
  const parsed = analyzeTicketResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `Response failed schema validation: ${JSON.stringify(parsed.error.flatten())}`,
    );
  }
  expect(parsed.success).toBe(true);
  return parsed.data;
}

export function assertRequiredResponseFields(body: Record<string, unknown>): void {
  const required = [
    "ticket_id",
    "relevant_transaction_id",
    "evidence_verdict",
    "case_type",
    "severity",
    "department",
    "agent_summary",
    "recommended_next_action",
    "customer_reply",
    "human_review_required",
  ] as const;

  for (const key of required) {
    expect(body).toHaveProperty(key);
  }

  expect(typeof body.ticket_id).toBe("string");
  expect(
    body.relevant_transaction_id === null ||
      typeof body.relevant_transaction_id === "string",
  ).toBe(true);
  expect(typeof body.human_review_required).toBe("boolean");
  expect(typeof body.agent_summary).toBe("string");
  expect(typeof body.recommended_next_action).toBe("string");
  expect(typeof body.customer_reply).toBe("string");
}

export function assertErrorResponseSafe(body: ApiErrorShape): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/OPENROUTER_API_KEY/i);
  expect(serialized).not.toMatch(/at\s+\S+\.(ts|js):\d+/);
  expect(serialized).not.toMatch(/stack/i);
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

/** Full expected_output shape from SUST_Preli_Sample_Cases.json. */
export interface OfficialSampleExpectation {
  ticket_id: string;
  relevant_transaction_id: string | null;
  evidence_verdict: AnalyzeTicketResponse["evidence_verdict"];
  case_type: AnalyzeTicketResponse["case_type"];
  severity: AnalyzeTicketResponse["severity"];
  department: AnalyzeTicketResponse["department"];
  agent_summary: string;
  recommended_next_action: string;
  customer_reply: string;
  human_review_required: boolean;
  confidence?: number;
  reason_codes?: string[];
}

/**
 * Assert agent output matches the official sample pack per hackathon guidance:
 * exact decision fields, safe customer_reply, and reasonable text.
 * Optional fields (confidence, reason_codes) are validated only when present.
 */
export function assertMatchesOfficialSampleOutput(
  actual: AnalyzeTicketResponse,
  expected: OfficialSampleExpectation,
  input: { language?: string; user_type?: string },
): void {
  assertFunctionallyEquivalent(actual, expected);

  assertCustomerReplySafety(actual.customer_reply, {
    requireCredentialWarning: input.user_type !== "merchant",
  });
  assertBanglaReplyWhenRequested(actual.customer_reply, input.language);

  if (expected.relevant_transaction_id) {
    expect(actual.agent_summary).toContain(expected.relevant_transaction_id);
    if (expected.customer_reply.includes(expected.relevant_transaction_id)) {
      expect(actual.customer_reply).toContain(expected.relevant_transaction_id);
    }
  } else {
    expect(actual.relevant_transaction_id).toBeNull();
  }

  if (expected.confidence !== undefined && actual.confidence !== undefined) {
    expect(actual.confidence).toBeGreaterThanOrEqual(0);
    expect(actual.confidence).toBeLessThanOrEqual(1);
  }

  if (actual.reason_codes !== undefined) {
    expect(Array.isArray(actual.reason_codes)).toBe(true);
    for (const code of actual.reason_codes) {
      expect(typeof code).toBe("string");
      expect(code.trim().length).toBeGreaterThan(0);
    }
  }

  assertCaseSpecificOutputQuality(actual, expected);
}

function assertCaseSpecificOutputQuality(
  actual: AnalyzeTicketResponse,
  expected: OfficialSampleExpectation,
): void {
  const reply = actual.customer_reply.toLowerCase();
  const combined = `${actual.customer_reply} ${actual.recommended_next_action}`.toLowerCase();

  switch (expected.case_type) {
    case "payment_failed":
    case "duplicate_payment":
      expect(reply).toMatch(
        /eligible amount will be returned|official channels/,
      );
      expect(reply).not.toMatch(/we will refund/);
      break;
    case "refund_request":
      expect(reply).not.toMatch(/we will refund|will be refunded/);
      expect(reply).toMatch(/merchant/);
      break;
    case "phishing_or_social_engineering":
      expect(reply).toMatch(/never ask|do not share|don't share/);
      break;
    case "other":
      if (expected.evidence_verdict === "insufficient_data") {
        expect(combined).toMatch(
          /transaction id|amount|detail|clarif|share|wrong|what went wrong/,
        );
      }
      break;
    case "wrong_transfer":
      if (expected.evidence_verdict === "insufficient_data") {
        expect(combined).toMatch(
          /brother|number|clarif|identify|which transaction|share/,
        );
      }
      break;
    case "merchant_settlement_delay":
      expect(reply).toMatch(/settlement|merchant/);
      break;
    case "agent_cash_in_issue":
      expect(actual.agent_summary.toLowerCase()).toMatch(/cash|pending|agent/);
      break;
    default:
      break;
  }

  expect(actual.agent_summary.length).toBeGreaterThan(20);
  expect(actual.recommended_next_action.length).toBeGreaterThan(20);
  expect(actual.customer_reply.length).toBeGreaterThan(20);
}
