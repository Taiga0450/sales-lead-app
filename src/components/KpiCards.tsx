import type { LeadRow } from "@/lib/leads";

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "brand" | "success" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-emerald-600",
    danger: "text-red-600",
    muted: "text-foreground/40",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium text-foreground/50">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function KpiCards({ leads }: { leads: LeadRow[] }) {
  const total = leads.length;
  const contracted = leads.filter((l) => l.ステータス === "契約医療機関").length;
  const won = leads.filter((l) => l.ステータス === "商談獲得").length;
  const keymanNg = leads.filter((l) => l.ステータス === "キーマンNG").length;
  const receptionNg = leads.filter((l) => l.ステータス === "受付NG").length;
  const inactive = leads.filter((l) => !l.ステータス || l.ステータス === "未活動").length;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="総リード数" value={total} tone="brand" />
      <KpiCard label="契約医療機関" value={contracted} tone="success" />
      <KpiCard label="商談獲得" value={won} tone="brand" />
      <KpiCard label="キーマンNG" value={keymanNg} tone="danger" />
      <KpiCard label="受付NG" value={receptionNg} tone="danger" />
      <KpiCard label="未活動" value={inactive} tone="muted" />
    </div>
  );
}
