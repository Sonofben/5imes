import Link from "next/link";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdownParse";

function Inl({ nodes }: { nodes: Inline[] }) {
  return <>{nodes.map((n, i) => {
    switch (n.t) {
      case "text": return <span key={i}>{n.v}</span>;
      case "code": return <code key={i} className="rounded bg-paper px-1.5 py-0.5 text-[0.9em]">{n.v}</code>;
      case "strong": return <strong key={i} className="font-semibold text-ink"><Inl nodes={n.c} /></strong>;
      case "em": return <em key={i}><Inl nodes={n.c} /></em>;
      case "link": return n.href.startsWith("/") || n.href.startsWith("#")
        ? <Link key={i} href={n.href} className="font-semibold text-brand-dark underline underline-offset-2"><Inl nodes={n.c} /></Link>
        : <a key={i} href={n.href} rel="nofollow noopener noreferrer" target="_blank" className="font-semibold text-brand-dark underline underline-offset-2"><Inl nodes={n.c} /></a>;
    }
  })}</>;
}

function B({ b }: { b: Block }) {
  switch (b.t) {
    case "h": return b.level === 2
      ? <h2 id={b.id} className="mt-10 scroll-mt-24 text-2xl font-bold tracking-tight text-ink"><Inl nodes={b.c} /></h2>
      : <h3 id={b.id} className="mt-7 scroll-mt-24 text-lg font-bold text-ink"><Inl nodes={b.c} /></h3>;
    case "p": return <p className="mt-4"><Inl nodes={b.c} /></p>;
    case "ul": return <ul className="mt-4 list-disc space-y-1.5 pl-5">{b.items.map((it, i) => <li key={i}><Inl nodes={it} /></li>)}</ul>;
    case "ol": return <ol className="mt-4 list-decimal space-y-1.5 pl-5">{b.items.map((it, i) => <li key={i}><Inl nodes={it} /></li>)}</ol>;
    case "quote": return <blockquote className="mt-5 border-l-4 border-brand bg-white px-4 py-3 text-ink"><Inl nodes={b.c} /></blockquote>;
    case "hr": return <hr className="my-8 border-line" />;
    case "table": return (
      <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-paper"><tr>{b.head.map((c, i) => <th key={i} scope="col" className="px-3 py-2.5 font-semibold text-ink"><Inl nodes={c} /></th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i} className="border-t border-line align-top">{r.map((c, j) => j === 0
            ? <th key={j} scope="row" className="px-3 py-2.5 font-semibold text-ink"><Inl nodes={c} /></th>
            : <td key={j} className="px-3 py-2.5"><Inl nodes={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}

/** Renders a blog post body safely (no raw HTML). */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return <div className="text-[16px] leading-7 text-ink/85">{blocks.map((b, i) => <B key={i} b={b} />)}</div>;
}
