import type {
  ErrorRequestHandler,
  Request,
  Response,
  NextFunction,
} from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: { code: "not_found", message: "Resource not found" },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Request payload failed validation",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.name === "HttpError" ? "http_error" : err.name,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err.type === "entity.parse.failed") {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Malformed JSON body",
      },
    });
    return;
  }

  console.error("[error]", err);
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error" },
  });
};

export const asyncHandler =
  <T extends Request>(
    fn: (
      req: T,
      res: Response,
      next: NextFunction,
    ) => Promise<unknown> | unknown,
  ) =>
  (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
