"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 画面上部の進捗バー。アプリ内のfetch（保存・読み込み・router.refreshによる再読み込み・画面遷移）が
 * 1件でも動いている間は表示し、全部終わったら100%まで進めて消す。保存（GET以外）の間は右下に
 * 「保存中…」も出す——押したボタンが効いているのか分からず二度押しされるのを防ぐため。
 * window.fetchを1回だけ包んで件数を数えるので、個々の画面に手を入れなくても全画面で効く。
 */
let inFlight = 0;
let inFlightWrites = 0;
const listeners = new Set<() => void>();
let patched = false;

function notify() {
  for (const l of listeners) l();
}

function patchFetch() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const sameOrigin = url.startsWith("/") || url.startsWith(window.location.origin);
    // Nextの先読み（prefetch）や静的ファイルは、ユーザーの操作ではないので数えない
    const tracked =
      sameOrigin && !headers.has("next-router-prefetch") && !url.includes("/_next/static") && !url.includes("/api/auth");
    if (!tracked) return original(input, init);

    const isWrite = method !== "GET" && method !== "HEAD";
    inFlight++;
    if (isWrite) inFlightWrites++;
    notify();
    try {
      return await original(input, init);
    } finally {
      inFlight--;
      if (isWrite) inFlightWrites--;
      notify();
    }
  };
}

export default function GlobalProgressBar() {
  // idle: 非表示 / running: 90%に向けてゆっくり伸ばす / done: 100%まで伸ばしてから消す
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [saving, setSaving] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    patchFetch();
    const update = () => {
      setSaving(inFlightWrites > 0);
      if (inFlight > 0) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setPhase("running");
      } else {
        setPhase((p) => (p === "running" ? "done" : p));
        hideTimer.current = setTimeout(() => setPhase("idle"), 400);
      }
    };
    listeners.add(update);
    return () => {
      listeners.delete(update);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // 終わる時間は分からないので、running中は長い時間をかけて90%まで伸ばし、終わったら一気に100%へ
  const style =
    phase === "running"
      ? { width: "90%", transition: "width 8s cubic-bezier(0.1, 0.8, 0.2, 1)" }
      : phase === "done"
        ? { width: "100%", transition: "width 200ms ease-out" }
        : { width: "0%", transition: "none" };

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1"
        style={{ opacity: phase === "idle" ? 0 : 1, transition: "opacity 300ms" }}
      >
        <div className="h-full bg-brand shadow-[0_0_8px_rgba(14,165,233,0.6)]" style={style} />
      </div>
      {saving && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-full bg-foreground/85 px-4 py-2 text-xs font-semibold text-white shadow-lg"
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          保存中…
        </div>
      )}
    </>
  );
}
