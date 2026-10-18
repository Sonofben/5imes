/** Tiny bar chart for counts over time (no library). */
export function Bars({ data, label, unit }: { data: { key: string; value: number; title: string }[]; label: string; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure aria-label={label}>
      <div className="flex h-28 items-end gap-1">
        {data.map((d) => (
          <div key={d.key} className="group relative flex-1" title={`${d.title}: ${d.value} ${unit}`}>
            <div className="rounded-t bg-brand/80 group-hover:bg-brand" style={{ height: `${Math.max(2, (d.value / max) * 112)}px` }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted"><span>{data[0]?.title}</span><span>{data[data.length - 1]?.title}</span></figcaption>
    </figure>
  );
}
