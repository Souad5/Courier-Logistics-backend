import rateLimit from "express-rate-limit";

/**
 * Global API rate limiter. Requests beyond the limit receive the
 * standard error envelope. Skipped for the Stripe webhook so payment
 * retries are never blocked. Uses `keyGenerator` to extract client IP
 * from X-Forwarded-For / Forwarded headers in proxied environments (Vercel).
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/v1/payments/webhook"),
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
    return req.ip ?? "unknown";
  },
  message: { success: false, message: "Too many requests, please try again later.", errors: [] },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts, please slow down.", errors: [] },
});

/** Protects Stripe checkout-session creation from being hammered (each call is a Stripe API request). */
export const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many payment attempts, please slow down.",
    errors: [],
  },
});
