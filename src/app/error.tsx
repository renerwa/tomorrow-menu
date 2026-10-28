"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] page error", error.digest ?? "unknown");
  }, [error]);

  return (
    <main className="standalone-state">
      <div className="brand-mark muted">明</div>
      <span className="eyebrow">出了点问题</span>
      <h1>餐桌暂时没摆好</h1>
      <p>数据还在云端。刷新一次通常就能继续。</p>
      <button className="btn btn-primary compact" onClick={reset}>重新加载</button>
    </main>
  );
}
