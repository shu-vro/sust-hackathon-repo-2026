import {
  analyzeTicketResponseSchema,
  type AnalyzeTicketResponse,
} from "../analyze-ticket.schema.ts";
import { evaluateResponseWithGemini } from "./gemini-evaluator.ts";
import {
  SAMPLE_CASE_PAIRS,
  type SampleCasePair,
} from "./sample-case-pairs.loader.ts";

export const DEFAULT_EVAL_BASE_URL = "http://localhost:8000";
export const DEFAULT_EVAL_CONCURRENCY = 5;
export const DEFAULT_EVAL_TIMEOUT_MS = 30_000;

export interface CaseEvaluationResult {
  id: string;
  label: string;
  httpStatus: number | null;
  schemaValid: boolean;
  schemaError?: string;
  actual?: AnalyzeTicketResponse;
  gemini?: Awaited<ReturnType<typeof evaluateResponseWithGemini>>;
  error?: string;
  durationMs: number;
  passed: boolean;
}

export interface PipelineReport {
  baseUrl: string;
  concurrency: number;
  total: number;
  passed: number;
  failed: number;
  results: CaseEvaluationResult[];
  durationMs: number;
}

export interface ParallelEvaluationOptions {
  baseUrl?: string;
  concurrency?: number;
  timeoutMs?: number;
  pairs?: SampleCasePair[];
  /** When false, skip Gemini and only validate HTTP + schema. */
  useGemini?: boolean;
  onCaseComplete?: (result: CaseEvaluationResult) => void;
}

/** Run async tasks with a fixed concurrency limit. */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

export async function checkAnalyzeTicketServerHealth(
  baseUrl: string,
  timeoutMs = 5_000,
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

async function postAnalyzeTicket(
  baseUrl: string,
  payload: SampleCasePair["input"],
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/analyze-ticket`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

async function evaluateSingleCase(
  pair: SampleCasePair,
  options: Required<
    Pick<ParallelEvaluationOptions, "baseUrl" | "timeoutMs" | "useGemini">
  >,
): Promise<CaseEvaluationResult> {
  const started = performance.now();

  try {
    const { status, body } = await postAnalyzeTicket(
      options.baseUrl,
      pair.input,
      options.timeoutMs,
    );

    if (status !== 200) {
      return {
        id: pair.id,
        label: pair.label,
        httpStatus: status,
        schemaValid: false,
        error: `HTTP ${status}: ${JSON.stringify(body)}`,
        durationMs: performance.now() - started,
        passed: false,
      };
    }

    const parsed = analyzeTicketResponseSchema.safeParse(body);
    if (!parsed.success) {
      return {
        id: pair.id,
        label: pair.label,
        httpStatus: status,
        schemaValid: false,
        schemaError: JSON.stringify(parsed.error.flatten()),
        error: "Response failed schema validation",
        durationMs: performance.now() - started,
        passed: false,
      };
    }

    const actual = parsed.data;

    if (!options.useGemini) {
      return {
        id: pair.id,
        label: pair.label,
        httpStatus: status,
        schemaValid: true,
        actual,
        durationMs: performance.now() - started,
        passed: true,
      };
    }

    const gemini = await evaluateResponseWithGemini(
      pair.input,
      actual,
      pair.expected_output,
      pair.rationale,
    );

    return {
      id: pair.id,
      label: pair.label,
      httpStatus: status,
      schemaValid: true,
      actual,
      gemini,
      durationMs: performance.now() - started,
      passed: gemini.pass,
    };
  } catch (error) {
    return {
      id: pair.id,
      label: pair.label,
      httpStatus: null,
      schemaValid: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - started,
      passed: false,
    };
  }
}

/** POST each sample pair to /analyze-ticket and judge with Gemini Pro (5-way parallel by default). */
export async function runParallelEvaluation(
  options: ParallelEvaluationOptions = {},
): Promise<PipelineReport> {
  const baseUrl = options.baseUrl ?? DEFAULT_EVAL_BASE_URL;
  const concurrency = options.concurrency ?? DEFAULT_EVAL_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_EVAL_TIMEOUT_MS;
  const pairs = options.pairs ?? SAMPLE_CASE_PAIRS;
  const useGemini = options.useGemini ?? true;
  const started = performance.now();

  const results = await runWithConcurrency(
    pairs,
    concurrency,
    async (pair) => {
      const result = await evaluateSingleCase(pair, {
        baseUrl,
        timeoutMs,
        useGemini,
      });
      options.onCaseComplete?.(result);
      return result;
    },
  );

  const passed = results.filter((r) => r.passed).length;

  return {
    baseUrl,
    concurrency,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    durationMs: performance.now() - started,
  };
}

export function formatPipelineReport(report: PipelineReport): string {
  const lines: string[] = [
    `Parallel evaluation — ${report.baseUrl} (concurrency ${report.concurrency})`,
    `Passed ${report.passed}/${report.total} in ${Math.round(report.durationMs)}ms`,
    "",
  ];

  for (const result of report.results) {
    const status = result.passed ? "PASS" : "FAIL";
    lines.push(`[${status}] ${result.id} — ${result.label} (${Math.round(result.durationMs)}ms)`);
    if (result.error) lines.push(`  error: ${result.error}`);
    if (result.gemini && !result.passed) {
      lines.push(`  gemini: ${result.gemini.reasoning}`);
      if (result.gemini.mismatched_fields.length) {
        lines.push(`  mismatched: ${result.gemini.mismatched_fields.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}
