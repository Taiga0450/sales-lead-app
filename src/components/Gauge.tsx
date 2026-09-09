interface GaugeProps {
  value: number;
  target: number;
  label: string;
  valueFormatter?: (v: number) => string;
}

/**
 * 半円のゲージチャート。左端=0%、上=75%、右端=150%として、赤→黄→緑のゾーンを敷き、
 * 達成率に応じて針が振れる。
 *
 * 角度はSVG標準（0度=右方向、時計回り）で扱う。ゲージ上の位置を表す0〜180度
 * （0=左端、180=右端）を、SVGのtheta = gaugeDeg + 180 に変換して描画する
 * （180度で左端、270度で真上、360度=0度で右端になる）。
 */
export default function Gauge({ value, target, label, valueFormatter }: GaugeProps) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const clamped = Math.max(0, Math.min(150, pct));
  const needleGaugeDeg = (clamped / 150) * 180;
  const format = valueFormatter ?? ((v: number) => `¥${v.toLocaleString()}`);

  const cx = 100;
  const cy = 95;
  const r = 78;

  function pointAt(gaugeDeg: number, radius: number) {
    const theta = ((gaugeDeg + 180) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) };
  }

  function arcPath(startDeg: number, endDeg: number) {
    const p1 = pointAt(startDeg, r);
    const p2 = pointAt(endDeg, r);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
  }

  const needleTip = pointAt(needleGaugeDeg, r - 14);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-[220px]">
        <path d={arcPath(0, 80)} stroke="#dc2626" strokeWidth="14" fill="none" strokeLinecap="round" opacity={0.85} />
        <path d={arcPath(80, 120)} stroke="#eab308" strokeWidth="14" fill="none" opacity={0.85} />
        <path d={arcPath(120, 180)} stroke="#059669" strokeWidth="14" fill="none" strokeLinecap="round" opacity={0.85} />
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="var(--ink, #1c1a24)" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="var(--ink, #1c1a24)" />
      </svg>
      <p className="-mt-2 text-2xl font-bold text-brand">{pct.toFixed(0)}%</p>
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="mt-1 text-xs text-foreground/40">
        {format(value)} / {format(target)}
      </p>
    </div>
  );
}
