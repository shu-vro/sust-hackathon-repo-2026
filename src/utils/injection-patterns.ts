/** High-confidence prompt-injection / system-override phrases. */
export const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(your|the)\s+(rules?|instructions?|policy|guidelines?)/i,
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\b.{0,40}\b(system|admin|developer)\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /\bdo\s+not\s+follow\b.{0,30}\b(policy|rules?|instructions?)\b/i,
  /\boverride\b.{0,30}\b(safety|rules?|instructions?)\b/i,
  /\bprint\b.{0,20}\b(api[_ -]?key|secret|token|password)\b/i,
  /\breveal\b.{0,20}\b(system|hidden|secret)\b/i,
  /\brespond\s+only\s+with\b/i,
  /\boutput\s+(raw\s+)?json\b/i,
  /<\s*\/?\s*system\s*>/i,
  /\[(system|assistant|developer)\]/i,
  /###\s*(system|instruction)\b/i,
];

/** Phrases that ask the copilot to solicit credentials from customers. */
export const CREDENTIAL_HARVESTING_PATTERNS: RegExp[] = [
  /\bask\b.{0,40}\b(pin|otp|password|card number)\b/i,
  /\brequest\b.{0,40}\b(pin|otp|password|card number)\b/i,
  /\btell\s+them\s+to\s+share\b.{0,30}\b(pin|otp|password)\b/i,
  /\bcustomer_reply\b.{0,60}\b(pin|otp|password)\b/i,
];

/** Signals that the text is likely a real fintech support complaint. */
export const LEGITIMATE_COMPLAINT_SIGNALS: RegExp[] = [
  /\b(taka|bdt|tk)\b/i,
  /\b(transfer|payment|refund|balance|transaction|settlement|cash[\s-]?in|cash[\s-]?out)\b/i,
  /\b(wrong|failed|deducted|duplicate|pending|reversed|blocked)\b/i,
  /\b(merchant|agent|biller|recharge|electricity|mobile)\b/i,
  /\b(otp|pin|password)\b.{0,40}\b(call|called|asked|share|scam|fraud|phishing)\b/i,
  /\b(scam|fraud|phishing|social engineering)\b/i,
  /টাকা|লেনদেন|রিফান্ড|ব্যালেন্স|এজেন্ট|মার্চেন্ট|ভুল|ব্যর্থ/u,
];

export function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0,
  );
}
