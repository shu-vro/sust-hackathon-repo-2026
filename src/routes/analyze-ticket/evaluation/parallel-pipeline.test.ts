import { describe, expect, test } from "bun:test";
import { runWithConcurrency } from "./parallel-pipeline.ts";
import {
  SAMPLE_CASE_PAIRS,
  SAMPLE_CASE_PAIRS_META,
} from "./sample-case-pairs.loader.ts";

describe("sample case pairs loader", () => {
  test("loads all pairs from sample-case-pairs.json", () => {
    expect(SAMPLE_CASE_PAIRS.length).toBe(SAMPLE_CASE_PAIRS_META.pair_count);
    expect(SAMPLE_CASE_PAIRS.length).toBe(10);
    expect(SAMPLE_CASE_PAIRS.map((p) => p.id)).toEqual([
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

  test("each pair input ticket_id matches expected_output ticket_id", () => {
    for (const pair of SAMPLE_CASE_PAIRS) {
      expect(pair.input.ticket_id).toBe(pair.expected_output.ticket_id);
      expect(pair.input.complaint.length).toBeGreaterThan(0);
      expect(pair.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe("runWithConcurrency", () => {
  test("runs at most N tasks in parallel", async () => {
    const concurrency = 5;
    let inFlight = 0;
    let maxInFlight = 0;

    const items = Array.from({ length: 12 }, (_, i) => i);
    const results = await runWithConcurrency(items, concurrency, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Bun.sleep(10);
      inFlight--;
      return n * 2;
    });

    expect(results).toEqual(items.map((n) => n * 2));
    expect(maxInFlight).toBeLessThanOrEqual(concurrency);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  test("returns empty array for no items", async () => {
    const results = await runWithConcurrency([], 5, async () => 1);
    expect(results).toEqual([]);
  });
});
