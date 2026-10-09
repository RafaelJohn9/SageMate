import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { splitInlineNumberedList } from "@/lib/formatting";

// A small Markdown subset — paragraphs, bullet/numbered lists, **bold**, *italic*, `code` — which is
// what the LLM's feedback and model answers use. Anything else renders as plain text.

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: { marker: string; text: string }[] };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (const rawLine of splitInlineNumberedList(markdown).split("\n")) {
    const line = rawLine.replace(/^#{1,6}\s+/, "").trimEnd();
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);

    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      const item = numbered
        ? { marker: `${numbered[1]}.`, text: numbered[2] }
        : { marker: "•", text: bullet![1] };
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      const last = blocks[blocks.length - 1];
      // An indented line straight after a list item continues that item.
      if (!paragraph.length && last?.kind === "list" && /^\s+/.test(rawLine)) {
        last.items[last.items.length - 1].text += ` ${line.trim()}`;
      } else {
        paragraph.push(line.trim());
      }
    }
  }
  flushParagraph();
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;

function renderInline(text: string) {
  return text.split(INLINE).map((part, i) => {
    if (/^(\*\*|__).+\1$/.test(part)) {
      return (
        <Text key={i} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (/^`.+`$/.test(part)) return <Text key={i}>{part.slice(1, -1)}</Text>;
    // Only regular and bold faces are registered, so italics render as plain text.
    if (/^([*_]).+\1$/.test(part)) return part.slice(1, -1);
    return part;
  });
}

const styles = StyleSheet.create({
  bold: { fontWeight: "bold" },
  paragraph: { marginBottom: 4 },
  list: { marginBottom: 4 },
  item: { flexDirection: "row", marginBottom: 2 },
  marker: { width: 16 },
  itemText: { flex: 1 },
});

export function PdfMarkdown({ children, style }: { children: string; style?: Style }) {
  const blocks = parseBlocks(children);
  return (
    <View>
      {blocks.map((block, i) =>
        block.kind === "paragraph" ? (
          <Text key={i} style={[styles.paragraph, style ?? {}]}>
            {renderInline(block.text)}
          </Text>
        ) : (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.item} wrap={false}>
                <Text style={[styles.marker, style ?? {}]}>{item.marker}</Text>
                <Text style={[styles.itemText, style ?? {}]}>{renderInline(item.text)}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
