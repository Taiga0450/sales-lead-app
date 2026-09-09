interface PieChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  valueFormatter?: (v: number) => string;
}

/**
 * 依存ライブラリを増やさないための、素朴なSVG円グラフ（BarChart.tsx/Gauge.tsxと同じ流儀）。
 * ドーナツ状の円を stroke-dasharray で塗り分けて描画する。
 */
export default function PieChart({ data, size = 160, valueFormatter }: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const format = valueFormatter ?? ((v: number) => v.toLocaleString());
  const r = 60;
  const circumference = 2 * Math.PI * r;

  const segments = data
    .filter((d) => d.value > 0)
    .reduce<Array<{ label: string; value: number; color: string; dash: number; offset: number }>>((acc, d) => {
      const cumulative = acc.reduce((sum, s) => sum + s.value, 0);
      const dash = total > 0 ? (d.value / total) * circumference : 0;
      const offset = total > 0 ? -((cumulative / total) * circumference) : 0;
      acc.push({ ...d, dash, offset });
      return acc;
    }, []);

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" style={{ width: size, height: size }} className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="20" />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="20"
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <ul className="flex flex-col gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-foreground/70">{d.label}</span>
            <span className="font-semibold">{format(d.value)}</span>
            <span className="text-xs text-foreground/40">
              {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : "0%"}
            </span>
          </li>
        ))}
        {data.length === 0 && <li className="text-foreground/40">データがありません</li>}
      </ul>
    </div>
  );
}
