import Link from "next/link";

/**
 * ホームの「要確認」。架電日が入っているのにフェーズが「未活動」のまま（更新漏れの可能性）のリードの件数を出し、
 * リード一覧のその絞り込みへ案内する。
 */
export default function NeedsCheckCard({ phaseNotUpdated }: { phaseNotUpdated: number }) {
  return (
    <Link
      href="/leads?check=phase"
      className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm shadow-sm"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-700">!</span>
        <span>
          <span className="font-bold text-amber-800">要確認：フェーズの更新漏れ {phaseNotUpdated}件</span>
          <span className="block text-xs text-amber-700/80">架電日が入っているのに、フェーズが「未活動」のままのリードがあります</span>
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-amber-700">一覧を開く →</span>
    </Link>
  );
}
