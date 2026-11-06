import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("groq-sdk", () => ({ default: class {} }));

describe("getLLMProvider", () => {
  const saved = { ...process.env };
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = { ...saved };
  });

  it("throws without an API key", async () => {
    delete process.env.GROQ_API_KEY;
    process.env.LLM_PROVIDER = "groq";
    const { getLLMProvider } = await import("../factory");
    expect(() => getLLMProvider()).toThrow("GROQ_API_KEY is not set");
  });
  it("rejects unknown providers", async () => {
    process.env.LLM_PROVIDER = "nope";
    const { getLLMProvider } = await import("../factory");
    expect(() => getLLMProvider()).toThrow("Unknown LLM_PROVIDER: nope");
  });
  it("builds and caches a groq provider", async () => {
    process.env.LLM_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "k";
    process.env.GROQ_MODEL = "m";
    const { getLLMProvider } = await import("../factory");
    const p = getLLMProvider();
    expect(p.name).toBe("groq");
    expect(p.model).toBe("m");
    expect(getLLMProvider()).toBe(p);
  });
});
