import type {
  CaseType,
  Department,
  EvidenceVerdict,
  Severity,
} from "../../schemas/enums.ts";
import type {
  AnalyzeTicketBody,
  AnalyzeTicketResponse,
  AnalyzeTicketTransaction,
} from "./analyze-ticket.schema.ts";

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";
const ARABIC_DIGITS = "0123456789";

const PHISHING_PATTERNS = [
  /\b(called|call|sms|message|text)\b.{0,80}\b(otp|pin|password)\b/i,
  /\b(otp|pin|password)\b.{0,80}\b(asked|request|share|give|blocked)\b/i,
  /\b(scam|phishing|fraud|fake)\b/i,
  /\b(social engineering)\b/i,
  /\bclaiming to be from\b/i,
  /\baccount will be blocked\b/i,
  /কল.{0,40}(ওটিপি|পিন)/u,
];

const DUPLICATE_PATTERNS = [
  /\b(twice|two times|double|duplicate|deducted twice|charged twice)\b/i,
  /\bonly paid once\b/i,
  /\bদুইবার/u,
];

const PAYMENT_FAILED_PATTERNS = [
  /\b(failed|failure|unsuccessful)\b.{0,60}\b(payment|recharge|transaction)\b/i,
  /\b(payment|recharge|transaction)\b.{0,60}\b(failed|failure)\b/i,
  /\b(balance|money)\b.{0,40}\b(deducted|taken|debited)\b/i,
  /\bapp showed failed\b/i,
];

const REFUND_PATTERNS = [
  /\brefund\b/i,
  /\bchanged my mind\b/i,
  /\bdon'?t want\b/i,
  /\breturn my money\b/i,
  /\bরিফান্ড/u,
];

const WRONG_TRANSFER_PATTERNS = [
  /\bwrong (number|person|recipient|account)\b/i,
  /\bsent\b.{0,40}\bwrong\b/i,
  /\btyped\b.{0,30}\bwrong\b/i,
  /\bmistake\b/i,
  /\bdidn'?t (get|receive)\b/i,
  /\bnot received\b/i,
  /\bভুল/u,
];

const SETTLEMENT_PATTERNS = [
  /\bsettlement\b/i,
  /\bnot been settled\b/i,
  /\bsales\b.{0,40}\bnot\b/i,
  /\bmerchant\b.{0,40}\bsettle\b/i,
];

const CASH_IN_PATTERNS = [
  /\bcash[\s-]?in\b/i,
  /\bagent\b.{0,60}\b(balance|money|taka)\b/i,
  /\b(balance|money)\b.{0,60}\bnot\b.{0,30}\b(reflect|show|see|receive)\b/i,
  /ক্যাশ\s*ইন/u,
  /ব্যালেন্স/u,
  /এজেন্ট/u,
  /ক্যাশ-ইন/u,
];

const VAGUE_PATTERNS = [
  /^something is wrong\b/i,
  /^please check\.?$/i,
  /\bsomething\b.{0,20}\bwrong\b/i,
];

export interface ParsedComplaint {
  amounts: number[];
  isPhishing: boolean;
  isDuplicate: boolean;
  isPaymentFailed: boolean;
  isRefundRequest: boolean;
  isWrongTransfer: boolean;
  isSettlement: boolean;
  isCashIn: boolean;
  isVague: boolean;
}

function normalizeDigits(text: string): string {
  return [...text]
    .map((char) => {
      const index = BENGALI_DIGITS.indexOf(char);
      return index >= 0 ? ARABIC_DIGITS[index] : char;
    })
    .join("");
}

function extractAmounts(complaint: string): number[] {
  const normalized = normalizeDigits(complaint);
  const amounts = new Set<number>();

  const patterns = [
    /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:taka|tk|bdt)\b/gi,
    /\b(?:taka|tk|bdt)\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\b/gi,
    /\b(?:paid|sent|pay|transfer(?:red)?|recharge)\s+(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\b/gi,
    /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s+টাকা/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const raw = match[1]?.replace(/,/g, "");
      if (!raw) continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) {
        amounts.add(value);
      }
    }
  }

  return [...amounts];
}

