// LLM answers sometimes put a numbered list on one line ("1. Foo. 2. Bar. 3. Baz."). Split those onto
// separate lines so they render as real lists. Only splits when the numbers run in sequence from 1,
// so stray numbers in prose ("see section 3. Then…") are left alone.
export function splitInlineNumberedList(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)1\.\s/);
      if (!match) return line;
      const parts: string[] = [];
      let rest = line;
      let next = 2;
      for (;;) {
        const marker = new RegExp(`\\s${next}\\.\\s`);
        const found = rest.search(marker);
        if (found === -1) break;
        parts.push(rest.slice(0, found).trimEnd());
        rest = match[1] + rest.slice(found).trimStart();
        next++;
      }
      parts.push(rest);
      return parts.join("\n");
    })
    .join("\n");
}
