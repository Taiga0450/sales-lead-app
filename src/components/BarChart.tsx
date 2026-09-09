interface BarChartProps {
  data: Array<{ label: string; value: number; tone?: "brand" | "success" | "danger" | "muted" }>;
  height?: number;
  valueFormatter?: (v: number) => string;
}

const TONE_FILL: Record<string, string> = {
  brand: "var(--brand)",
  success: "#059669",
  danger: "#dc2626",
  muted: "#a1a1aa",
};

/** 依存ライブラリを増やさないための、素朴なSVG棒グラフ。縦棒・単一系列。 */
export default function BarChart({ data, height = 160, valueFormatter }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const format = valueFormatter ?? ((v: number) => v.toLocaleString());

  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ height: height + 48 }}>
      {data.map((d, i) => {
        const barHeight = Math.max(2, (d.value / max) * height);
        return (
          <div key={i} className="flex min-w-[40px] flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground/70">{format(d.value)}</span>
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height: barHeight, backgroundColor: TONE_FILL[d.tone ?? "brand"] }}
            />
            <span className="w-full truncate text-center text-[11px] text-foreground/50" title={d.label}>
              {d.label}
            </span>
          </div>
        );
      })}
      {data.length === 0 && (
        <p className="text-sm text-foreground/40">データがありません</p>
      )}
    </div>
  );
}