export function parseComplaint(complaint: string): ParsedComplaint {
  const amounts = extractAmounts(complaint);
  const matches = (patterns: RegExp[]) =>
    patterns.some((pattern) => pattern.test(complaint));

  const isPhishing = matches(PHISHING_PATTERNS);
  const isDuplicate = matches(DUPLICATE_PATTERNS);
  const isPaymentFailed = matches(PAYMENT_FAILED_PATTERNS);
  const isRefundRequest =
    matches(REFUND_PATTERNS) && !isPaymentFailed && !isDuplicate;
  const isWrongTransfer = matches(WRONG_TRANSFER_PATTERNS);
  const isSettlement = matches(SETTLEMENT_PATTERNS);
  const isCashIn = matches(CASH_IN_PATTERNS);
  const isVague =
    matches(VAGUE_PATTERNS) ||
    (complaint.trim().length < 50 &&
      amounts.length === 0 &&
      !isPhishing &&
      !isSettlement);

  return {
    amounts,
    isPhishing,
    isDuplicate,
    isPaymentFailed,
    isRefundRequest,
    isWrongTransfer,
    isSettlement,
    isCashIn,
    isVague,
  };
}

function sortByTimestamp(
  transactions: AnalyzeTicketTransaction[],
): AnalyzeTicketTransaction[] {
  return [...transactions].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
}

export function findDuplicatePair(
  transactions: AnalyzeTicketTransaction[],
): AnalyzeTicketTransaction | null {
  const completed = sortByTimestamp(
    transactions.filter((txn) => txn.status === "completed"),
  );

  for (let i = 0; i < completed.length; i++) {
    for (let j = i + 1; j < completed.length; j++) {
      const a = completed[i]!;
      const b = completed[j]!;
      if (a.amount !== b.amount || a.counterparty !== b.counterparty) {
        continue;
      }
      if (a.type !== b.type) continue;

      const deltaMs = Math.abs(
        Date.parse(a.timestamp) - Date.parse(b.timestamp),
      );
      if (deltaMs <= 120_000) {
        return Date.parse(a.timestamp) > Date.parse(b.timestamp) ? a : b;
      }
    }
  }

  return null;
}

function matchByAmount(
  transactions: AnalyzeTicketTransaction[],
  amount: number,
): AnalyzeTicketTransaction[] {
  return transactions.filter((txn) => txn.amount === amount);
}

export function hasEstablishedRecipientPattern(
  transactions: AnalyzeTicketTransaction[],
  target: AnalyzeTicketTransaction,
): boolean {
  const prior = transactions.filter(
    (txn) =>
      txn.transaction_id !== target.transaction_id &&
      txn.counterparty === target.counterparty &&
      txn.type === "transfer" &&
      txn.status === "completed" &&
      Date.parse(txn.timestamp) < Date.parse(target.timestamp),
  );
  return prior.length >= 2;
}

function hasPendingCashIn(history: AnalyzeTicketTransaction[]): boolean {
  return history.some(
    (txn) => txn.type === "cash_in" && txn.status === "pending",
  );
}

export function inferCaseType(
  body: AnalyzeTicketBody,
  parsed: ParsedComplaint,
): CaseType {
  const history = body.transaction_history ?? [];

  if (parsed.isPhishing) return "phishing_or_social_engineering";
  if (parsed.isDuplicate) return "duplicate_payment";
  if (body.user_type === "merchant" && parsed.isSettlement) {
    return "merchant_settlement_delay";
  }
  if (parsed.isSettlement) return "merchant_settlement_delay";
  if (parsed.isCashIn || hasPendingCashIn(history)) {
    return "agent_cash_in_issue";
  }
  if (parsed.isPaymentFailed) return "payment_failed";
  if (parsed.isRefundRequest) return "refund_request";
  if (parsed.isWrongTransfer) return "wrong_transfer";
  if (parsed.isVague) return "other";
  return "other";
}

