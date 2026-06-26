import { tool } from "langchain";
import { z } from "zod";
import type { AnalyzeTicketBody } from "./analyze-ticket.schema.ts";
import {
  buildRulesAnalysis,
  findDuplicatePair,
  hasEstablishedRecipientPattern,
  inferCaseType,
  parseComplaint,
  pickTransaction,
} from "./ticket-investigator.rules.ts";
import type { CaseType } from "../../schemas/enums.ts";

/** @deprecated Not used on the live LLM path — kept for reference and rules fallback helpers. */
export function createInvestigationTools(body: AnalyzeTicketBody) {
  const analyzeComplaintSignals = tool(
    async () => {
      const parsed = parseComplaint(body.complaint);
      return JSON.stringify({
        amounts: parsed.amounts,
        signals: {
          phishing: parsed.isPhishing,
          duplicate: parsed.isDuplicate,
          payment_failed: parsed.isPaymentFailed,
          refund_request: parsed.isRefundRequest,
          wrong_transfer: parsed.isWrongTransfer,
          settlement: parsed.isSettlement,
          cash_in: parsed.isCashIn,
          vague: parsed.isVague,
        },
        language: body.language ?? "en",
        user_type: body.user_type ?? "customer",
        transaction_count: body.transaction_history?.length ?? 0,
      });
    },
    {
      name: "analyze_complaint_signals",
      description:
        "Parse the complaint for amounts and issue-type signals (phishing, duplicate payment, wrong transfer, etc.). Call this first.",
      schema: z.object({}),
    },
  );

  const matchRelevantTransaction = tool(
    async ({ case_type }: { case_type: string }) => {
      const parsed = parseComplaint(body.complaint);
      const caseType = inferCaseType(body, parsed);
      const effectiveCaseType: CaseType =
        case_type && case_type !== "auto"
          ? (case_type as CaseType)
          : caseType;
      const { transaction, ambiguous } = pickTransaction(
        body,
        parsed,
        effectiveCaseType,
      );
      const history = body.transaction_history ?? [];
      const duplicate = findDuplicatePair(history);

      return JSON.stringify({
        case_type_inferred: caseType,
        relevant_transaction_id: transaction?.transaction_id ?? null,
        transaction: transaction
          ? {
              transaction_id: transaction.transaction_id,
              amount: transaction.amount,
              type: transaction.type,
              status: transaction.status,
              counterparty: transaction.counterparty,
              timestamp: transaction.timestamp,
            }
          : null,
        ambiguous_match: ambiguous,
        duplicate_pair_detected: duplicate
          ? {
              suspected_duplicate_id: duplicate.transaction_id,
              amount: duplicate.amount,
              counterparty: duplicate.counterparty,
            }
          : null,
      });
    },
    {
      name: "match_relevant_transaction",
      description:
        "Match complaint to a transaction from history. Returns relevant_transaction_id or null if ambiguous/vague. For duplicate claims, returns the later duplicate txn.",
      schema: z.object({
        case_type: z
          .string()
          .optional()
          .describe('Case type hint or "auto" to infer from complaint'),
      }),
    },
  );

  const checkRecipientHistory = tool(
    async ({ transaction_id }: { transaction_id: string }) => {
      const history = body.transaction_history ?? [];
      const target = history.find((txn) => txn.transaction_id === transaction_id);
      if (!target) {
        return JSON.stringify({
          found: false,
          established_recipient_pattern: false,
          prior_transfer_count: 0,
        });
      }
      const established = hasEstablishedRecipientPattern(history, target);
      const priorCount = history.filter(
        (txn) =>
          txn.transaction_id !== target.transaction_id &&
          txn.counterparty === target.counterparty &&
          txn.type === "transfer" &&
          txn.status === "completed" &&
          Date.parse(txn.timestamp) < Date.parse(target.timestamp),
      ).length;

      return JSON.stringify({
        found: true,
        transaction_id,
        counterparty: target.counterparty,
        established_recipient_pattern: established,
        prior_transfer_count: priorCount,
        note:
          established && priorCount >= 2
            ? "Two or more prior transfers to same counterparty — wrong-transfer claim may be inconsistent"
            : "No established recipient pattern",
      });
    },
    {
      name: "check_recipient_history",
      description:
        "Check if the customer has repeated prior transfers to the same counterparty (≥2). Used for wrong-transfer inconsistency detection.",
      schema: z.object({
        transaction_id: z.string().describe("Transaction ID to check"),
      }),
    },
  );

  const getRoutingRecommendation = tool(
    async () => {
      const analysis = buildRulesAnalysis(body);
      return JSON.stringify({
        case_type: analysis.case_type,
        evidence_verdict: analysis.evidence_verdict,
        relevant_transaction_id: analysis.relevant_transaction_id,
        severity: analysis.severity,
        department: analysis.department,
        human_review_required: analysis.human_review_required,
        ambiguous: analysis.ambiguous,
        confidence: analysis.confidence,
        reason_codes: analysis.reason_codes,
      });
    },
    {
      name: "get_routing_recommendation",
      description:
        "Get full deterministic routing recommendation: case_type, evidence_verdict, department, severity, human_review_required. Call after other tools to confirm decisions.",
      schema: z.object({}),
    },
  );

  return [
    analyzeComplaintSignals,
    matchRelevantTransaction,
    checkRecipientHistory,
    getRoutingRecommendation,
  ];
}

export type InvestigationTools = ReturnType<typeof createInvestigationTools>;
