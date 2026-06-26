import pack from "./fixtures/SUST_Preli_Sample_Cases.json";
import {
  analyzeTicketBodySchema,
  type AnalyzeTicketBody,
  type AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";

export interface OfficialSampleCase {
  id: string;
  label: string;
  rationale: string;
  input: AnalyzeTicketBody;
  expected_output: AnalyzeTicketResponse;
}

interface RawSampleCase {
  id: string;
  label: string;
  rationale: string;
  input: unknown;
  expected_output: AnalyzeTicketResponse;
}

/** All 10 cases from SUST_Preli_Sample_Cases.json (official hackathon sample pack). */
export const OFFICIAL_SAMPLE_CASES: OfficialSampleCase[] = (
  pack.cases as RawSampleCase[]
).map((sample) => ({
  id: sample.id,
  label: sample.label,
  rationale: sample.rationale,
  input: analyzeTicketBodySchema.parse(sample.input),
  expected_output: sample.expected_output,
}));

export const OFFICIAL_SAMPLE_PACK_META = pack._meta;
