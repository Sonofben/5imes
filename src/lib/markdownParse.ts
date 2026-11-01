/**
 * A small, safe Markdown parser for blog posts. It produces a plain tree that the
 * <Markdown> component turns into React elements, so no HTML from a post is ever
 * inserted into the page. Supported: ## and ### headings, paragraphs, lists (- and 1.),
 * > quotes, tables, --- rules, **bold**, *italic*, `code` and [links](https://… or /path).
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h"; level: 2 | 3; id: string; c: Inline[]; text: string }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

/** Only web links and links inside the site are kept; anything else becomes plain text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s]*$/.test(h)) return h;
  if (/^#[a-z0-9-]+$/i.test(h)) return h;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(h)) return h;
  return null;
}

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "section";
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) { flush(); out.push({ t: "code", v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*\*(.+?)\*\*/))) { flush(); out.push({ t: "strong", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*([^*\s][^*]*?)\*/))) { flush(); out.push({ t: "em", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      flush();
      const href = safeHref(m[2]);
      if (href) out.push({ t: "link", href, c: parseInline(m[1]) });
      else out.push({ t: "text", v: m[1] });
      i += m[0].length; continue;
    }
    buf += src[i]; i += 1;
  }
  flush();
  return out;
}

export function inlineText(c: Inline[]): string {
  return c.map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c))).join("");
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => parseInline(c.trim()));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      const c = parseInline(m[2].trim());
      const text = inlineText(c);
      const base = slugify(text);
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      blocks.push({ t: "h", level: m[1].length as 2 | 3, id: n ? `${base}-${n + 1}` : base, c, text });
      i += 1; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ t: "hr" }); i += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      blocks.push({ t: "table", head, rows });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { parts.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      blocks.push({ t: "quote", c: parseInline(parts.join(" ")) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) { items.push(parseInline(lines[i].replace(re, ""))); i += 1; }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3})\s|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+|^\s*\|.*\|\s*$|^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
      parts.push(lines[i].trim()); i += 1;
    }
    if (parts.length) blocks.push({ t: "p", c: parseInline(parts.join(" ")) });
    else i += 1;
  }
  return blocks;
}

/** Headings for a table of contents. */
export function headings(blocks: Block[]) {
  return blocks.filter((b): b is Extract<Block, { t: "h" }> => b.t === "h").map((b) => ({ id: b.id, text: b.text, level: b.level }));
}

/** Rough reading time in minutes. */
export function readingMinutes(src: string) {
  return Math.max(1, Math.round(src.split(/\s+/).filter(Boolean).length / 220));
}
