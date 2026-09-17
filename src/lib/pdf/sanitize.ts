const REPLACEMENTS: Record<string, string> = {
  "≤": "<=",
  "≥": ">=",
  "→": "->",
  "←": "<-",
  "≈": "~=",
  "≠": "!=",
  "×": "x",
  "÷": "/",
  "−": "-",
  "…": "...",
  "∞": "infinity",
  "∑": "sum",
  "√": "sqrt",
};

const PATTERN = new RegExp(Object.keys(REPLACEMENTS).join("|"), "g");

export function sanitizeForPdf(text: string): string {
  return text.replace(PATTERN, (match) => REPLACEMENTS[match] ?? match);
}
