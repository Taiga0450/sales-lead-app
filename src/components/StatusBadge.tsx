const STATUS_STYLES: Record<string, string> = {
  未活動: "bg-zinc-100 text-zinc-600",
  対象外: "bg-zinc-100 text-zinc-400 line-through",
  受付NG: "bg-orange-50 text-orange-700",
  不在: "bg-amber-50 text-amber-700",
  キーマンNG: "bg-red-50 text-red-700",
  資料送付: "bg-sky-50 text-sky-700",
  商談獲得: "bg-blue-50 text-blue-700",
  契約医療機関: "bg-emerald-600 text-white",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
      {status || "未活動"}
    </span>
  );
}
