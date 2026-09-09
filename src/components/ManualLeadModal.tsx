"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ManualLeadModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [facilityType, setFacilityType] = useState("クリニック");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [regionNotes, setRegionNotes] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [assignee, setAssignee] = useState("");
  const [summary, setSummary] = useState("");

  function reset() {
    setName("");
    setFacilityType("クリニック");
    setPhone("");
    setRegion("");
    setRegionNotes("");
    setAddress("");
    setEmail("");
    setAssignee("");
    setSummary("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          facilityType,
          phone,
          region,
          regionNotes,
          address,
          email,
          assignee,
          summary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "追加に失敗しました");

      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        + 手動でリード追加
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold">リードを手動で追加</h2>
            <p className="mb-4 text-sm text-foreground/60">
              AIリサーチが使えない間の代替入力です。分かる範囲で入力してください。
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                医療機関名 <span className="text-red-500">*</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                種別
                <select
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="クリニック">クリニック</option>
                  <option value="病院">病院</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  電話番号
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  地域
                  <input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="例: 東京都世田谷区"
                    className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                住所
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                メールアドレス
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                担当者（任意）
                <input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="例: 森"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                地域特徴（任意）
                <input
                  value={regionNotes}
                  onChange={(e) => setRegionNotes(e.target.value)}
                  placeholder="例: 高齢化率が高く在宅医療ニーズが増加傾向"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                事業内容メモ（任意）
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/60 hover:bg-zinc-50"
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "追加中..." : "追加する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