export function routeDepartment(caseType: CaseType): Department {
  const map: Record<CaseType, Department> = {
    wrong_transfer: "dispute_resolution",
    payment_failed: "payments_ops",
    refund_request: "customer_support",
    duplicate_payment: "payments_ops",
    merchant_settlement_delay: "merchant_operations",
    agent_cash_in_issue: "agent_operations",
    phishing_or_social_engineering: "fraud_risk",
    other: "customer_support",
  };
  return map[caseType];
}

export function inferSeverity(caseType: CaseType): Severity {
  const map: Record<CaseType, Severity> = {
    wrong_transfer: "high",
    payment_failed: "high",
    refund_request: "low",
    duplicate_payment: "high",
    merchant_settlement_delay: "medium",
    agent_cash_in_issue: "high",
    phishing_or_social_engineering: "critical",
    other: "low",
  };
  return map[caseType];
}

export function needsHumanReview(
  caseType: CaseType,
  evidenceVerdict: EvidenceVerdict,
  ambiguous: boolean,
): boolean {
  if (evidenceVerdict === "insufficient_data" && ambiguous) return false;
  if (evidenceVerdict === "inconsistent") return true;
  if (caseType === "phishing_or_social_engineering") return true;
  if (
    caseType === "wrong_transfer" &&
    evidenceVerdict !== "insufficient_data"
  ) {
    return true;
  }
  if (caseType === "agent_cash_in_issue") return true;
  if (caseType === "duplicate_payment") return true;
  return false;
}

export function pickTransaction(
  body: AnalyzeTicketBody,
  parsed: ParsedComplaint,
  caseType: CaseType,
): {
  transaction: AnalyzeTicketTransaction | null;
  ambiguous: boolean;
} {
  const history = body.transaction_history ?? [];
  if (history.length === 0) {
    return { transaction: null, ambiguous: false };
  }

  if (caseType === "phishing_or_social_engineering" || parsed.isVague) {
    return { transaction: null, ambiguous: false };
  }

  if (caseType === "duplicate_payment") {
    const duplicate = findDuplicatePair(history);
    return { transaction: duplicate, ambiguous: false };
  }

  const primaryAmount = parsed.amounts[0];
  if (primaryAmount === undefined) {
    if (caseType === "merchant_settlement_delay") {
      const settlement = history.find((txn) => txn.type === "settlement");
      return { transaction: settlement ?? null, ambiguous: false };
    }
    if (caseType === "agent_cash_in_issue") {
      const cashIn = history.find((txn) => txn.type === "cash_in");
      return { transaction: cashIn ?? null, ambiguous: false };
    }
    return { transaction: null, ambiguous: true };
  }

  const amountMatches = matchByAmount(history, primaryAmount);
  if (amountMatches.length === 0) {
    return { transaction: null, ambiguous: false };
  }

  if (amountMatches.length > 1) {
    const completedMatches = amountMatches.filter(
      (txn) => txn.status === "completed" || txn.status === "pending",
    );
    if (completedMatches.length > 1) {
      const uniqueCounterparties = new Set(
        completedMatches.map((txn) => txn.counterparty),
      );
      if (uniqueCounterparties.size > 1) {
        return { transaction: null, ambiguous: true };
      }
    }
  }

  const preferredTypes: Record<CaseType, AnalyzeTicketTransaction["type"][]> = {
    wrong_transfer: ["transfer"],
    payment_failed: ["payment"],
    refund_request: ["payment"],
    duplicate_payment: ["payment"],
    merchant_settlement_delay: ["settlement"],
    agent_cash_in_issue: ["cash_in"],
    phishing_or_social_engineering: [],
    other: [],
  };

  const typeFilter = preferredTypes[caseType];
  const typedMatches =
    typeFilter.length > 0
      ? amountMatches.filter((txn) => typeFilter.includes(txn.type))
      : amountMatches;

  const pool = typedMatches.length > 0 ? typedMatches : amountMatches;
  const sorted = sortByTimestamp(pool);
  return { transaction: sorted[0] ?? null, ambiguous: false };
}

