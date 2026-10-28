"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChefHat, ChevronRight, History, Sparkles, UtensilsCrossed } from "lucide-react";
import type { Composition, Dish, MealPlanSource, MealPlanStatus } from "@/domain/types";
import { formatChineseDate, formatWeekday } from "@/domain/date";
import { useApp } from "./app-provider";
import { DishSeal, EmptyState, LoadingBlock, PageHeader, StatusPill } from "./ui";

interface HistoryPlan {
  id: string;
  targetDate: string;
  status: MealPlanStatus;
  source: MealPlanSource;
  manualOverride: boolean;
  historyWindowUsed: number;
  updatedAt: string;
  dishes: Dish[];
  composition: Composition;
}

export function HistoryPage() {
  const { info, api, setSelectedDate, toast } = useApp();
  const [plans, setPlans] = useState<HistoryPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    void api<{ plans: HistoryPlan[] }>("/api/history")
      .then((result) => setPlans(result.plans))
      .catch((error) => toast(error instanceof Error ? error.message : "历史加载失败", "error"))
      .finally(() => setLoading(false));
  }, [api, toast]);

  const grouped = useMemo(() => {
    const groups = new Map<string, HistoryPlan[]>();
    for (const plan of plans) {
      const month = plan.targetDate.slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), plan]);
    }
    return [...groups.entries()];
  }, [plans]);

  function openShopping(plan: HistoryPlan) {
    setSelectedDate(plan.targetDate);
    router.push("/shopping");
  }

  if (!info) return null;

  return (
    <div className="page history-page">
      <PageHeader
        mark="史"
        title="餐桌历史"
        subtitle="只记录已确认菜单 · 过去日期只读"
        action={<Link href="/planner" className="icon-btn" aria-label="返回安排"><ArrowLeft size={18} /></Link>}
      />

      {loading ? <LoadingBlock label="正在翻餐桌记录…" /> : plans.length === 0 ? (
        <EmptyState
          eyebrow="还没有历史"
          title="第一顿，从明天开始"
          body="确认菜单后，这里会留下日期、菜品和采购清单入口。草稿不会进入历史。"
          action={<Link href="/planner" className="btn btn-primary compact"><UtensilsCrossed size={16} /> 去安排晚餐</Link>}
        />
      ) : (
        <div className="history-months">
          {grouped.map(([month, monthPlans]) => (
            <section key={month} className="history-month">
              <h2>{Number(month.slice(5))} 月 <span>{monthPlans.length} 顿</span></h2>
              <div className="history-timeline">
                {monthPlans.map((plan) => (
                  <article className="history-card" key={plan.id}>
                    <div className="history-date">
                      <b>{Number(plan.targetDate.slice(8, 10))}</b>
                      <span>{formatWeekday(plan.targetDate)}</span>
                    </div>
                    <div className="history-content">
                      <div className="history-card-head">
                        <div>
                          <span className="eyebrow">{formatChineseDate(plan.targetDate)} · 晚餐</span>
                          <h3>{plan.dishes.map((dish) => dish.name).join("、")}</h3>
                        </div>
                        <StatusPill tone={plan.source === "local" ? "gold" : plan.source === "manual" ? "muted" : "sage"}>
                          {plan.source === "ai" ? "AI 搭配" : plan.source === "local" ? "本地兜底" : "手动编辑"}
                        </StatusPill>
                      </div>
                      <div className="history-dishes">
                        {plan.dishes.map((dish) => (
                          <div className="history-dish" key={dish.id}>
                            <DishSeal dish={dish} size="small" />
                            <span>{dish.name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="history-meta">
                        <span><Sparkles size={13} /> {plan.composition.label}</span>
                        {plan.manualOverride ? <span className="override-tag">手动调整</span> : null}
                        {plan.historyWindowUsed < info.settings.repeatDays ? <span>窗口放宽至 {plan.historyWindowUsed || 0} 天</span> : null}
                      </div>
                      <button className="history-shopping-link" onClick={() => openShopping(plan)}>
                        <ChefHat size={15} /> 查看当天采购清单 <ChevronRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="tiny-note history-footnote"><History size={13} /> 历史只保留最终确认版本；同一天再次确认会覆盖旧记录，不保留多个版本。</p>
    </div>
  );
}
