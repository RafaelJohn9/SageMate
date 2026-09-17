import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