export function inferEvidenceVerdict(
  parsed: ParsedComplaint,
  caseType: CaseType,
  transaction: AnalyzeTicketTransaction | null,
  ambiguous: boolean,
  history: AnalyzeTicketTransaction[],
): EvidenceVerdict {
  if (caseType === "phishing_or_social_engineering") {
    return "insufficient_data";
  }
  if (parsed.isVague || ambiguous) {
    return "insufficient_data";
  }
  if (!transaction) {
    return "insufficient_data";
  }
  if (
    caseType === "wrong_transfer" &&
    hasEstablishedRecipientPattern(history, transaction)
  ) {
    return "inconsistent";
  }
  return "consistent";
}

function buildReasonCodes(
  caseType: CaseType,
  evidenceVerdict: EvidenceVerdict,
  transaction: AnalyzeTicketTransaction | null,
  ambiguous: boolean,
): string[] {
  const codes: string[] = [caseType];
  if (transaction) codes.push("transaction_match");
  if (evidenceVerdict === "inconsistent") codes.push("evidence_inconsistent");
  if (ambiguous) codes.push("ambiguous_match");
  if (evidenceVerdict === "insufficient_data" && !transaction) {
    codes.push("needs_clarification");
  }
  if (caseType === "duplicate_payment") codes.push("duplicate_payment");
  if (caseType === "phishing_or_social_engineering") {
    codes.push("phishing", "credential_protection", "critical_escalation");
  }
  if (caseType === "other" && evidenceVerdict === "insufficient_data") {
    codes.push("vague_complaint");
  }
  if (caseType === "agent_cash_in_issue") {
    codes.push("agent_cash_in", "agent_ops");
    if (transaction?.status === "pending") codes.push("pending_transaction");
  }
  if (caseType === "merchant_settlement_delay") {
    codes.push("merchant_settlement", "delay");
    if (transaction?.status === "pending") codes.push("pending");
  }
  if (
    caseType === "wrong_transfer" &&
    evidenceVerdict === "consistent" &&
    transaction
  ) {
    codes.push("dispute_initiated");
  }
  if (caseType === "wrong_transfer" && evidenceVerdict === "inconsistent") {
    codes.push("wrong_transfer_claim", "established_recipient_pattern");
  }
  if (caseType === "payment_failed") codes.push("potential_balance_deduction");
  if (caseType === "refund_request") codes.push("merchant_policy_dependent");
  if (caseType === "duplicate_payment" && transaction) {
    codes.push("biller_verification_required");
  }
  return [...new Set(codes)].slice(0, 8);
}

function buildAgentSummary(
  caseType: CaseType,
  transaction: AnalyzeTicketTransaction | null,
  evidenceVerdict: EvidenceVerdict,
  parsed: ParsedComplaint,
): string {
  if (caseType === "phishing_or_social_engineering") {
    return "Customer reports an unsolicited contact asking for OTP or credentials. Customer has not shared sensitive information.";
  }
  if (parsed.isVague) {
    return "Customer reports a vague concern without enough detail to identify a specific transaction.";
  }
  if (transaction) {
    const txnRef = `${transaction.transaction_id} (${transaction.amount} BDT, ${transaction.status})`;
    if (evidenceVerdict === "inconsistent") {
      return `Customer disputes ${txnRef}, but transaction history shows a repeated pattern with the same counterparty.`;
    }
    return `Customer complaint aligns with ${txnRef} in the provided transaction history.`;
  }
  if (parsed.isWrongTransfer) {
    return "Customer reports a transfer issue, but multiple transactions could match the described amount.";
  }
  return "Ticket received; additional clarification may be needed to complete analysis.";
}

