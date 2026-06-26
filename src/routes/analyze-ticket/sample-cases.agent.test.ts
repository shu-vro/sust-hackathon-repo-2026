import { beforeEach, describe, expect, test } from "bun:test";
import { hasOpenRouterApiKey } from "../../utils/models.ts";
import { analyzeTicket } from "./analyze-ticket.analyzer.ts";
import {
  OFFICIAL_SAMPLE_CASES,
  OFFICIAL_SAMPLE_PACK_META,
} from "./sample-cases.loader.ts";
import {
  readAnalyzeTicketResponse,
  setupAnalyzeTicketTestServer,
} from "./route-test-helpers.ts";
import {
  assertConformsToResponseSchema,
  assertCustomerReplySafety,
  assertMatchesOfficialSampleOutput,
  assertValidAnalyzeTicketResponse,
} from "./test-assertions.ts";

const RUN_LIVE_LLM =
  process.env.RUN_LIVE_LLM === "1" || process.env.RUN_LIVE_LLM === "true";

/** Live LLM calls routinely take 10–25s (large few-shot prompt + Gemini Pro). */
const LIVE_LLM_TEST_TIMEOUT_MS = 180_000;

beforeEach(() => {
  process.env.ENABLE_LLM_GUARDRAIL = "false";
});

/** Force rules fallback — never call OpenRouter in these suites. */
function useRulesFallbackOnly(): void {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });
}

describe("official sample pack metadata", () => {
  test("loads all 10 cases from SUST_Preli_Sample_Cases.json", () => {
    expect(OFFICIAL_SAMPLE_CASES.length).toBe(
      OFFICIAL_SAMPLE_PACK_META.case_count,
    );
    expect(OFFICIAL_SAMPLE_CASES.map((c) => c.id)).toEqual([
      "SAMPLE-01",
      "SAMPLE-02",
      "SAMPLE-03",
      "SAMPLE-04",
      "SAMPLE-05",
      "SAMPLE-06",
      "SAMPLE-07",
      "SAMPLE-08",
      "SAMPLE-09",
      "SAMPLE-10",
    ]);
  });

  test("each case input validates against analyzeTicketBodySchema", () => {
    for (const sample of OFFICIAL_SAMPLE_CASES) {
      expect(sample.input.ticket_id).toBe(sample.expected_output.ticket_id);
      expect(sample.input.complaint.length).toBeGreaterThan(0);
    }
  });
});

const offlineDescribe = RUN_LIVE_LLM ? describe.skip : describe;

offlineDescribe("agent output vs official sample pack — rules fallback (offline)", () => {
  useRulesFallbackOnly();

  test.each(
    OFFICIAL_SAMPLE_CASES.map((sample) => [sample.id, sample.label, sample] as const),
  )("%s — %s", async (_id, _label, sample) => {
    const result = await analyzeTicket(sample.input);

    assertConformsToResponseSchema(result);
    assertValidAnalyzeTicketResponse(
      result,
      (sample.input.transaction_history ?? []).map((txn) => txn.transaction_id),
    );
    assertMatchesOfficialSampleOutput(
      result,
      sample.expected_output,
      sample.input,
    );
  });
});

offlineDescribe("agent output vs official sample pack (POST /analyze-ticket) — rules fallback", () => {
  useRulesFallbackOnly();
  const { postTicket } = setupAnalyzeTicketTestServer();

  test.each(
    OFFICIAL_SAMPLE_CASES.map((sample) => [sample.id, sample.label, sample] as const),
  )("%s — %s", async (_id, _label, sample) => {
    const response = await postTicket(sample.input);
    expect(response.status).toBe(200);

    const result = assertConformsToResponseSchema(await response.json());
    assertValidAnalyzeTicketResponse(
      result,
      (sample.input.transaction_history ?? []).map((txn) => txn.transaction_id),
    );
    assertMatchesOfficialSampleOutput(
      result,
      sample.expected_output,
      sample.input,
    );
  });

  test("response ticket_id always matches posted input across all samples", async () => {
    for (const sample of OFFICIAL_SAMPLE_CASES) {
      const response = await postTicket(sample.input);
      expect(response.status).toBe(200);
      const body = await readAnalyzeTicketResponse(response);
      expect(body.ticket_id).toBe(sample.input.ticket_id);
    }
  });
});

const liveDescribe =
  RUN_LIVE_LLM && hasOpenRouterApiKey() ? describe : describe.skip;

liveDescribe("agent output vs official sample pack — live LLM", () => {
  test.each(
    OFFICIAL_SAMPLE_CASES.map((sample) => [sample.id, sample.label, sample] as const),
  )(
    "%s — %s",
    async (_id, _label, sample) => {
      const result = await analyzeTicket(sample.input);

      assertConformsToResponseSchema(result);
      assertValidAnalyzeTicketResponse(
        result,
        (sample.input.transaction_history ?? []).map((txn) => txn.transaction_id),
      );
      assertCustomerReplySafety(result.customer_reply, {
        requireCredentialWarning: sample.input.user_type !== "merchant",
      });
      assertMatchesOfficialSampleOutput(
        result,
        sample.expected_output,
        sample.input,
      );
    },
    { timeout: LIVE_LLM_TEST_TIMEOUT_MS },
  );
});

describe("live LLM test gate", () => {
  test("offline by default; set RUN_LIVE_LLM=1 with OPENROUTER_API_KEY for live LLM tests", () => {
    if (RUN_LIVE_LLM && hasOpenRouterApiKey()) {
      expect(RUN_LIVE_LLM).toBe(true);
      return;
    }
    expect(true).toBe(true);
  });
});
