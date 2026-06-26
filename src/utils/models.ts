import {
  ChatOpenRouter,
  type ChatOpenRouterInput,
} from "@langchain/openrouter";

/** Cheap + fast; good default for guardrails and ticket analysis in a hackathon. */
export const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

/** Prefer Google AI Studio routing for the configured Gemini flash-lite model. */
export const DEFAULT_PROVIDERS = ["google-ai-studio"] as const;

export type ModelFactoryOptions = Partial<
  Pick<ChatOpenRouterInput, "temperature" | "maxTokens" | "topP" | "stop">
>;

export interface ModelFactory {
  openrouter: (
    model?: string,
    providers?: readonly string[],
    options?: ModelFactoryOptions,
  ) => Promise<ChatOpenRouter>;
}

function requireOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return apiKey;
}

export async function buildModels(): Promise<ModelFactory> {
  return {
    openrouter: async (
      model = DEFAULT_MODEL,
      providers = DEFAULT_PROVIDERS,
      options = {},
    ) => {
      return new ChatOpenRouter({
        model,
        apiKey: requireOpenRouterApiKey(),
        provider: {
          order: [...providers],
          data_collection: "deny",
          allow_fallbacks: false,
        },
        temperature: options.temperature ?? 0,
        maxTokens: options.maxTokens ?? 512,
        topP: options.topP,
        stop: options.stop,
        siteName: "QueueStorm Investigator",
      });
    },
  };
}

/** Deterministic, low-token model for input guardrails. */
export async function getGuardrailModel(): Promise<ChatOpenRouter> {
  const models = await buildModels();
  return models.openrouter(DEFAULT_MODEL, DEFAULT_PROVIDERS, {
    temperature: 0,
    maxTokens: 256,
  });
}

export default buildModels;