function buildRecommendedAction(
  caseType: CaseType,
  transaction: AnalyzeTicketTransaction | null,
  evidenceVerdict: EvidenceVerdict,
  parsed: ParsedComplaint,
): string {
  if (caseType === "phishing_or_social_engineering") {
    return "Escalate to fraud_risk immediately and log the reported contact for pattern analysis.";
  }
  if (parsed.isVague || (parsed.isWrongTransfer && !transaction)) {
    return "Ask the customer for transaction ID, amount, recipient details, and approximate time before initiating any dispute.";
  }
  if (transaction && evidenceVerdict === "inconsistent") {
    return `Review ${transaction.transaction_id} with the customer and verify whether this was genuinely a wrong transfer given prior history.`;
  }
  if (transaction) {
    const actions: Record<CaseType, string> = {
      wrong_transfer: `Verify ${transaction.transaction_id} and initiate the wrong-transfer dispute workflow per policy.`,
      payment_failed: `Investigate ${transaction.transaction_id} ledger status and initiate reversal if balance was deducted on failure.`,
      refund_request: `Explain merchant refund policy for ${transaction.transaction_id}; guide customer on merchant contact.`,
      duplicate_payment: `Verify duplicate with biller for ${transaction.transaction_id} and initiate reversal if confirmed.`,
      merchant_settlement_delay: `Check settlement batch status for ${transaction.transaction_id} and provide revised ETA.`,
      agent_cash_in_issue: `Investigate ${transaction.transaction_id} pending cash-in status with agent operations.`,
      phishing_or_social_engineering: "Escalate to fraud_risk.",
      other: "Request clarification from the customer.",
    };
    return actions[caseType];
  }
  return "Request clarification from the customer before taking operational action.";
}

function credentialWarning(language: string | undefined): string {
  if (language === "bn") {
    return "অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।";
  }
  return "Please do not share your PIN or OTP with anyone.";
}

function buildCustomerReply(
  body: AnalyzeTicketBody,
  caseType: CaseType,
  transaction: AnalyzeTicketTransaction | null,
  parsed: ParsedComplaint,
): string {
  const language = body.language;
  const warn = credentialWarning(language);

  if (caseType === "phishing_or_social_engineering") {
    if (language === "bn") {
      return `যোগাযোগ করার জন্য ধন্যবাদ। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাই না। ${warn} আমাদের ফ্রড দলকে জানানো হয়েছে।`;
    }
    return `Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password under any circumstances. ${warn} Our fraud team has been notified of this incident.`;
  }

  if (parsed.isVague || (parsed.isWrongTransfer && !transaction)) {
    if (language === "bn") {
      return `আপনার অভিযোগ পেয়েছি। দ্রুত সাহায্যের জন্য লেনদেন আইডি, পরিমাণ এবং সমস্যার সংক্ষিপ্ত বিবরণ শেয়ার করুন। ${warn}`;
    }
    return `Thank you for reaching out. To help you faster, please share the transaction ID, the amount involved, and a short description of what went wrong. ${warn}`;
  }

  const txnId = transaction?.transaction_id;

  if (caseType === "refund_request" && txnId) {
    return `Thank you for reaching out. Refunds for completed merchant payments depend on the merchant's own policy. We recommend contacting the merchant directly. If you need help reaching them, please reply and we will guide you. ${warn}`;
  }

  if (
    (caseType === "payment_failed" || caseType === "duplicate_payment") &&
    txnId
  ) {
    return `We have noted your concern about transaction ${txnId}. Our payments team will review the case and any eligible amount will be returned through official channels. ${warn}`;
  }

  if (caseType === "merchant_settlement_delay" && txnId) {
    return `We have noted your concern about settlement ${txnId}. Our merchant operations team will check the batch status and update you on the expected settlement time through official channels.`;
  }

  if (caseType === "agent_cash_in_issue" && txnId) {
    if (language === "bn") {
      return `আপনার লেনদেন ${txnId} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের এজেন্ট অপারেশন্স দল এটি দ্রুত যাচাই করবে এবং অফিসিয়াল চ্যানেলে আপনাকে জানাবে। ${warn}`;
    }
    return `We have noted your concern about transaction ${txnId}. Our agent operations team will verify the cash-in status and contact you through official support channels. ${warn}`;
  }

  if (txnId) {
    if (language === "bn") {
      return `আপনার লেনদেন ${txnId} সম্পর্কে আমরা অবগত হয়েছি। আমাদের সংশ্লিষ্ট দল এটি যাচাই করবে এবং অফিসিয়াল চ্যানেলে যোগাযোগ করবে। ${warn}`;
    }
    return `We have noted your concern about transaction ${txnId}. Our team will review the case and contact you through official support channels. ${warn}`;
  }

  return `Thank you for reaching out. Our team is reviewing your case and will contact you through official support channels. ${warn}`;
}

