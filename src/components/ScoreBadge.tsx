function colorFor(score: number): string {
  if (score >= 4) return "bg-emerald-500";
  if (score >= 3) return "bg-amber-400";
  if (score > 0) return "bg-zinc-300";
  return "bg-zinc-200";
}

export default function ScoreBadge({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-foreground/50">{label}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-3 rounded-full ${i < score ? colorFor(score) : "bg-zinc-100"}`}
          />
        ))}
      </div>
    </div>
  );
}
