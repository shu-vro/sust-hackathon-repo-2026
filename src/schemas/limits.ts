export const LIMITS = {
  ticketId: { min: 1, max: 64 },
  complaint: { min: 1, max: 8_000 },
  campaignContext: { max: 128 },
  transactionId: { min: 1, max: 64 },
  counterparty: { min: 1, max: 128 },
  transactionHistory: { maxItems: 100 },
  amount: { min: 0.01, max: 10_000_000 },
  metadata: { maxKeys: 32, maxKeyLength: 64, maxSerializedBytes: 4_096 },
  reasonCode: { max: 64, maxItems: 20 },
  summaryField: { max: 2_000 },
  customerReply: { max: 2_000 },
} as const;

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