function inferConfidence(
  evidenceVerdict: EvidenceVerdict,
  transaction: AnalyzeTicketTransaction | null,
  ambiguous: boolean,
  caseType: CaseType,
): number {
  if (caseType === "phishing_or_social_engineering") return 0.95;
  if (caseType === "merchant_settlement_delay" && transaction) return 0.92;
  if (caseType === "duplicate_payment" && transaction) return 0.93;
  if (caseType === "agent_cash_in_issue" && transaction) return 0.88;
  if (caseType === "refund_request" && transaction) return 0.85;
  if (ambiguous) return 0.65;
  if (evidenceVerdict === "inconsistent") return 0.75;
  if (evidenceVerdict === "insufficient_data") return 0.6;
  if (transaction) return 0.9;
  return 0.7;
}

export interface RulesAnalysis {
  parsed: ParsedComplaint;
  case_type: CaseType;
  relevant_transaction_id: string | null;
  transaction: AnalyzeTicketTransaction | null;
  ambiguous: boolean;
  evidence_verdict: EvidenceVerdict;
  severity: Severity;
  department: Department;
  human_review_required: boolean;
  confidence: number;
  reason_codes: string[];
}

/** Deterministic analysis snapshot used by investigation tools and the agent. */
export function buildRulesAnalysis(body: AnalyzeTicketBody): RulesAnalysis {
  const parsed = parseComplaint(body.complaint);
  const caseType = inferCaseType(body, parsed);
  const { transaction, ambiguous } = pickTransaction(body, parsed, caseType);
  const history = body.transaction_history ?? [];
  const evidenceVerdict = inferEvidenceVerdict(
    parsed,
    caseType,
    transaction,
    ambiguous,
    history,
  );

  let severity = inferSeverity(caseType);
  if (caseType === "wrong_transfer" && evidenceVerdict === "inconsistent") {
    severity = "medium";
  }
  if (caseType === "wrong_transfer" && ambiguous) {
    severity = "medium";
  }

  const department = routeDepartment(caseType);
  const human_review_required = needsHumanReview(
    caseType,
    evidenceVerdict,
    ambiguous,
  );

  return {
    parsed,
    case_type: caseType,
    relevant_transaction_id: transaction?.transaction_id ?? null,
    transaction,
    ambiguous,
    evidence_verdict: evidenceVerdict,
    severity,
    department,
    human_review_required,
    confidence: inferConfidence(
      evidenceVerdict,
      transaction,
      ambiguous,
      caseType,
    ),
    reason_codes: buildReasonCodes(
      caseType,
      evidenceVerdict,
      transaction,
      ambiguous,
    ),
  };
}

/** Rule-based fallback when the LLM agent is unavailable or fails. */
export function investigateTicketWithRules(
  body: AnalyzeTicketBody,
): AnalyzeTicketResponse {
  const analysis = buildRulesAnalysis(body);
  const { parsed, transaction } = analysis;

  return {
    ticket_id: body.ticket_id,
    relevant_transaction_id: analysis.relevant_transaction_id,
    evidence_verdict: analysis.evidence_verdict,
    case_type: analysis.case_type,
    severity: analysis.severity,
    department: analysis.department,
    agent_summary: buildAgentSummary(
      analysis.case_type,
      transaction,
      analysis.evidence_verdict,
      parsed,
    ),
    recommended_next_action: buildRecommendedAction(
      analysis.case_type,
      transaction,
      analysis.evidence_verdict,
      parsed,
    ),
    customer_reply: buildCustomerReply(body, analysis.case_type, transaction, parsed),
    human_review_required: analysis.human_review_required,
    confidence: analysis.confidence,
    reason_codes: analysis.reason_codes,
  };
}
