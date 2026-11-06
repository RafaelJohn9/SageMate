import { describe, expect, it } from "vitest";
import { effectiveStatus, STALE_PENDING_MS } from "../questionSetStatus";

const now = new Date("2026-11-06T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("effectiveStatus", () => {
  it("keeps a recent pending set pending", () => {
    expect(effectiveStatus("PENDING", ago(60_000), now)).toBe("PENDING");
  });
  it("treats a pending set past the stale limit as failed", () => {
    expect(effectiveStatus("PENDING", ago(STALE_PENDING_MS + 1), now)).toBe("FAILED");
  });
  it("is exactly at the limit still pending", () => {
    expect(effectiveStatus("PENDING", ago(STALE_PENDING_MS), now)).toBe("PENDING");
  });
  it("never changes completed or failed sets", () => {
    expect(effectiveStatus("COMPLETED", ago(STALE_PENDING_MS * 10), now)).toBe("COMPLETED");
    expect(effectiveStatus("FAILED", ago(1), now)).toBe("FAILED");
  });
});
