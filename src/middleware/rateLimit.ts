import rateLimit from "express-rate-limit";

/** Per-IP throttle for the analysis endpoint (expensive / abuse-prone). */
export const analyzeTicketRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "rate_limit_exceeded",
      message: "Too many requests. Please try again later.",
    },
  },
});
