// A grade written in the margin: circled, in red pen. Pass the text to show, e.g. "3/5" or "72%".
export function ScoreMark({ value }: { value: string }) {
  return (
    <span className="pen-mark" role="img" aria-label={`Score: ${value}`}>
      {value}
    </span>
  );
}
