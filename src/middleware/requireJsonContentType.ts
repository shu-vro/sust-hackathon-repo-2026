import type { Request, Response, NextFunction } from "express";

/**
 * Rejects non-JSON POST bodies before parsing/processing.
 * Reduces content-type confusion and unexpected parser behavior.
 */
export function requireJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentType = req.headers["content-type"];

  if (!contentType?.toLowerCase().startsWith("application/json")) {
    res.status(415).json({
      error: {
        code: "unsupported_media_type",
        message: "Content-Type must be application/json",
      },
    });
    return;
  }

  next();
}
