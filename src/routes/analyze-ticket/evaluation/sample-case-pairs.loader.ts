import pairsPack from "./fixtures/sample-case-pairs.json";
import {
  analyzeTicketBodySchema,
  analyzeTicketResponseSchema,
  type AnalyzeTicketBody,
  type AnalyzeTicketResponse,
} from "../analyze-ticket.schema.ts";

export interface SampleCasePair {
  id: string;
  label: string;
  rationale: string;
  input: AnalyzeTicketBody;
  expected_output: AnalyzeTicketResponse;
}

interface RawPair {
  id: string;
  label: string;
  rationale: string;
  input: unknown;
  expected_output: unknown;
}

/** Input + expected_output pairs for the parallel evaluation pipeline. */
export const SAMPLE_CASE_PAIRS: SampleCasePair[] = (
  pairsPack.pairs as RawPair[]
).map((pair) => ({
  id: pair.id,
  label: pair.label,
  rationale: pair.rationale,
  input: analyzeTicketBodySchema.parse(pair.input),
  expected_output: analyzeTicketResponseSchema.parse(pair.expected_output),
}));

export const SAMPLE_CASE_PAIRS_META = pairsPack.meta;
