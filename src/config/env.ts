interface Config {
  port: number;
  host: string;
  nodeEnv: "development" | "production" | "test";
  isProd: boolean;
  apiPrefix: string;
}

const nodeEnv = (process.env.NODE_ENV ?? "development") as Config["nodeEnv"];

export const config: Config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv,
  isProd: nodeEnv === "production",
  apiPrefix: "/api/v1",
};
