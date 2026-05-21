// Embedded operations runbook. The markdown source is bundled at build time via
// vite's ?raw import, so the dashboard works offline with no GitHub dependency.
import runbookMd from "../dev/runbook.md?raw";

export function RunbookView() {
  const blocks = parseMarkdown(runbookMd);
  return (
    <div className="docu-runbook">
      <div className="docu-runbook__meta">
        Source: <code>aidlc-docs/operations/dev05-runbook.md</code> · {runbookMd.split("\n").length} lines
      </div>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

// ---------- minimal markdown parser ----------
// Handles: h1/h2/h3, paragraphs, tables, fenced code blocks, unordered lists,
// inline code, bold, links. Not a full CommonMark — just enough for our runbook.

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; lang: string; body: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "blank" };

function parseMarkdown(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]); i++;
      }
      i++;
      blocks.push({ kind: "code", lang, body: buf.join("\n") });
      continue;
    }

    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }

    // table — at least 2 rows with leading | and a separator row
    if (line.startsWith("|") && i + 1 < lines.length && /^\|\s*[-:|\s]+\|/.test(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ kind: "blank" });
      i++;
      continue;
    }

    // paragraph (collect consecutive non-empty non-special lines)
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isSpecial(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", text: para.join(" ") });
  }
  return blocks;
}

function isSpecial(line: string): boolean {
  return /^(#{1,3}\s|```|\|)/.test(line) || /^[-*]\s+/.test(line);
}
function splitRow(row: string): string[] {
  return row.slice(1, row.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
}

// ---------- render ----------
function renderInline(text: string): React.ReactNode[] {
  // Tokenize: links → code → bold
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    // [label](url)
    const link = /^\[([^\]]+)\]\(([^)]+)\)/.exec(rest);
    if (link) {
      out.push(<a key={key++} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
      rest = rest.slice(link[0].length);
      continue;
    }
    // `code`
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      out.push(<code key={key++}>{code[1]}</code>);
      rest = rest.slice(code[0].length);
      continue;
    }
    // **bold**
    const bold = /^\*\*([^*]+)\*\*/.exec(rest);
    if (bold) {
      out.push(<strong key={key++}>{bold[1]}</strong>);
      rest = rest.slice(bold[0].length);
      continue;
    }
    // plain — consume until next marker
    const next = rest.search(/(`|\*\*|\[)/);
    if (next === -1) { out.push(rest); break; }
    out.push(rest.slice(0, next));
    rest = rest.slice(next);
    if (next === 0) { out.push(rest[0]); rest = rest.slice(1); }
  }
  return out;
}

function renderBlock(b: Block, i: number): React.ReactNode {
  switch (b.kind) {
    case "heading": {
      const Tag = (`h${b.level}` as "h1" | "h2" | "h3");
      return <Tag key={i} className={`docu-runbook__h${b.level}`}>{renderInline(b.text)}</Tag>;
    }
    case "paragraph":
      return <p key={i} className="docu-runbook__p">{renderInline(b.text)}</p>;
    case "code":
      return (
        <pre key={i} className="docu-runbook__code">
          {b.lang && <span className="docu-runbook__lang">{b.lang}</span>}
          <code>{b.body}</code>
        </pre>
      );
    case "list":
      return (
        <ul key={i} className="docu-runbook__list">
          {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ul>
      );
    case "table":
      return (
        <div key={i} className="docu-runbook__table-wrap">
          <table className="docu-runbook__table">
            <thead><tr>{b.headers.map((h, j) => <th key={j}>{renderInline(h)}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((row, j) => (
                <tr key={j}>{row.map((cell, k) => <td key={k}>{renderInline(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "blank":
      return null;
  }
}
