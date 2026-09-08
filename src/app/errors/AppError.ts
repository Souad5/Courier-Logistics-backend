export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details: unknown[];
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, details: unknown[] = [], isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}
