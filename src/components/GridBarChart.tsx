interface GridBarChartProps {
  title?: string;
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
}

/** 与えられた最大値に対して「見やすい」目盛り上限とステップを決める（0,5,10,...や0,10,20,...のように）。 */
function niceScale(max: number): { step: number; top: number } {
  if (max <= 0) return { step: 1, top: 5 };
  const rawStep = max / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 5, 10];
  const step = candidates.map((c) => c * magnitude).find((s) => s * 5 >= max) ?? candidates[candidates.length - 1] * magnitude;
  const top = Math.ceil(max / step) * step;
  return { step, top: top > 0 ? top : step * 5 };
}

/**
 * Googleスプレッドシート/Excelのグラフのような、Y軸目盛り・グリッド線付きの棒グラフ。
 * 依存ライブラリを増やさないための素朴なSVG実装（BarChart.tsxと同じ流儀）。
 */
export default function GridBarChart({ title, data, height = 240, color = "#4472c4" }: GridBarChartProps) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const { step, top } = niceScale(max);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  const width = 700;
  const marginLeft = 40;
  const marginBottom = 28;
  const marginTop = title ? 28 : 8;
  const plotHeight = height - marginTop - marginBottom;
  const plotWidth = width - marginLeft - 10;
  const barSlot = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(60, barSlot * 0.5);

  function yFor(v: number): number {
    return marginTop + plotHeight - (v / top) * plotHeight;
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 480, height }}>
        {title && (
          <text x={marginLeft} y={16} fontSize="12" fontWeight="600" fill="var(--foreground)">
            {title}
          </text>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={marginLeft}
              x2={width - 6}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={marginLeft - 6} y={yFor(t) + 3} fontSize="10" textAnchor="end" fill="var(--foreground)" opacity={0.6}>
              {t}
            </text>
          </g>
        ))}
        <line x1={marginLeft} x2={marginLeft} y1={marginTop} y2={marginTop + plotHeight} stroke="var(--border)" strokeWidth="1" />
        <line
          x1={marginLeft}
          x2={width - 6}
          y1={marginTop + plotHeight}
          y2={marginTop + plotHeight}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {data.map((d, i) => {
          const slotX = marginLeft + i * barSlot;
          const barX = slotX + (barSlot - barWidth) / 2;
          const barY = yFor(d.value);
          return (
            <g key={i}>
              <rect x={barX} y={barY} width={barWidth} height={marginTop + plotHeight - barY} fill={color} />
              <text x={slotX + barSlot / 2} y={height - 8} fontSize="10" textAnchor="middle" fill="var(--foreground)" opacity={0.7}>
                {d.label}
              </text>
            </g>
          );
        })}
        {data.length === 0 && (
          <text x={width / 2} y={marginTop + plotHeight / 2} fontSize="12" textAnchor="middle" fill="var(--foreground)" opacity={0.4}>
            データがありません
          </text>
        )}
      </svg>
    </div>
  );
}
