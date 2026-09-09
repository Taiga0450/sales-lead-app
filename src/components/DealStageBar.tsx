import { DEAL_STAGES, type DealStageOrLost } from "@/lib/dealHearing";

const STAGE_COLORS: Record<string, string> = {
  初回商談: "#a1a1aa",
  見積提出: "#eab308",
  口頭受注: "#0eb0ce",
  クローズ済み: "#059669",
};

/**
 * HubSpotの「取引ステージ追跡」ウィジェットを模した、依存ライブラリなしの進行バー。
 * 「失注」は進行バーには乗せず、別枠の赤いバッジで表示する（HubSpotのclosedlostには連動しない）。
 */
export default function DealStageBar({ stage, compact = false }: { stage: DealStageOrLost; compact?: boolean }) {
  if (stage === "失注") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
        失注
      </span>
    );
  }

  const currentIndex = stage ? DEAL_STAGES.indexOf(stage) : -1;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {DEAL_STAGES.map((s, i) => (
            <span
              key={s}
              className="h-1.5 w-4 rounded-full"
              style={{ backgroundColor: i <= currentIndex ? STAGE_COLORS[s] : "var(--border)" }}
            />
          ))}
        </div>
        <span className="text-xs text-foreground/50">{stage || "未設定"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {DEAL_STAGES.map((s, i) => (
          <span
            key={s}
            className="h-2 flex-1 rounded-full"
            style={{ backgroundColor: i <= currentIndex ? STAGE_COLORS[s] : "var(--border)" }}
          />
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color: currentIndex >= 0 ? STAGE_COLORS[stage as string] : undefined }}>
        {stage || "未設定"}
      </span>
    </div>
  );
}
