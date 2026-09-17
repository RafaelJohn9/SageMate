import { GroqProvider } from "./providers/groq";
import type { LLMProvider } from "./types";

let cached: LLMProvider | undefined;

export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const providerName = process.env.LLM_PROVIDER ?? "groq";

  switch (providerName) {
    case "groq": {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is not set");
      }
      cached = new GroqProvider(apiKey, process.env.GROQ_MODEL);
      break;
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${providerName}`);
  }

  return cached;
}
