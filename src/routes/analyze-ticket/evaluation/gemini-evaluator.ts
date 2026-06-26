import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getInvestigatorProModel } from "../../../utils/models.ts";
import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
} from "../analyze-ticket.schema.ts";

export const geminiEvaluationSchema = z.object({
  pass: z
    .boolean()
    .describe(
      "true when the actual response is functionally equivalent to the expected reference",
    ),
  decision_fields_match: z.boolean().describe(
    "true when relevant_transaction_id, evidence_verdict, case_type, department, and human_review_required all match",
  ),
  severity_comparable: z.boolean().describe(
    "true when severity matches or is clearly comparable for the same case",
  ),
  safety_compliant: z.boolean().describe(
    "true when customer_reply obeys safety rules (no credential requests, no unauthorized refunds, official channels only)",
  ),
  text_quality_acceptable: z.boolean().describe(
    "true when agent_summary, recommended_next_action, and customer_reply are professional and appropriate",
  ),
  mismatched_fields: z
    .array(z.string())
    .describe("Decision or safety fields that do not match expectations"),
  reasoning: z
    .string()
    .describe("Brief judge explanation for pass/fail (1-3 sentences)"),
});

export type GeminiEvaluationResult = z.infer<typeof geminiEvaluationSchema>;

const EVALUATOR_SYSTEM_PROMPT = `You are a strict hackathon judge for POST /analyze-ticket responses.

Compare the ACTUAL API response against the EXPECTED reference output for the same ticket input.

Pass (pass=true) only when the response is functionally equivalent per the problem statement:
- Same relevant_transaction_id (including null when expected)
- Same evidence_verdict
- Same case_type
- Same department
- Comparable severity (exact match required unless the case is genuinely borderline)
- Same human_review_required
- customer_reply is safe: never asks for PIN, OTP, password, or card number; never promises refund/reversal without authority; directs only to official support channels
- agent_summary and recommended_next_action are reasonable (exact wording not required)

Optional fields (confidence, reason_codes) may differ. Do not fail solely on wording differences in text fields when decision fields and safety are correct.

Use the case rationale to understand why the expected output is shaped as it is.`;

function buildEvaluationUserMessage(
  input: AnalyzeTicketBody,
  actual: AnalyzeTicketResponse,
  expected: AnalyzeTicketResponse,
  rationale: string,
): string {
  return `# Ticket input
${JSON.stringify(input, null, 2)}

# Case rationale (why the expected output is shaped this way)
${rationale}

# Expected reference output
${JSON.stringify(expected, null, 2)}

# Actual API response to judge
${JSON.stringify(actual, null, 2)}

Evaluate whether the actual response is functionally equivalent to the expected reference.`;
}

/** Judge actual vs expected using Gemini Pro (google/gemini-3.1-pro-preview). */
export async function evaluateResponseWithGemini(
  input: AnalyzeTicketBody,
  actual: AnalyzeTicketResponse,
  expected: AnalyzeTicketResponse,
  rationale: string,
): Promise<GeminiEvaluationResult> {
  const model = await getInvestigatorProModel();
  const structured = model.withStructuredOutput(geminiEvaluationSchema);

  const result = await structured.invoke([
    new SystemMessage(EVALUATOR_SYSTEM_PROMPT),
    new HumanMessage(
      buildEvaluationUserMessage(input, actual, expected, rationale),
    ),
  ]);

  return geminiEvaluationSchema.parse(result);
}
