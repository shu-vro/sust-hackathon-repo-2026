import { beforeAll, describe, expect, test } from "bun:test";
import { hasOpenRouterApiKey } from "../../../utils/models.ts";
import {
  checkAnalyzeTicketServerHealth,
  DEFAULT_EVAL_BASE_URL,
  formatPipelineReport,
  runParallelEvaluation,
} from "./parallel-pipeline.ts";
import { SAMPLE_CASE_PAIRS } from "./sample-case-pairs.loader.ts";

const EVAL_BASE_URL = process.env.EVAL_BASE_URL ?? DEFAULT_EVAL_BASE_URL;
const EVAL_CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 5);
const RUN_LIVE_EVAL =
  process.env.RUN_LIVE_EVAL === "1" || process.env.RUN_LIVE_EVAL === "true";

const canRunLive =
  RUN_LIVE_EVAL &&
  hasOpenRouterApiKey() &&
  (await checkAnalyzeTicketServerHealth(EVAL_BASE_URL));

const liveDescribe = canRunLive ? describe : describe.skip;

liveDescribe("parallel sample case evaluation (live API + Gemini Pro)", () => {
  beforeAll(() => {
    if (!hasOpenRouterApiKey()) {
      throw new Error("OPENROUTER_API_KEY required for live evaluation");
    }
  });

  test("server health check passes", async () => {
    const healthy = await checkAnalyzeTicketServerHealth(EVAL_BASE_URL);
    expect(healthy).toBe(true);
  });

  test(`evaluates all ${SAMPLE_CASE_PAIRS.length} cases with concurrency ${EVAL_CONCURRENCY}`, async () => {
    const report = await runParallelEvaluation({
      baseUrl: EVAL_BASE_URL,
      concurrency: EVAL_CONCURRENCY,
      useGemini: true,
    });

    console.log(formatPipelineReport(report));

    expect(report.total).toBe(SAMPLE_CASE_PAIRS.length);
    expect(report.concurrency).toBe(EVAL_CONCURRENCY);

    for (const result of report.results) {
      expect(result.httpStatus).toBe(200);
      expect(result.schemaValid).toBe(true);
      expect(result.gemini).toBeDefined();
    }

    const failures = report.results.filter((r) => !r.passed);
    if (failures.length > 0) {
      const summary = failures
        .map(
          (f) =>
            `${f.id}: ${f.gemini?.reasoning ?? f.error ?? "unknown failure"}`,
        )
        .join("\n");
      expect.fail(`${failures.length} case(s) failed Gemini evaluation:\n${summary}`);
    }

    expect(report.passed).toBe(report.total);
  }, { timeout: 180_000 });
});

describe("parallel sample case evaluation (offline guards)", () => {
  test("skips live eval unless RUN_LIVE_EVAL=1 with server and API key", () => {
    if (canRunLive) {
      expect(RUN_LIVE_EVAL).toBe(true);
      expect(hasOpenRouterApiKey()).toBe(true);
      return;
    }

    expect(true).toBe(true);
  });
});
