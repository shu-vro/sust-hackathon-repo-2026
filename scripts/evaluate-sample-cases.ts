#!/usr/bin/env bun
/**
 * Parallel evaluation pipeline for official sample cases.
 *
 * Prerequisites:
 *   - Server running: bun run start  (listens on http://localhost:8000)
 *   - OPENROUTER_API_KEY set for Gemini Pro judging
 *
 * Usage:
 *   bun run scripts/evaluate-sample-cases.ts
 *   bun run scripts/evaluate-sample-cases.ts --base-url http://127.0.0.1:8000 --concurrency 5
 */
import { hasOpenRouterApiKey } from "../src/utils/models.ts";
import {
  checkAnalyzeTicketServerHealth,
  formatPipelineReport,
  runParallelEvaluation,
  DEFAULT_EVAL_BASE_URL,
  DEFAULT_EVAL_CONCURRENCY,
} from "../src/routes/analyze-ticket/evaluation/parallel-pipeline.ts";

function parseArgs(argv: string[]): {
  baseUrl: string;
  concurrency: number;
  schemaOnly: boolean;
} {
  let baseUrl = process.env.EVAL_BASE_URL ?? DEFAULT_EVAL_BASE_URL;
  let concurrency = Number(
    process.env.EVAL_CONCURRENCY ?? DEFAULT_EVAL_CONCURRENCY,
  );
  let schemaOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url" && argv[i + 1]) {
      baseUrl = argv[++i]!;
    } else if (arg === "--concurrency" && argv[i + 1]) {
      concurrency = Number(argv[++i]);
    } else if (arg === "--schema-only") {
      schemaOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun run scripts/evaluate-sample-cases.ts [options]

Options:
  --base-url <url>       API base URL (default: ${DEFAULT_EVAL_BASE_URL})
  --concurrency <n>      Parallel cases (default: ${DEFAULT_EVAL_CONCURRENCY})
  --schema-only          Skip Gemini judging; HTTP + schema only
  -h, --help             Show this help
`);
      process.exit(0);
    }
  }

  return { baseUrl, concurrency, schemaOnly };
}

const { baseUrl, concurrency, schemaOnly } = parseArgs(process.argv.slice(2));

if (!schemaOnly && !hasOpenRouterApiKey()) {
  console.error(
    "OPENROUTER_API_KEY is required for Gemini Pro evaluation. Use --schema-only to skip.",
  );
  process.exit(1);
}

const healthy = await checkAnalyzeTicketServerHealth(baseUrl);
if (!healthy) {
  console.error(
    `Server not healthy at ${baseUrl}/health — start with: bun run start`,
  );
  process.exit(1);
}

console.log(
  `Evaluating sample cases against ${baseUrl}/analyze-ticket (${concurrency} parallel)…`,
);

const report = await runParallelEvaluation({
  baseUrl,
  concurrency,
  useGemini: !schemaOnly,
  onCaseComplete: (result) => {
    const mark = result.passed ? "✓" : "✗";
    console.log(`${mark} ${result.id} (${Math.round(result.durationMs)}ms)`);
  },
});

console.log("");
console.log(formatPipelineReport(report));

process.exit(report.failed > 0 ? 1 : 0);
