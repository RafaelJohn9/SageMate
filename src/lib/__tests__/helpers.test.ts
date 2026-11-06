import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeForPdf } from "../pdf/sanitize";
import { formatCharCount, splitInlineNumberedList } from "../formatting";
import { withTimeout } from "../withTimeout";
import { formatRelativeTime } from "../formatRelativeTime";

describe("sanitizeForPdf", () => {
  it("replaces unsupported glyphs", () => {
    expect(sanitizeForPdf("a ≤ b → c × d")).toBe("a <= b -> c x d");
  });
  it("leaves plain text alone", () => {
    expect(sanitizeForPdf("hello")).toBe("hello");
  });
});

describe("splitInlineNumberedList", () => {
  it("splits sequential inline lists", () => {
    expect(splitInlineNumberedList("1. Foo. 2. Bar. 3. Baz.")).toBe("1. Foo.\n2. Bar.\n3. Baz.");
  });
  it("ignores lines not starting at 1", () => {
    expect(splitInlineNumberedList("see section 3. Then go")).toBe("see section 3. Then go");
  });
  it("does not split when numbering is out of sequence", () => {
    expect(splitInlineNumberedList("1. Foo. 3. Bar.")).toBe("1. Foo. 3. Bar.");
  });
});

describe("withTimeout", () => {
  afterEach(() => vi.useRealTimers());
  it("resolves when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve(5), 100, "x")).resolves.toBe(5);
  });
  it("rejects with the label when time runs out", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 50, "grading");
    const assertion = expect(p).rejects.toThrow("grading timed out after 50ms");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe("formatRelativeTime", () => {
  it("says just now for recent dates", () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });
  it("formats past dates", () => {
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3600 * 1000))).toBe("3 hours ago");
    expect(formatRelativeTime(new Date(Date.now() - 2 * 86400 * 1000))).toBe("2 days ago");
  });
});

describe("formatCharCount", () => {
  it("formats small, medium and large sizes", () => {
    expect(formatCharCount(850)).toBe("850 characters");
    expect(formatCharCount(4200)).toBe("4.2k characters");
    expect(formatCharCount(36_000)).toBe("36k characters");
  });
});
