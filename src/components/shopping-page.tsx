"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clipboard, ClipboardCheck, LoaderCircle, RefreshCw, ShoppingBasket, UtensilsCrossed } from "lucide-react";
import type { ShoppingList } from "@/domain/types";
import { formatChineseDate, friendlyDateLabel } from "@/domain/date";
import { useApp } from "./app-provider";
import { ClientApiError } from "@/lib/client-types";
import { LoadingBlock, Modal, PageHeader } from "./ui";

export function ShoppingPage() {
  const { info, selectedDate, setSelectedDate, api, toast } = useApp();
  const [data, setData] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api<ShoppingList>(`/api/meal-plans/${selectedDate}/shopping-list`);
      setData(result);
      setChecked(new Set());
    } catch (loadError) {
      setData(null);
      setError({
        message: loadError instanceof Error ? loadError.message : "清单加载失败",
        code: loadError instanceof ClientApiError ? loadError.code : undefined
      });
    } finally {
      setLoading(false);
    }
  }, [api, selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (fallbackOpen) {
      requestAnimationFrame(() => {
        textRef.current?.focus();
        textRef.current?.select();
      });
    }
  }, [fallbackOpen]);

  function toggleChecked(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyList() {
    if (!data) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(data.copyText);
      setCopied(true);
      toast("清单已复制，可以直接粘贴到微信", "success");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setFallbackOpen(true);
      toast("浏览器不允许自动复制，已为你选中文本", "default");
    }
  }

  if (!info || !selectedDate) return null;
  const totalItems = data?.groups.reduce((sum, group) => sum + group.items.length, 0) ?? 0;
  const checkedCount = checked.size;

  return (
    <div className="page shopping-page">
      <PageHeader
        mark="买"
        title="采购清单"
        subtitle={data ? `${formatChineseDate(selectedDate)} · 由已确认菜单生成` : "只读取已确认菜单"}
        action={
          <button className="icon-btn" aria-label="刷新清单" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
        }
      />

      {loading ? <LoadingBlock label="正在按食材合并清单…" /> : error ? (
        <div className="empty-state shopping-empty">
          <span className="eyebrow">{friendlyDateLabel(selectedDate, info.today)} · 晚餐</span>
          <h2>{error.code === "PLAN_NOT_CONFIRMED" ? "这桌还没确认" : error.code === "PLAN_NOT_FOUND" ? "这天还没有菜单" : "清单暂时生成不了"}</h2>
          <p>{error.message}</p>
          <Link href="/planner" className="btn btn-primary compact"><UtensilsCrossed size={16} /> 去安排这一餐</Link>
        </div>
      ) : data ? (
        <>
          <section className="shopping-summary">
            <span className="eyebrow">已确认 · {friendlyDateLabel(selectedDate, info.today)}</span>
            <h2>{data.dishes.map((dish) => dish.name).join("、")}</h2>
            <div className="summary-tags">
              {data.dishes.map((dish) => <span key={dish.id}>{dish.name}</span>)}
            </div>
            <div className="shopping-progress">
              <div><b>{checkedCount}</b><span>/ {totalItems} 项已买</span></div>
              <div className="progress-track"><i style={{ width: `${totalItems ? (checkedCount / totalItems) * 100 : 0}%` }} /></div>
            </div>
          </section>

          {data.groups.length === 0 ? (
            <div className="empty-state compact-empty">
              <ShoppingBasket size={28} />
              <h2>无需采购</h2>
              <p>这桌需要的食材都在常备项里。</p>
            </div>
          ) : (
            <div className="buy-groups">
              {data.groups.map((group) => (
                <section className="buy-group" key={group.category}>
                  <h3><span />{group.label}<small>{group.items.length} 项</small></h3>
                  <div>
                    {group.items.map((item) => {
                      const isChecked = checked.has(item.id);
                      return (
                        <button
                          key={item.id}
                          className={`check-row ${isChecked ? "checked" : ""}`}
                          onClick={() => toggleChecked(item.id)}
                          aria-pressed={isChecked}
                        >
                          <span className="check-box">{isChecked ? <Check size={13} /> : null}</span>
                          <span className="check-name">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {data.excluded.length > 0 ? (
            <details className="pantry-panel">
              <summary>已排除 {data.excluded.length} 项家里常备食材</summary>
              <div className="tag-wrap">
                {data.excluded.map((ingredient) => <span className="tag" key={ingredient.id}>{ingredient.name}</span>)}
              </div>
              <Link href="/settings" className="text-link quiet">调整常备食材</Link>
            </details>
          ) : null}

          <div className="shopping-note">
            <p>只写食材名称，不记录克数。清单按食材 ID 去重，调整菜单后会按当前所有菜品重新合并。</p>
            <Link href="/planner" className="text-link">回到安排页</Link>
          </div>

          <div className="sticky-copy">
            <button className="btn btn-primary" onClick={() => void copyList()}>
              {copied ? <><ClipboardCheck size={17} /> 已复制</> : <><Clipboard size={17} /> 复制清单，发给家人</>}
            </button>
          </div>
        </>
      ) : null}

      <Modal
        open={fallbackOpen}
        onClose={() => setFallbackOpen(false)}
        title="手动复制清单"
        footer={<button className="btn btn-primary" onClick={() => setFallbackOpen(false)}>知道了</button>}
      >
        <p className="modal-lead">浏览器不允许自动复制。下面的内容已自动选中，也可以直接长按复制。</p>
        <textarea ref={textRef} className="copy-fallback" value={data?.copyText ?? ""} readOnly rows={8} />
      </Modal>
    </div>
  );
}
