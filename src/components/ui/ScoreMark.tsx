// A grade written in the margin: circled, in red pen. Pass the text to show, e.g. "3/5" or "72%".
export function ScoreMark({ value, size = "md", label }: { value: string; size?: "sm" | "md"; label?: string }) {
  return (
    <span
      className={`pen-mark ${size === "sm" ? "pen-mark-sm" : ""}`}
      role="img"
      aria-label={label ?? `Score: ${value}`}
    >
      {value}
    </span>
  );
}
