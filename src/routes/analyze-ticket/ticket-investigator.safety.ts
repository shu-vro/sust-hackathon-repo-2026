import type { AnalyzeTicketBody, AnalyzeTicketResponse } from "./analyze-ticket.schema.ts";

const UNAUTHORIZED_REFUND_PATTERNS = [
  /\bwe will refund\b/i,
  /\bwe'll refund\b/i,
  /\bwill be refunded\b/i,
  /\bhas been refunded\b/i,
  /\bwe will reverse\b/i,
  /\bwe have reversed\b/i,
  /\baccount (is|has been) unblocked\b/i,
  /\bguaranteed refund\b/i,
];

const CREDENTIAL_REQUEST_PATTERNS = [
  /\b(share|provide|send|give)\s+(us\s+)?(your\s+)?(pin|otp|password|card number)\b/i,
  /\bverify\b.{0,30}\b(pin|otp|password|card number)\b/i,
  /\bwhat is your (pin|otp|password)\b/i,
];

const THIRD_PARTY_PATTERNS = [
  /\bwhatsapp\b.{0,40}\b(send|share)\b/i,
  /\btelegram\b/i,
];

function credentialWarning(language: string | undefined): string {
  if (language === "bn") {
    return "অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।";
  }
  return "Please do not share your PIN or OTP with anyone.";
}

function hasCredentialWarning(reply: string): boolean {
  return (
    /\bpin\b/i.test(reply) ||
    /\botp\b/i.test(reply) ||
    /পিন/u.test(reply) ||
    /ওটিপি/u.test(reply)
  );
}

function sanitizeUnauthorizedRefunds(reply: string, caseType: string): string {
  let result = reply;
  for (const pattern of UNAUTHORIZED_REFUND_PATTERNS) {
    if (pattern.test(result)) {
      if (
        caseType === "payment_failed" ||
        caseType === "duplicate_payment"
      ) {
        result = result.replace(
          pattern,
          "any eligible amount will be returned through official channels",
        );
      } else {
        result = result.replace(
          pattern,
          "our team will review through official support channels",
        );
      }
    }
  }
  return result;
}

function stripCredentialRequests(reply: string): string {
  let result = reply;
  for (const pattern of CREDENTIAL_REQUEST_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function stripThirdPartyInstructions(reply: string): string {
  let result = reply;
  for (const pattern of THIRD_PARTY_PATTERNS) {
    result = result.replace(pattern, "official support channels");
  }
  return result;
}

/** Deterministic safety post-processing on agent output. */
export function sanitizeInvestigatorResponse(
  body: AnalyzeTicketBody,
  response: AnalyzeTicketResponse,
): AnalyzeTicketResponse {
  let customerReply = response.customer_reply;

  customerReply = stripCredentialRequests(customerReply);
  customerReply = sanitizeUnauthorizedRefunds(customerReply, response.case_type);
  customerReply = stripThirdPartyInstructions(customerReply);

  const skipCredentialWarning =
    response.case_type === "merchant_settlement_delay" &&
    body.user_type === "merchant";

  if (!skipCredentialWarning && !hasCredentialWarning(customerReply)) {
    const warn = credentialWarning(body.language);
    customerReply = `${customerReply.trim()} ${warn}`;
  }

  if (body.language === "bn" && !/[\u0980-\u09FF]/u.test(customerReply)) {
    customerReply = `আপনার অভিযোগ পেয়েছি। আমাদের দল এটি যাচাই করবে। ${credentialWarning("bn")}`;
  }

  return {
    ...response,
    ticket_id: body.ticket_id,
    customer_reply: customerReply.trim(),
  };
}
