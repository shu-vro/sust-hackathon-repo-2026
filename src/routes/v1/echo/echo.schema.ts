import { z } from "zod";

export const echoBodySchema = z.object({
  message: z
    .string({ required_error: "message is required" })
    .trim()
    .min(1, "message must not be empty")
    .max(500, "message must be 500 characters or fewer"),
  repeat: z
    .number({ invalid_type_error: "repeat must be a number" })
    .int("repeat must be an integer")
    .min(1, "repeat must be >= 1")
    .max(10, "repeat must be <= 10")
    .optional(),
});

export type EchoBody = z.infer<typeof echoBodySchema>;