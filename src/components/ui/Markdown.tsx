import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitInlineNumberedList } from "@/lib/formatting";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{splitInlineNumberedList(children)}</ReactMarkdown>
    </div>
  );
}
