import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <div className="brand-mark">明</div>
      <span className="eyebrow">404</span>
      <h1>这张桌子不在</h1>
      <p>链接可能写错了，回到安排页继续明天的晚餐。</p>
      <Link href="/planner" className="btn btn-primary compact">回到安排</Link>
    </main>
  );
}
