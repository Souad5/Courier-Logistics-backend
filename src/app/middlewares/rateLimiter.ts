import rateLimit from "express-rate-limit";

/**
 * Global API rate limiter. Requests beyond the limit receive the
 * standard error envelope. Skipped for the Stripe webhook so payment
 * retries are never blocked.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/api/v1/payments/webhook"),
  message: { success: false, message: "Too many requests, please try again later.", errors: [] },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts, please slow down.", errors: [] },
});
