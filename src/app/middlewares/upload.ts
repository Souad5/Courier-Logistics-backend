import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { AppError } from "../errors/AppError";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(new AppError(400, "Only JPEG, PNG, or WebP images are allowed."));
      return;
    }
    callback(null, true);
  },
}).single("photo");

/**
 * Memory-storage upload for a single proof-of-delivery photo. Files never
 * touch disk — the buffer is streamed straight to Cloudinary — and are
 * rejected up front by MIME type and size before any upload is attempted.
 * Translates multer's own errors (oversized file, unexpected field) into the
 * standard AppError envelope instead of letting them fall through as 500s.
 */
export function uploadProofOfDeliveryPhoto(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof AppError) return next(err);
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5MB or smaller."
          : `Upload error: ${err.message}`;
      return next(new AppError(400, message));
    }
    next(err);
  });
}
