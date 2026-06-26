import { z } from "zod";
import {
  caseTypeSchema,
  channelSchema,
  departmentSchema,
  evidenceVerdictSchema,
  languageSchema,
  severitySchema,
  transactionStatusSchema,
  transactionTypeSchema,
  userTypeSchema,
} from "../../schemas/enums.ts";
import { ID_PATTERN, LIMITS } from "../../schemas/limits.ts";
import validateUserInput from "../../utils/validate-user-input.ts";

const isoTimestampSchema = z
  .string()
  .trim()
  .min(1, "timestamp is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "timestamp must be a valid ISO 8601 date",
  });

const metadataValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const metadataSchema = z
  .record(
    z.string().trim().min(1).max(LIMITS.metadata.maxKeyLength),
    metadataValueSchema,
  )
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > LIMITS.metadata.maxKeys) {
      ctx.addIssue({
        code: "custom",
        message: `metadata may contain at most ${LIMITS.metadata.maxKeys} keys`,
      });
    }

    const serialized = JSON.stringify(value);
    if (serialized.length > LIMITS.metadata.maxSerializedBytes) {
      ctx.addIssue({
        code: "custom",
        message: `metadata must be ${LIMITS.metadata.maxSerializedBytes} bytes or smaller when serialized`,
      });
    }
  });

export const transactionSchema = z
  .object({
    transaction_id: z
      .string()
      .trim()
      .min(LIMITS.transactionId.min)
      .max(LIMITS.transactionId.max)
      .regex(ID_PATTERN, "transaction_id contains invalid characters"),
    timestamp: isoTimestampSchema,
    type: transactionTypeSchema,
    amount: z
      .number({ error: "amount must be a number" })
      .finite("amount must be finite")
      .min(LIMITS.amount.min, `amount must be >= ${LIMITS.amount.min}`)
      .max(LIMITS.amount.max, `amount must be <= ${LIMITS.amount.max}`),
    counterparty: z
      .string()
      .trim()
      .min(LIMITS.counterparty.min)
      .max(LIMITS.counterparty.max),
    status: transactionStatusSchema,
  })
  .strict();

export const analyzeTicketBodySchema = z
  .object({
    ticket_id: z
      .string()
      .trim()
      .min(LIMITS.ticketId.min, "ticket_id must not be empty")
      .max(LIMITS.ticketId.max)
      .regex(ID_PATTERN, "ticket_id contains invalid characters"),
    complaint: z
      .string()
      .trim()
      .min(LIMITS.complaint.min, "complaint must not be empty")
      .max(
        LIMITS.complaint.max,
        `complaint must be ${LIMITS.complaint.max} characters or fewer`,
      ),
    language: languageSchema.optional(),
    channel: channelSchema.optional(),
    user_type: userTypeSchema.optional(),
    campaign_context: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.campaignContext.max)
      .optional(),
    transaction_history: z
      .array(transactionSchema)
      .max(
        LIMITS.transactionHistory.maxItems,
        `transaction_history may contain at most ${LIMITS.transactionHistory.maxItems} items`,
      )
      .optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const analyzeTicketResponseSchema = z.object({
  ticket_id: z.string(),
  relevant_transaction_id: z.string().nullable(),
  evidence_verdict: evidenceVerdictSchema,
  case_type: caseTypeSchema,
  severity: severitySchema,
  department: departmentSchema,
  agent_summary: z.string().max(LIMITS.summaryField.max),
  recommended_next_action: z.string().max(LIMITS.summaryField.max),
  customer_reply: z.string().max(LIMITS.customerReply.max),
  human_review_required: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  reason_codes: z
    .array(z.string().trim().min(1).max(LIMITS.reasonCode.max))
    .max(LIMITS.reasonCode.maxItems)
    .optional(),
});

export type AnalyzeTicketBody = z.infer<typeof analyzeTicketBodySchema>;
export type AnalyzeTicketTransaction = z.infer<typeof transactionSchema>;
export type AnalyzeTicketResponse = z.infer<typeof analyzeTicketResponseSchema>;

/** Safe placeholder until the analyzer pipeline is implemented. */
export function buildStubResponse(
  body: AnalyzeTicketBody,
): AnalyzeTicketResponse {
  const validated = validateUserInput(body);
  return validated
    ? validated
    : {
        ticket_id: body.ticket_id,
        relevant_transaction_id: null,
        evidence_verdict: "insufficient_data",
        case_type: "other",
        severity: "low",
        department: "customer_support",
        agent_summary:
          "Ticket received and validated. Full complaint analysis is not yet implemented.",
        recommended_next_action:
          "Complete analyzer implementation to classify the case and route to the correct department.",
        customer_reply:
          "Thank you for reaching out. Our team is reviewing your case and will contact you through official support channels. Please do not share your PIN or OTP with anyone.",
        human_review_required: false,
      };
}
