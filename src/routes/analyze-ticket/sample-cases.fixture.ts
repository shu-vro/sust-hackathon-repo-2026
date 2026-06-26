import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";
import { OFFICIAL_SAMPLE_CASES } from "./sample-cases.loader.ts";

export interface SampleCase {
  id: string;
  label: string;
  input: AnalyzeTicketBody;
  expected: Pick<
    AnalyzeTicketResponse,
    | "relevant_transaction_id"
    | "evidence_verdict"
    | "case_type"
    | "severity"
    | "department"
    | "human_review_required"
  >;
}

/** Decision-field expectations derived from the official JSON sample pack. */
export const PUBLIC_SAMPLE_CASES: SampleCase[] = OFFICIAL_SAMPLE_CASES.map(
  (sample) => ({
    id: sample.id,
    label: sample.label,
    input: sample.input,
    expected: {
      relevant_transaction_id: sample.expected_output.relevant_transaction_id,
      evidence_verdict: sample.expected_output.evidence_verdict,
      case_type: sample.expected_output.case_type,
      severity: sample.expected_output.severity,
      department: sample.expected_output.department,
      human_review_required: sample.expected_output.human_review_required,
    },
  }),
);

export { OFFICIAL_SAMPLE_CASES, OFFICIAL_SAMPLE_PACK_META } from "./sample-cases.loader.ts";
