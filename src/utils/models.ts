import { ChatOpenRouter } from "@langchain/openrouter";

let buildModels = async () => {
  return {
    openrouter: async (
      model: string = "google/gemini-2.5-flash-lite",
      providers: string[] = ["google-ai-studio"],
      options: any,
      callbacks: any,
    ) => {
      return new ChatOpenRouter({
        model: model,
        apiKey: process.env.OPENROUTER_API_KEY,
        provider: {
          order: providers,
          data_collection: "deny",
          allow_fallbacks: false,
          // only: model.providers,
        },
        temperature: 1,
        maxTokens: options.maxTokens ?? 1000,
        callbacks: callbacks ? [callbacks] : [],
        // cache: true,
        ...(options ?? {}),
      });
    },
  };
};

export default buildModels;
