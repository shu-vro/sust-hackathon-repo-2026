import { body, validationResult } from "express-validator";
import type { Request, Response, NextFunction } from "express";

export const validateEchoBody = [
  body("message")
    .isString()
    .withMessage("message must be a string")
    .trim()
    .notEmpty()
    .withMessage("message must not be empty")
    .isLength({ max: 500 })
    .withMessage("message must be 500 characters or fewer"),
  body("repeat")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("repeat must be an integer between 1 and 10"),
  (req: Request, res: Response, next: NextFunction) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      res.status(400).json({
        error: {
          code: "validation_error",
          message: "Request payload failed validation",
          details: result.mapped(),
        },
      });
      return;
    }
    next();
  },
];