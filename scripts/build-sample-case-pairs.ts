/**
 * Extracts input/expected_output pairs from the official sample pack
 * into fixtures/sample-case-pairs.json for the evaluation pipeline.
 */
import pack from "../src/routes/analyze-ticket/fixtures/SUST_Preli_Sample_Cases.json";

interface RawCase {
  id: string;
  label: string;
  rationale: string;
  input: unknown;
  expected_output: unknown;
}

const pairs = {
  meta: {
    source: "SUST_Preli_Sample_Cases.json",
    version: pack._meta.version,
    pair_count: pack.cases.length,
    generated_at: new Date().toISOString(),
  },
  pairs: (pack.cases as RawCase[]).map((sample) => ({
    id: sample.id,
    label: sample.label,
    rationale: sample.rationale,
    input: sample.input,
    expected_output: sample.expected_output,
  })),
};

const outPath =
  "src/routes/analyze-ticket/evaluation/fixtures/sample-case-pairs.json";

await Bun.write(outPath, `${JSON.stringify(pairs, null, 2)}\n`);
console.log(`Wrote ${pairs.pairs.length} pairs to ${outPath}`);
