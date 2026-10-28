"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  UtensilsCrossed
} from "lucide-react";
import type { DishWithRecipe, PlanDish, PlanResponse } from "@/domain/types";
import { addDays, formatChineseDate, formatWeekday, friendlyDateLabel } from "@/domain/date";
import { PROTEIN_LABELS, FLAVOR_LABELS, SPICE_LABELS } from "@/domain/labels";
import { pickRandomReplacement } from "@/domain/editing";
import { useApp } from "./app-provider";
import { ClientApiError } from "@/lib/client-types";
import { DishSeal, DishTags, EmptyState, LoadingBlock, Modal, PageHeader, Segmented, Sheet, Spinner, StatusPill } from "./ui";

type PickerMode = "add" | "replace";

interface PickerState {
  open: boolean;
  mode: PickerMode;
  dish: PlanDish | null;
  role: "meat" | "veg" | "soup";
}

export function PlannerPage() {
  const { info, selectedDate, setSelectedDate, api, toast, refreshApp } = useApp();
  const router = useRouter();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState>({ open: false, mode: "add", dish: null, role: "veg" });
  const [autoDishes, setAutoDishes] = useState<DishWithRecipe[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmIssues, setConfirmIssues] = useState<string[]>([]);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const loadSequence = useRef(0);

  const loadPlan = useCallback(async () => {
    if (!selectedDate) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<PlanResponse>(`/api/meal-plans/${selectedDate}`);
      if (sequence === loadSequence.current) setData(result);
    } catch (loadError) {
      if (sequence === loadSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "菜单加载失败");
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [api, selectedDate]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const plan = data?.plan ?? null;
  const composition = data?.composition;
  const warnings = data?.warnings ?? [];
  const isConfirmed = plan?.status === "confirmed";
  const isBusy = generating || actionBusy;

  const dateLabel = info ? friendlyDateLabel(selectedDate, info.today) : "明天";
  const weekday = selectedDate ? formatWeekday(selectedDate) : "";
  const displayDate = selectedDate ? formatChineseDate(selectedDate) : "—";
  const tomorrow = info?.tomorrow ?? "";

  const summary = useMemo(() => {
    if (plan?.source === "manual") {
      return plan.status === "confirmed"
        ? `这桌做过手动调整，采购清单已按当前 ${plan.dishes.length} 道菜更新。`
        : `这桌在建议基础上做过手动调整，确认后会按当前 ${plan.dishes.length} 道菜生成采购清单。`;
    }
    if (plan?.ai?.summary) return plan.ai.summary;
    if (plan) return "这桌从可推荐菜库中组合，让两位荤菜的主蛋白质错开，并尽量避开最近一周的口味。";
    return "先读一遍最近一周，再决定明天吃什么。AI 只从可推荐菜库里选菜，不会编造菜名。";
  }, [plan]);

  const evidenceStats = useMemo(() => {
    const stats = data?.stats;
    if (!stats) return [];
    return [
      { label: "猪肉", value: stats.proteinCounts.pork ?? 0 },
      { label: "鱼", value: stats.proteinCounts.fish ?? 0 },
      { label: "重口", value: stats.flavorCounts.rich },
      { label: "绿叶菜", value: stats.leafyCount }
    ];
  }, [data?.stats]);

  async function generate() {
    if (!selectedDate || isBusy) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await api<PlanResponse>(`/api/meal-plans/${selectedDate}/generate`, { method: "POST" });
      setData(result);
      const notice = result.plan?.ai?.notice;
      toast(notice || "明天这桌已经配好，可以换菜或确认。", notice ? "default" : "success");
      void refreshApp();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "生成菜单失败");
      toast(generateError instanceof Error ? generateError.message : "生成菜单失败", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function patchDish(body: Record<string, unknown>, successMessage: string) {
    if (!selectedDate) return;
    setActionBusy(true);
    try {
      const result = await api<PlanResponse>(`/api/meal-plans/${selectedDate}/dishes`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setData(result);
      toast(successMessage, "success");
      setPicker((current) => ({ ...current, open: false }));
    } catch (patchError) {
      toast(patchError instanceof Error ? patchError.message : "操作失败", "error");
    } finally {
      setActionBusy(false);
    }
  }

  async function removeDish(dish: PlanDish) {
    await patchDish({ action: "remove", dishId: dish.id }, `已移除「${dish.name}」`);
  }

  async function openPicker(mode: PickerMode, dish: PlanDish | null = null, role?: "meat" | "veg" | "soup") {
    const nextRole =
      role ??
      (dish?.role === "meat" ? "meat" : dish?.role === "soup" ? "soup" : dish ? "veg" : info?.settings.thirdDishDefault ?? "veg");
    setPicker({ open: true, mode, dish, role: nextRole });
    setPickerQuery("");
    setPickerLoading(true);
    try {
      const result = await api<{ dishes: DishWithRecipe[] }>("/api/dishes?view=auto");
      setAutoDishes(result.dishes);
    } catch (pickerError) {
      toast(pickerError instanceof Error ? pickerError.message : "菜库加载失败", "error");
    } finally {
      setPickerLoading(false);
    }
  }

  async function chooseDish(dish: DishWithRecipe) {
    if (!picker.open) return;
    if (picker.mode === "replace" && picker.dish) {
      await patchDish(
        { action: "replace", dishId: picker.dish.id, replacementDishId: dish.id },
        `已换成「${dish.name}」，另外两道不变`
      );
    } else {
      await patchDish({ action: "add", dishId: dish.id }, `已加入「${dish.name}」`);
    }
  }

  async function randomReplace() {
    if (!picker.open || picker.mode !== "replace" || !picker.dish || !plan) return;
    const replacement = pickRandomReplacement(
      autoDishes,
      plan.dishes.map((dish) => dish.id),
      picker.dish.id
    );
    if (!replacement) {
      toast("暂时没有可替换的其他菜", "default");
      return;
    }
    await patchDish(
      { action: "replace", dishId: picker.dish.id, replacementDishId: replacement.id },
      `随机换成「${replacement.name}」`
    );
  }

  async function confirmPlan(manualOverride = false) {
    if (!selectedDate) return;
    setConfirmBusy(true);
    try {
      const result = await api<PlanResponse>(`/api/meal-plans/${selectedDate}/confirm`, {
        method: "POST",
        body: JSON.stringify({ manualOverride })
      });
      setData(result);
      setConfirmOpen(false);
      setConfirmIssues([]);
      toast(manualOverride ? "已手动确认，采购清单已更新" : "已确认，采购清单已生成", "success");
      router.push("/shopping");
    } catch (confirmError) {
      if (confirmError instanceof ClientApiError && confirmError.code === "COMPOSITION_OVERRIDE_REQUIRED") {
        const details = confirmError.details as { issues?: string[] } | undefined;
        setConfirmIssues(details?.issues ?? [confirmError.message]);
        setConfirmOpen(true);
      } else {
        toast(confirmError instanceof Error ? confirmError.message : "确认失败", "error");
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  if (!info || !selectedDate) return null;

  const familySummary = `${info.family.profile.adults} 大 ${info.family.profile.children} 小 · ${info.family.profile.spiceTolerance}`;
  const pickerRoles: Array<{ value: "meat" | "veg" | "soup"; label: string }> = [
    { value: "meat", label: "荤菜" },
    { value: "veg", label: "素菜" },
    { value: "soup", label: "汤" }
  ];

  const filteredPickerDishes = autoDishes.filter(
    (dish) =>
      dish.role === picker.role &&
      !plan?.dishes.some((current) => current.id === dish.id) &&
      (!pickerQuery.trim() || dish.name.includes(pickerQuery.trim()))
  );

  return (
    <div className="page planner-page">
      <PageHeader
        title="明日菜单"
        subtitle={`${info.family.name} · ${familySummary}`}
        action={
          <div className="header-actions">
            <Link href="/history" className="icon-btn" aria-label="历史菜单">
              <History size={18} />
            </Link>
            <Link href="/settings" className="icon-btn" aria-label="家庭设置">
              <SlidersHorizontal size={18} />
            </Link>
          </div>
        }
      />

      <div className="date-row">
        <div>
          <span className="eyebrow">{dateLabel} · {weekday}</span>
          <h1>{displayDate}</h1>
        </div>
        <div className="date-controls">
          <button
            className="icon-btn small"
            aria-label="前一天"
            disabled={selectedDate <= info.today}
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <label className="date-pill">
            <CalendarDays size={14} />
            <span>选日期</span>
            <input
              type="date"
              min={info.today}
              value={selectedDate}
              onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              aria-label="选择晚餐日期"
            />
          </label>
          <button
            className="icon-btn small"
            aria-label="后一天"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {selectedDate !== tomorrow ? (
        <button className="text-link date-reset" onClick={() => setSelectedDate(tomorrow)}>
          回到明天
        </button>
      ) : null}

      {loading ? (
        <LoadingBlock label="正在翻最近一周的餐桌…" />
      ) : error && !data ? (
        <EmptyState
          eyebrow="连接出了点问题"
          title="菜单没有加载出来"
          body={error}
          action={<button className="btn btn-primary compact" onClick={() => void loadPlan()}>再试一次</button>}
        />
      ) : (
        <>
          <section className={`ai-card ${plan?.source === "local" ? "local" : ""}`}>
            <div className="ai-card-head">
              <span className="ai-label">
                <i className={info.ai.configured ? "" : "local-dot"} />
                {plan ? (plan.source === "local" ? "本地规则推荐" : plan.source === "manual" ? (plan.status === "confirmed" ? "已确认 · 手动调整" : "手动调整菜单") : plan.status === "confirmed" ? "已确认菜单" : "AI 已读取最近 7 天") : info.ai.configured ? "AI 已就位" : "本地规则就位"}
              </span>
              <span className="stamp">{(plan ? plan.source === "local" : !info.ai.configured) ? <>本<br />地</> : plan?.source === "manual" ? <>手<br />调</> : <>AI<br />掌勺</>}</span>
            </div>
            <p className="ai-lead">{summary}</p>
            <div className="stat-row">
              {evidenceStats.map((stat) => (
                <div key={stat.label}>
                  <b>{stat.value}</b>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
            {plan?.ai?.notice ? <p className="ai-notice">{plan.ai.notice}</p> : null}
            {plan ? (
              <button className="text-link" onClick={() => setEvidenceOpen(true)}>
                看 AI 的判断依据 <ArrowRight size={16} />
              </button>
            ) : (
              <div className="empty-ai-action">
                <button className="btn btn-chili" onClick={() => void generate()} disabled={generating}>
                  {generating ? <><LoaderCircle className="spin" size={17} /> 正在配一桌…</> : <><Sparkles size={17} /> 让 AI 安排{dateLabel === "明天" ? "明天" : "这一餐"}</>}
                </button>
                <small>只从可推荐菜库中选菜，确认前不写入历史。</small>
              </div>
            )}
          </section>

          <div className="section-head">
            <div>
              <span className="eyebrow">晚餐 · 按需增减</span>
              <h2>{plan ? "这桌的菜单" : "还空着碗筷"}</h2>
            </div>
            <button className="text-link quiet" onClick={() => setEvidenceOpen(true)} disabled={!plan}>
              <span id="compositionLabel">{composition?.label ?? "还没有选菜"}</span>
            </button>
          </div>

          {plan ? (
            <div className={`dish-list ${actionBusy ? "busy" : ""}`}>
              {plan.dishes.map((dish, index) => (
                <article className="dish-card" key={dish.id}>
                  <DishSeal dish={dish} />
                  <div className="dish-info">
                    <div className="dish-top">
                      <span className="dish-no">{String(index + 1).padStart(2, "0")}</span>
                      <h3>{dish.name}</h3>
                    </div>
                    <p className="dish-note">{dish.reason ?? (plan.source === "manual" ? "手动调整的菜品" : "符合这桌的搭配规则")}</p>
                    <DishTags role={dish.role} protein={dish.protein} spiceLevel={dish.spiceLevel} flavor={dish.flavor} compact />
                  </div>
                  <div className="dish-actions">
                    <button className="swap-btn" onClick={() => void openPicker("replace", dish)} disabled={isBusy}>
                      换
                    </button>
                    <button className="remove-btn" onClick={() => void removeDish(dish)} disabled={isBusy} aria-label={`移除${dish.name}`}>
                      删
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="dish-list placeholder-list">
              {[0, 1, 2].map((item) => (
                <div className="dish-placeholder" key={item}>
                  <DishSeal dish={{ role: item === 2 ? "veg" : "meat", protein: item === 0 ? "fish" : "beef", name: "" }} />
                  <div>
                    <span>{item === 2 ? "素菜 · 必须保留" : `荤菜 ${item + 1}`}</span>
                    <small>{item === 2 ? "汤菜会作为额外一道" : "等待 AI 配菜"}</small>
                  </div>
                </div>
              ))}
            </div>
          )}

          {plan ? (
            <button className="add-dish-bar" onClick={() => void openPicker("add", null)} disabled={isBusy}>
              <Plus size={16} /> 加一道菜
            </button>
          ) : null}

          {warnings.length > 0 ? (
            <div className="warning-box">
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
              {plan && (plan.manualOverride || plan.historyWindowUsed < info.settings.repeatDays) ? (
                <span>{plan.manualOverride ? "这桌包含手动调整，确认时会再次核对。" : "已适度放宽近期重复限制。"}</span>
              ) : null}
            </div>
          ) : null}

          {plan ? (
            <div className="planner-actions">
              {isConfirmed ? (
                <Link href="/shopping" className="btn btn-primary">
                  <UtensilsCrossed size={17} /> 已确认 · 查看采购清单
                </Link>
              ) : (
                <button className="btn btn-primary" onClick={() => void confirmPlan()} disabled={isBusy || confirmBusy}>
                  {confirmBusy ? <><LoaderCircle className="spin" size={17} /> 正在确认…</> : <><UtensilsCrossed size={17} /> 就吃这些</>}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => void generate()} disabled={isBusy}>
                {generating ? <><LoaderCircle className="spin" size={16} /> AI 正在重新想…</> : <><RotateCcw size={16} /> 让 AI 再想一桌</>}
              </button>
            </div>
          ) : null}
          <p className="tiny-note">AI 只从菜库选菜；硬规则由服务端再校验一次。确认前的菜单只是草稿，不进历史。</p>
          {plan && isConfirmed ? (
            <p className="tiny-note confirmed-note"><StatusPill tone="sage">已确认</StatusPill> 再次安排同一日期会生成新草稿，确认后覆盖原记录。</p>
          ) : null}
        </>
      )}

      <Sheet
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        eyebrow={`${displayDate} · 晚餐`}
        title="AI 为什么这样选"
        footer={
          <button className="btn btn-ghost" onClick={() => { setEvidenceOpen(false); void generate(); }} disabled={generating}>
            <Sparkles size={16} /> 让 AI 重新判断
          </button>
        }
      >
        {data ? <EvidenceContent data={data} /> : <LoadingBlock />}
      </Sheet>

      <Sheet
        open={picker.open}
        onClose={() => setPicker((current) => ({ ...current, open: false }))}
        eyebrow={picker.mode === "replace" ? "可以换成任意角色，也可以交给随机" : "先选角色，再选菜"}
        title={picker.mode === "replace" ? "换一道菜" : "加一道菜"}
      >
        {picker.mode === "replace" ? (
          <button className="btn btn-ghost compact random-replace" onClick={() => void randomReplace()} disabled={actionBusy || pickerLoading}>
            <Shuffle size={16} /> 随机换一道
          </button>
        ) : null}
        <Segmented
          value={picker.role}
          options={pickerRoles}
          onChange={(role) => setPicker((current) => ({ ...current, role }))}
          ariaLabel="选择菜品角色"
        />
        <div className="search-box">
          <Search size={16} />
          <input
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            placeholder="搜一道菜"
            aria-label="搜索菜品"
          />
        </div>
        {pickerLoading ? (
          <LoadingBlock label="正在筛可推荐的菜…" />
        ) : filteredPickerDishes.length === 0 ? (
          <EmptyState title="这个角色暂时没有可选的菜" body="先到菜库补全食材，或检查忌口与停用设置。" />
        ) : (
          <div className="picker-list">
            {filteredPickerDishes.map((dish) => (
              <button className="picker-row" key={dish.id} onClick={() => void chooseDish(dish)} disabled={actionBusy}>
                <DishSeal dish={dish} size="small" />
                <div>
                  <strong>{dish.name}</strong>
                  <small>{PROTEIN_LABELS[dish.protein]} · {SPICE_LABELS[dish.spiceLevel]} · {FLAVOR_LABELS[dish.flavor]}</small>
                </div>
                <span className="pick-action">{actionBusy ? <Spinner /> : "选它"}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <Modal
        open={confirmOpen}
        onClose={() => { if (!confirmBusy) setConfirmOpen(false); }}
        title="这桌需要再确认"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={confirmBusy}>回去调整</button>
            <button className="btn btn-primary" onClick={() => void confirmPlan(true)} disabled={confirmBusy}>
              {confirmBusy ? <><LoaderCircle className="spin" size={16} /> 正在确认…</> : "仍然确认"}
            </button>
          </>
        }
      >
        <p className="modal-lead">下面这些问题需要你确认。手动调整的菜品数量和荤素结构不会被限制，确认后会按当前菜单生成采购清单。</p>
        <ul className="issue-list">
          {confirmIssues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      </Modal>
    </div>
  );
}

function EvidenceContent({ data }: { data: PlanResponse }) {
  const stats = data.stats;
  const proteins = Object.entries(stats.proteinCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxProtein = Math.max(1, ...proteins.map(([, count]) => count));
  const maxFlavor = Math.max(1, ...Object.values(stats.flavorCounts));
  const plan = data.plan;

  return (
    <div className="evidence">
      <div className="history-days">
        {data.recentMeals.length === 0 ? (
          <p className="evidence-empty">最近 7 天还没有已确认晚餐，AI 会从菜库和家庭规则开始搭。</p>
        ) : data.recentMeals.map((meal) => (
          <div className={`history-day ${meal.dishes.some((dish) => dish.protein === "pork") ? "hot" : ""}`} key={meal.date}>
            <b>{meal.date.slice(8).replace(/^0/, "")}</b>
            <span>{meal.dishes.map((dish) => dish.name).join(" / ")}</span>
          </div>
        ))}
      </div>

      {plan?.ai?.summary ? <p className="evidence-summary">{plan.ai.summary}</p> : null}

      <div className="stat-bars">
        {proteins.length > 0 ? proteins.map(([protein, count]) => (
          <div key={protein}>
            <div className="stat-bar-head"><span>{PROTEIN_LABELS[protein as keyof typeof PROTEIN_LABELS] ?? protein}</span><b>{count} 次</b></div>
            <div className="bar"><i style={{ width: `${(count / maxProtein) * 100}%` }} /></div>
          </div>
        )) : <p className="evidence-empty">暂无蛋白质记录</p>}
        <div>
          <div className="stat-bar-head"><span>重口</span><b>{stats.flavorCounts.rich} 次</b></div>
          <div className="bar mustard"><i style={{ width: `${(stats.flavorCounts.rich / maxFlavor) * 100}%` }} /></div>
        </div>
        <div className="stat-inline">
          <span>辣菜 <b>{stats.spicyCount}</b> 次</span>
          <span>绿叶菜 <b>{stats.leafyCount}</b> 次</span>
          <span>可推荐 <b>{stats.candidateCounts.meat + stats.candidateCounts.veg + stats.candidateCounts.soup}</b> 道</span>
        </div>
      </div>

      <div className="reason-list">
        {plan?.dishes.map((dish, index) => (
          <div className="reason" key={dish.id}>
            <b>{index + 1}</b>
            <div><strong>{dish.name}。</strong>{dish.reason ?? "符合蛋白质、辣度、清淡与重复窗口规则。"}</div>
          </div>
        ))}
        {plan?.ai?.diversity ? (
          <>
            <div className="reason"><b>蛋</b><div><strong>蛋白质。</strong>{plan.ai.diversity.protein}</div></div>
            <div className="reason"><b>蔬</b><div><strong>蔬菜。</strong>{plan.ai.diversity.vegetable}</div></div>
            <div className="reason"><b>味</b><div><strong>口味。</strong>{plan.ai.diversity.flavor}</div></div>
          </>
        ) : null}
      </div>

      <div className="boundary-note">
        自动推荐会保证 2 道荤菜、1 道真正的素菜，并按设置额外配 1 道汤；汤不替代素菜。手工换菜、加菜和减菜不受菜品数量或荤素结构限制，但仍会检查忌口、食材完整度和重复菜品。AI 不可用时自动回退到本地规则。
      </div>
      {plan?.ai ? (
        <div className="model-note">
          {plan.ai.fallbackUsed ? "本地规则" : `模型 ${plan.ai.model}`}
          {plan.ai.confidence != null ? ` · 置信度 ${Math.round(plan.ai.confidence * 100)}%` : ""}
        </div>
      ) : null}
    </div>
  );
}
