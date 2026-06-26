import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  caseTypeSchema,
  departmentSchema,
  evidenceVerdictSchema,
  severitySchema,
} from "../../schemas/enums.ts";
import {
  FLASH_MODEL,
  PRO_MODEL,
  getInvestigatorFlashModel,
  getInvestigatorProModel,
} from "../../utils/models.ts";
import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
} from "./analyze-ticket.schema.ts";
import { applyStructuralGuardrails } from "./ticket-investigator.guardrails.ts";
import {
  buildInvestigatorSystemPrompt,
  buildInvestigatorUserMessage,
} from "./ticket-investigator.prompt.ts";
import { sanitizeInvestigatorResponse } from "./ticket-investigator.safety.ts";

const LLM_TIMEOUT_MS = 25_000;

export const investigatorOutputSchema = z.object({
  relevant_transaction_id: z.string().nullable(),
  evidence_verdict: evidenceVerdictSchema,
  case_type: caseTypeSchema,
  severity: severitySchema,
  department: departmentSchema,
  agent_summary: z.string().max(2000),
  recommended_next_action: z.string().max(2000),
  customer_reply: z.string().max(4000),
  human_review_required: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  reason_codes: z.array(z.string().trim().min(1).max(100)).max(8).optional(),
});

export type InvestigatorLlmOutput = z.infer<typeof investigatorOutputSchema>;

function selectInvestigatorModel(body: AnalyzeTicketBody): string {
  const history = body.transaction_history ?? [];
  const simple =
    history.length === 0 &&
    body.complaint.length < 120 &&
    body.language !== "bn" &&
    body.user_type !== "merchant";

  return simple ? FLASH_MODEL : PRO_MODEL;
}

async function getModelForSelection(modelName: string) {
  return modelName === PRO_MODEL
    ? getInvestigatorProModel()
    : getInvestigatorFlashModel();
}

function toAnalyzeTicketResponse(
  body: AnalyzeTicketBody,
  output: InvestigatorLlmOutput,
): AnalyzeTicketResponse {
  return {
    ticket_id: body.ticket_id,
    relevant_transaction_id: output.relevant_transaction_id,
    evidence_verdict: output.evidence_verdict,
    case_type: output.case_type,
    severity: output.severity,
    department: output.department,
    agent_summary: output.agent_summary.trim(),
    recommended_next_action: output.recommended_next_action.trim(),
    customer_reply: output.customer_reply.trim(),
    human_review_required: output.human_review_required,
    confidence: output.confidence,
    reason_codes: output.reason_codes,
  };
}

/** Single-shot structured LLM investigation — primary path when API key is available. */
export async function investigateTicketWithLlm(
  body: AnalyzeTicketBody,
): Promise<AnalyzeTicketResponse> {
  const modelName = selectInvestigatorModel(body);
  const model = await getModelForSelection(modelName);
  const structured = model.withStructuredOutput(investigatorOutputSchema);

  const invokePromise = structured.invoke([
    new SystemMessage(buildInvestigatorSystemPrompt()),
    new HumanMessage(buildInvestigatorUserMessage(body)),
  ]);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("Investigator LLM timed out")),
      LLM_TIMEOUT_MS,
    );
  });

  const result = await Promise.race([invokePromise, timeoutPromise]);
  const parsed = investigatorOutputSchema.parse(result);

  const withGuardrails = applyStructuralGuardrails(
    body,
    toAnalyzeTicketResponse(body, parsed),
  );

  return sanitizeInvestigatorResponse(body, withGuardrails);
}
