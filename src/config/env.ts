interface Config {
  port: number;
  host: string;
  nodeEnv: "development" | "production" | "test";
  isProd: boolean;
  apiPrefix: string;
  openRouterApiKey?: string;
  enableLlmGuardrail: boolean;
}

const nodeEnv = (process.env.NODE_ENV ?? "development") as Config["nodeEnv"];

export const config: Config = {
  port: Number(process.env.PORT ?? 8000),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv,
  isProd: nodeEnv === "production",
  apiPrefix: "/api/v1",
  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
  enableLlmGuardrail: process.env.ENABLE_LLM_GUARDRAIL !== "false",
};
