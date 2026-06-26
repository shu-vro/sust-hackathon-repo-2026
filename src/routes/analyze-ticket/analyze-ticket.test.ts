import { beforeEach, describe, expect, test } from "bun:test";
import { analyzeTicket } from "./analyze-ticket.analyzer.ts";
import {
  type AnalyzeTicketBody,
} from "./analyze-ticket.schema.ts";
import { PUBLIC_SAMPLE_CASES } from "./sample-cases.fixture.ts";
import { buildRulesAnalysis } from "./ticket-investigator.rules.ts";
import { runInvestigatorAgent } from "./ticket-investigator.agent.ts";
import {
  assertBanglaReplyWhenRequested,
  assertConformsToResponseSchema,
  assertCustomerReplySafety,
  assertFunctionallyEquivalent,
  assertValidAnalyzeTicketResponse,
} from "./test-assertions.ts";

beforeEach(() => {
  process.env.ENABLE_LLM_GUARDRAIL = "false";
  delete process.env.OPENROUTER_API_KEY;
});

describe("analyzeTicket analyzer unit tests", () => {
  test.each(PUBLIC_SAMPLE_CASES.map((sample) => [sample.id, sample] as const))(
    "%s matches functional expectations",
    async (_id, sample) => {
      const result = await analyzeTicket(sample.input);
      assertConformsToResponseSchema(result);
      assertFunctionallyEquivalent(result, {
        ticket_id: sample.input.ticket_id,
        ...sample.expected,
      });
      assertValidAnalyzeTicketResponse(
        result,
        (sample.input.transaction_history ?? []).map(
          (txn) => txn.transaction_id,
        ),
      );
      assertCustomerReplySafety(result.customer_reply, {
        requireCredentialWarning: sample.input.user_type !== "merchant",
      });
      assertBanglaReplyWhenRequested(
        result.customer_reply,
        sample.input.language,
      );
    },
  );
});

describe("analyzeTicket edge cases", () => {
  test("single prior transfer to same recipient is not inconsistent", async () => {
    const body: AnalyzeTicketBody = {
      ticket_id: "TKT-EDGE-01",
      complaint: "I sent 3000 to the wrong person by mistake.",
      transaction_history: [
        {
          transaction_id: "TXN-A",
          timestamp: "2026-04-14T12:00:00Z",
          type: "transfer",
          amount: 3000,
          counterparty: "+8801711111111",
          status: "completed",
        },
        {
          transaction_id: "TXN-B",
          timestamp: "2026-04-10T12:00:00Z",
          type: "transfer",
          amount: 1000,
          counterparty: "+8801711111111",
          status: "completed",
        },
      ],
    };

    const result = await analyzeTicket(body);
    expect(result.relevant_transaction_id).toBe("TXN-A");
    expect(result.evidence_verdict).toBe("consistent");
    expect(result.case_type).toBe("wrong_transfer");
  });

  test("handles metadata and minimal optional fields", async () => {
    const body: AnalyzeTicketBody = {
      ticket_id: "TKT-MIN",
      complaint: "I sent 500 taka to the wrong number. Please help.",
      metadata: { source: "ivr", retry_count: 1 },
    };

    const result = await analyzeTicket(body);
    expect(result.ticket_id).toBe("TKT-MIN");
    expect(result.case_type).toBe("wrong_transfer");
    assertCustomerReplySafety(result.customer_reply);
  });

  test("mixed-language phishing report routes to fraud_risk", async () => {
    const body: AnalyzeTicketBody = {
      ticket_id: "TKT-MIXED",
      complaint:
        "Someone called and asked for OTP — eta ki scam? I did not share anything.",
      language: "mixed",
      transaction_history: [],
    };

    const result = await analyzeTicket(body);
    expect(result.case_type).toBe("phishing_or_social_engineering");
    expect(result.department).toBe("fraud_risk");
    expect(result.severity).toBe("critical");
  });

  test("reversed transaction with failed-payment claim stays consistent when matched", async () => {
    const body: AnalyzeTicketBody = {
      ticket_id: "TKT-REV",
      complaint:
        "My payment of 999 taka failed but money was deducted from balance.",
      transaction_history: [
        {
          transaction_id: "TXN-REV-1",
          timestamp: "2026-04-14T10:00:00Z",
          type: "payment",
          amount: 999,
          counterparty: "MERCHANT-X",
          status: "reversed",
        },
      ],
    };

    const result = await analyzeTicket(body);
    expect(result.relevant_transaction_id).toBe("TXN-REV-1");
    expect(result.case_type).toBe("payment_failed");
    expect(result.department).toBe("payments_ops");
  });

  test("complaint mentioning refund does not produce unauthorized refund promise", async () => {
    const result = await analyzeTicket(PUBLIC_SAMPLE_CASES[2]!.input);
    expect(result.customer_reply.toLowerCase()).toContain(
      "eligible amount will be returned",
    );
    assertCustomerReplySafety(result.customer_reply);
  });
});

describe("buildRulesAnalysis", () => {
  test.each(PUBLIC_SAMPLE_CASES.map((sample) => [sample.id, sample] as const))(
    "%s produces expected decision fields",
    (_id, sample) => {
      const analysis = buildRulesAnalysis(sample.input);
      expect(analysis.relevant_transaction_id).toBe(
        sample.expected.relevant_transaction_id,
      );
      expect(analysis.evidence_verdict).toBe(sample.expected.evidence_verdict);
      expect(analysis.case_type).toBe(sample.expected.case_type);
      expect(analysis.severity).toBe(sample.expected.severity);
      expect(analysis.department).toBe(sample.expected.department);
      expect(analysis.human_review_required).toBe(
        sample.expected.human_review_required,
      );
    },
  );
});

describe("runInvestigatorAgent fallback", () => {
  test("uses rules engine when OPENROUTER_API_KEY is missing", async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const result = await runInvestigatorAgent(PUBLIC_SAMPLE_CASES[0]!.input);
      assertFunctionallyEquivalent(result, {
        ticket_id: "TKT-001",
        ...PUBLIC_SAMPLE_CASES[0]!.expected,
      });
    } finally {
      if (original === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = original;
      }
    }
  });
});
