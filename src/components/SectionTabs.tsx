"use client";

import { useState, type ReactNode } from "react";

/**
 * 複数のセクションをドロップダウンで切り替えて表示する汎用コンポーネント。常に全部を並べて
 * 表示せず、選んだ1つだけを表示することで縦に長くなりすぎるのを防ぐ。項目が増えてもボタンが
 * 横に並びきらず折り返す、ということが起きないよう選択式にしている。
 * contentはサーバーコンポーネント側で描画済みのJSXをそのまま渡せる。
 */
export default function SectionTabs({
  sections,
}: {
  sections: Array<{ key: string; label: string; content: ReactNode }>;
}) {
  const [selected, setSelected] = useState(sections[0]?.key ?? "");
  const active = sections.find((s) => s.key === selected) ?? sections[0];

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground/60">
        表示する項目
        <select
          value={active?.key ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground outline-none focus:border-brand"
        >
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {active?.content}
    </div>
  );
}
