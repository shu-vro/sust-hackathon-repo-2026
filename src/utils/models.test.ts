import { describe, expect, test } from "bun:test";
import buildModels, { DEFAULT_MODEL, DISABLED_REASONING_KWARGS } from "./models.ts";

describe("buildModels", () => {
  test("throws when OPENROUTER_API_KEY is missing", async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const models = await buildModels();
      await expect(models.openrouter()).rejects.toThrow(
        "OPENROUTER_API_KEY is not configured",
      );
    } finally {
      if (original) {
        process.env.OPENROUTER_API_KEY = original;
      }
    }
  });

  test("disables OpenRouter reasoning on all models", async () => {
    const original = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    try {
      const models = await buildModels();
      const model = await models.openrouter();
      expect(model.modelKwargs).toEqual(DISABLED_REASONING_KWARGS);
    } finally {
      if (original) {
        process.env.OPENROUTER_API_KEY = original;
      } else {
        delete process.env.OPENROUTER_API_KEY;
      }
    }
  });

  test("live OpenRouter model responds", async () => {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      console.warn("Skipping live model test: OPENROUTER_API_KEY not set");
      return;
    }

    const models = await buildModels();
    const model = await models.openrouter(DEFAULT_MODEL, ["google-ai-studio"], {
      maxTokens: 16,
      temperature: 0,
    });

    const response = await model.invoke("Reply with exactly: PONG");
    expect(String(response.content).toUpperCase()).toContain("PONG");
  }, 30_000);
});
