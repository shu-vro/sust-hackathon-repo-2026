import { describe, expect, test } from "bun:test";
import { OFFICIAL_SAMPLE_CASES } from "./sample-cases.loader.ts";
import {
  buildFewShotExamplesBlock,
  buildInvestigatorSystemPrompt,
} from "./ticket-investigator.prompt.ts";

describe("ticket-investigator prompt", () => {
  test("few-shot block includes all 10 official sample ids", () => {
    const block = buildFewShotExamplesBlock();
    for (const sample of OFFICIAL_SAMPLE_CASES) {
      expect(block).toContain(`### ${sample.id}:`);
      expect(block).toContain(sample.input.ticket_id);
      expect(block).toContain(`"evidence_verdict": "${sample.expected_output.evidence_verdict}"`);
      expect(block).toContain(sample.rationale);
    }
  });

  test("system prompt includes evidence verdict rules and safety rules", () => {
    const prompt = buildInvestigatorSystemPrompt();
    expect(prompt).toContain("consistent");
    expect(prompt).toContain("inconsistent");
    expect(prompt).toContain("insufficient_data");
    expect(prompt).toContain("NEVER ask for PIN");
    expect(prompt).toContain("SAMPLE-01");
    expect(prompt).toContain("SAMPLE-10");
  });

  test("each few-shot example includes expected_output decision fields", () => {
    const block = buildFewShotExamplesBlock();
    for (const sample of OFFICIAL_SAMPLE_CASES) {
      expect(block).toContain(`"case_type": "${sample.expected_output.case_type}"`);
      expect(block).toContain(`"department": "${sample.expected_output.department}"`);
    }
  });
});
