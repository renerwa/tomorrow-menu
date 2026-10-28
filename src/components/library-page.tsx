"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleOff,
  LibraryBig,
  LoaderCircle,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";
import type { DishWithRecipe, Ingredient, IngredientCategory, Protein } from "@/domain/types";
import type { DishCountSummary } from "@/domain/types";
import { FLAVOR_LABELS, PROTEIN_LABELS, ROLE_LABELS, SPICE_LABELS } from "@/domain/labels";
import { useApp } from "./app-provider";
import { DishSeal, DishTags, EmptyState, Field, LoadingBlock, Modal, PageHeader, Segmented, Spinner, StatusPill } from "./ui";

type RoleFilter = "all" | "meat" | "veg" | "soup" | "other";
type StatusFilter = "all" | "auto" | "draft" | "disabled";

interface DishListResponse {
  dishes: DishWithRecipe[];
  counts: DishCountSummary;
}

interface RecipeResponse {
  dish: DishWithRecipe;
  ingredients: Ingredient[];
}

interface Suggestion {
  dishId: string;
  ingredients: Array<{ name: string; category: IngredientCategory; defaultPantry: boolean; id?: string | null }>;
}

interface NewIngredient {
  name: string;
  category: IngredientCategory;
}

export function LibraryPage() {
  const { info, api, toast } = useApp();
  const [data, setData] = useState<DishListResponse | null>(null);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DishWithRecipe | null>(null);
  const [detailRecipe, setDetailRecipe] = useState<Ingredient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDirty, setDetailDirty] = useState(false);
  const [newRecipeIngredient, setNewRecipeIngredient] = useState("");
  const [newRecipeCategory, setNewRecipeCategory] = useState<IngredientCategory>("vegetable");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dishes, ingredients] = await Promise.all([
        api<DishListResponse>("/api/dishes"),
        api<{ ingredients: Ingredient[] }>("/api/ingredients")
      ]);
      setData(dishes);
      setAllIngredients(ingredients.ingredients);
    } catch (error) {
      toast(error instanceof Error ? error.message : "菜库加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const normalizedQuery = query.trim();
    return data.dishes.filter((dish) => {
      if (normalizedQuery && !dish.name.includes(normalizedQuery)) return false;
      if (roleFilter !== "all" && dish.role !== roleFilter) return false;
      if (statusFilter === "auto" && !dish.autoEligible) return false;
      if (statusFilter === "draft" && dish.dataStatus !== "draft") return false;
      if (statusFilter === "disabled" && !dish.disabled) return false;
      return true;
    });
  }, [data, query, roleFilter, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Array<{ role: "meat" | "veg" | "soup" | "other"; label: string; dishes: DishWithRecipe[] }> = [
      { role: "meat", label: "荤菜", dishes: [] },
      { role: "veg", label: "素菜", dishes: [] },
      { role: "soup", label: "汤", dishes: [] },
      { role: "other", label: "非推荐池", dishes: [] }
    ];
    for (const dish of filtered) groups.find((group) => group.role === dish.role)?.dishes.push(dish);
    return groups.filter((group) => group.dishes.length > 0);
  }, [filtered]);

  async function refreshDishList() {
    const result = await api<DishListResponse>("/api/dishes");
    setData(result);
    return result;
  }

  async function toggleDish(dish: DishWithRecipe, enabled: boolean) {
    setBusy(true);
    try {
      await api(`/api/dishes/${dish.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      await refreshDishList();
      if (detail?.id === dish.id) setDetail({ ...detail, disabled: !enabled });
      toast(enabled ? `已启用「${dish.name}」` : `已停用「${dish.name}」`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(dish: DishWithRecipe) {
    setDetail(dish);
    setDetailDirty(false);
    setDetailLoading(true);
    try {
      const result = await api<RecipeResponse>(`/api/dishes/${dish.id}/recipe`);
      setDetail(result.dish);
      setDetailRecipe(result.ingredients);
    } catch (error) {
      toast(error instanceof Error ? error.message : "菜谱加载失败", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  function addDetailIngredient() {
    const name = newRecipeIngredient.trim();
    if (!name) return;
    if (detailRecipe.some((ingredient) => ingredient.name === name)) {
      setNewRecipeIngredient("");
      return;
    }
    setDetailRecipe((current) => [
      ...current,
      {
        id: "",
        name,
        normalizedName: name,
        category: newRecipeCategory,
        defaultPantry: false,
        isCustom: false
      }
    ]);
    setNewRecipeIngredient("");
    setDetailDirty(true);
  }

  async function saveRecipe(markReady = true) {
    if (!detail) return;
    setBusy(true);
    try {
      const existingIds = detailRecipe.filter((ingredient) => ingredient.id).map((ingredient) => ingredient.id);
      const newIngredients = detailRecipe
        .filter((ingredient) => !ingredient.id)
        .map((ingredient) => ({ name: ingredient.name, category: ingredient.category, defaultPantry: ingredient.defaultPantry }));
      await api(`/api/dishes/${detail.id}/recipe`, {
        method: "PUT",
        body: JSON.stringify({ ingredientIds: existingIds, ingredients: newIngredients, markReady })
      });
      setDetailDirty(false);
      await refreshDishList();
      const refreshed = await api<RecipeResponse>(`/api/dishes/${detail.id}/recipe`);
      setDetail(refreshed.dish);
      setDetailRecipe(refreshed.ingredients);
      toast(markReady ? "食材表已保存，这道菜可以推荐了" : "食材草稿已保存", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function suggestForDishIds(dishIds: string[]) {
    if (dishIds.length === 0) return;
    setBatchBusy(true);
    try {
      const result = await api<{ suggestions: Suggestion[] }>("/api/ai/recipe-suggest", {
        method: "POST",
        body: JSON.stringify({ dishIds: dishIds.slice(0, 20) })
      });
      setSuggestions(result.suggestions);
      setSuggestOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI 补全失败", "error");
    } finally {
      setBatchBusy(false);
    }
  }

  async function applySuggestions() {
    if (!suggestions) return;
    setBusy(true);
    try {
      for (const suggestion of suggestions) {
        const existingIds = suggestion.ingredients.filter((item) => item.id).map((item) => item.id as string);
        const newItems = suggestion.ingredients
          .filter((item) => !item.id)
          .map((item) => ({ name: item.name, category: item.category, defaultPantry: item.defaultPantry }));
        if (existingIds.length + newItems.length === 0) continue;
        await api(`/api/dishes/${suggestion.dishId}/recipe`, {
          method: "PUT",
          body: JSON.stringify({ ingredientIds: existingIds, ingredients: newItems, markReady: true })
        });
      }
      setSuggestOpen(false);
      setSuggestions(null);
      setSelected(new Set());
      await refreshDishList();
      toast("已确认并写入食材表，相关菜品现在可以推荐", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "写入食材失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDish() {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/api/dishes/${detail.id}`, { method: "DELETE" });
      setDeleteOpen(false);
      setDetail(null);
      await refreshDishList();
      toast("自定义菜已从菜库移除", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function updateDishMeta(patch: {
    name: string;
    role: "meat" | "veg" | "soup" | "other";
    protein: Protein;
    spiceLevel: 0 | 1 | 2;
    flavor: "light" | "normal" | "rich";
  }) {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/api/dishes/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, autoPlannable: patch.role !== "other" })
      });
      await refreshDishList();
      const refreshed = await api<RecipeResponse>(`/api/dishes/${detail.id}/recipe`);
      setDetail(refreshed.dish);
      setDetailRecipe(refreshed.ingredients);
      toast("菜品信息已保存", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存菜品信息失败", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 20) next.add(id);
      return next;
    });
  }

  if (!info) return null;

  return (
    <div className="page library-page">
      <PageHeader
        mark="库"
        title="家庭菜库"
        subtitle="180 道家常菜 · 只推荐食材齐全的菜"
        action={<button className="icon-btn" aria-label="新增自定义菜" onClick={() => setCreateOpen(true)}><Plus size={19} /></button>}
      />

      {loading ? <LoadingBlock label="正在整理菜库…" /> : !data ? (
        <EmptyState title="菜库暂时没打开" body="请检查连接后重试。" />
      ) : (
        <>
          <div className="library-summary">
            <div><b>{data.counts.total}</b><span>全部菜品</span></div>
            <div><b>{data.counts.autoPlannable}</b><span>可参与推荐</span></div>
            <div><b>{data.counts.draft}</b><span>待补全</span></div>
          </div>

          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜菜名，例如：牛、汤、青菜" aria-label="搜索菜库" />
          </div>

          <Segmented
            value={roleFilter}
            options={[
              { value: "all", label: "全部" },
              { value: "meat", label: "荤菜" },
              { value: "veg", label: "素菜" },
              { value: "soup", label: "汤" },
              { value: "other", label: "非推荐" }
            ]}
            onChange={setRoleFilter}
            ariaLabel="按角色筛选"
          />
          <div className="filter-chips">
            {([
              ["all", "全部状态"],
              ["auto", "可推荐"],
              ["draft", "待完善"],
              ["disabled", "已停用"]
            ] as const).map(([value, label]) => (
              <button key={value} className={`chip ${statusFilter === value ? "active" : ""}`} onClick={() => setStatusFilter(value)}>{label}</button>
            ))}
          </div>

          {data.counts.draft > 0 ? (
            <div className="ai-callout">
              <div>
                <strong>还有 {data.counts.draft} 道待补全</strong>
                <span>勾选待完善菜，AI 生成食材草稿，你确认后才转可推荐。</span>
              </div>
              {selected.size > 0 ? (
                <button onClick={() => void suggestForDishIds([...selected])} disabled={batchBusy}>
                  {batchBusy ? <Spinner /> : <Sparkles size={15} />} 补全 {selected.size} 道
                </button>
              ) : (
                <button onClick={() => { setRoleFilter("all"); setStatusFilter("draft"); }}>查看待补全</button>
              )}
            </div>
          ) : null}

          {selected.size > 0 ? (
            <div className="selection-bar">
              <span>已选 {selected.size} 道待完善菜</span>
              <button className="text-link" onClick={() => setSelected(new Set())}>清空</button>
              <button className="btn btn-primary compact" onClick={() => void suggestForDishIds([...selected])} disabled={batchBusy}>
                {batchBusy ? <Spinner /> : <Sparkles size={15} />} AI 补全食材
              </button>
            </div>
          ) : null}

          <div className="library-groups">
            {grouped.length === 0 ? <EmptyState title="没有符合条件的菜" body="换个关键词或筛选条件看看。" /> : grouped.map((group) => (
              <section className="library-group" key={group.role}>
                <header><h2>{group.label}</h2><span>{group.dishes.length} 道</span></header>
                <div className="dish-rows">
                  {group.dishes.map((dish) => (
                    <div className={`library-row ${dish.disabled ? "disabled" : ""}`} key={dish.id}>
                      {dish.dataStatus === "draft" ? (
                        <button
                          className={`check-square ${selected.has(dish.id) ? "checked" : ""}`}
                          aria-label={`选择${dish.name}`}
                          onClick={() => toggleSelected(dish.id)}
                        >
                          {selected.has(dish.id) ? <Check size={12} /> : null}
                        </button>
                      ) : <span className="check-spacer" />}
                      <button className="library-row-main" onClick={() => void openDetail(dish)}>
                        <DishSeal dish={dish} size="small" />
                        <div>
                          <strong>{dish.name}</strong>
                          <small>
                            {ROLE_LABELS[dish.role]} · {dish.role === "meat" ? `${PROTEIN_LABELS[dish.protein]} · ` : ""}
                            {SPICE_LABELS[dish.spiceLevel]} · {FLAVOR_LABELS[dish.flavor]} · {dish.ingredientCount} 样食材
                          </small>
                        </div>
                      </button>
                      <div className="library-row-status">
                        {dish.disabled ? <StatusPill tone="muted">已停用</StatusPill> : dish.blocked ? <StatusPill tone="red">含忌口</StatusPill> : dish.dataStatus === "ready" ? <StatusPill tone="sage">可推荐</StatusPill> : <StatusPill tone="gold">待完善</StatusPill>}
                        <button
                          className="mini-toggle"
                          aria-label={dish.disabled ? "启用" : "停用"}
                          onClick={() => void toggleDish(dish, dish.disabled)}
                          disabled={busy}
                        >
                          <CircleOff size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="tiny-note">内置菜不能删除，只能停用或校正食材。只有 ready、未停用、无忌口且食材完整的菜进入 AI 候选池。</p>
        </>
      )}

      <SheetDetail
        detail={detail}
        recipe={detailRecipe}
        loading={detailLoading}
        dirty={detailDirty}
        busy={busy}
        newIngredient={newRecipeIngredient}
        newCategory={newRecipeCategory}
        onClose={() => { if (!busy) { setDetail(null); setDetailRecipe([]); } }}
        onToggle={(enabled) => detail && void toggleDish(detail, enabled)}
        onRemoveIngredient={(id, name) => {
          setDetailRecipe((current) => current.filter((ingredient) => (id ? ingredient.id !== id : ingredient.name !== name)));
          setDetailDirty(true);
        }}
        onNewIngredientChange={setNewRecipeIngredient}
        onNewCategoryChange={setNewRecipeCategory}
        onAddIngredient={addDetailIngredient}
        onSaveRecipe={() => void saveRecipe(true)}
        onSuggest={() => detail && void suggestForDishIds([detail.id])}
        onUpdateMeta={updateDishMeta}
        onDelete={() => setDeleteOpen(true)}
      />

      <Modal
        open={Boolean(detail && deleteOpen)}
        onClose={() => setDeleteOpen(false)}
        title="从菜库移除这道自定义菜？"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>保留</button>
            <button className="btn btn-danger" onClick={() => void deleteDish()} disabled={busy}>
              {busy ? <Spinner /> : <Trash2 size={16} />} 确认删除
            </button>
          </>
        }
      >
        <p className="modal-lead">移除后，这道菜不会再出现在菜库和推荐池里；已经确认的历史菜单仍会保留菜名和食材记录。若只是暂时不做，建议优先使用“停用”。</p>
      </Modal>

      <Modal
        open={suggestOpen}
        onClose={() => { if (!busy) { setSuggestOpen(false); setSuggestions(null); } }}
        title="确认 AI 食材草稿"
        wide
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setSuggestOpen(false); setSuggestions(null); }} disabled={busy}>先不保存</button>
            <button className="btn btn-primary" onClick={() => void applySuggestions()} disabled={busy}>
              {busy ? <><LoaderCircle className="spin" size={16} /> 正在写入…</> : "确认并转为可推荐"}
            </button>
          </>
        }
      >
        <p className="modal-lead">AI 只生成草稿。点击确认后才会写入家庭菜谱，并把这些菜标为 ready。</p>
        <div className="suggestion-list">
          {suggestions?.map((suggestion) => {
            const dish = data?.dishes.find((item) => item.id === suggestion.dishId);
            return (
              <div className="suggestion-block" key={suggestion.dishId}>
                <strong>{dish?.name ?? suggestion.dishId}</strong>
                <div className="tag-wrap">
                  {suggestion.ingredients.map((item) => <span className="tag" key={`${item.name}-${item.category}`}>{item.name}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <CreateDishModal
        open={createOpen}
        ingredients={allIngredients}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => { setCreateOpen(false); await refreshDishList(); toast("自定义菜已加入菜库", "success"); }}
        api={api}
        toast={toast}
      />
    </div>
  );
}

function SheetDetail({
  detail,
  recipe,
  loading,
  dirty,
  busy,
  newIngredient,
  newCategory,
  onClose,
  onToggle,
  onRemoveIngredient,
  onNewIngredientChange,
  onNewCategoryChange,
  onAddIngredient,
  onSaveRecipe,
  onSuggest,
  onUpdateMeta,
  onDelete
}: {
  detail: DishWithRecipe | null;
  recipe: Ingredient[];
  loading: boolean;
  dirty: boolean;
  busy: boolean;
  newIngredient: string;
  newCategory: IngredientCategory;
  onClose: () => void;
  onToggle: (enabled: boolean) => void;
  onRemoveIngredient: (id: string, name: string) => void;
  onNewIngredientChange: (value: string) => void;
  onNewCategoryChange: (value: IngredientCategory) => void;
  onAddIngredient: () => void;
  onSaveRecipe: () => void;
  onSuggest: () => void;
  onUpdateMeta: (patch: {
    name: string;
    role: "meat" | "veg" | "soup" | "other";
    protein: Protein;
    spiceLevel: 0 | 1 | 2;
    flavor: "light" | "normal" | "rich";
  }) => Promise<void>;
  onDelete: () => void;
}) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaRole, setMetaRole] = useState<"meat" | "veg" | "soup" | "other">("meat");
  const [metaProtein, setMetaProtein] = useState<Protein>("pork");
  const [metaSpice, setMetaSpice] = useState<0 | 1 | 2>(0);
  const [metaFlavor, setMetaFlavor] = useState<"light" | "normal" | "rich">("normal");
  const [metaBusy, setMetaBusy] = useState(false);

  useEffect(() => {
    if (!detail) return;
    setEditingMeta(false);
    setMetaName(detail.name);
    setMetaRole(detail.role);
    setMetaProtein(detail.protein);
    setMetaSpice(detail.spiceLevel);
    setMetaFlavor(detail.flavor);
  }, [detail?.id]);

  async function saveMeta() {
    if (!metaName.trim()) return;
    setMetaBusy(true);
    try {
      await onUpdateMeta({
        name: metaName.trim(),
        role: metaRole,
        protein: metaRole === "veg" || metaRole === "other" ? "none" : metaProtein,
        spiceLevel: metaSpice,
        flavor: metaFlavor
      });
      setEditingMeta(false);
    } catch {
      // The parent already shows the API error; keep the editor open for a retry.
    } finally {
      setMetaBusy(false);
    }
  }

  return (
    <Modal open={Boolean(detail)} onClose={onClose} title={detail?.name ?? "菜品详情"} wide>
      {detail ? (
        <div className="detail">
          <div className="detail-hero">
            <DishSeal dish={detail} />
            <div>
              <DishTags role={detail.role} protein={detail.protein} spiceLevel={detail.spiceLevel} flavor={detail.flavor} />
              <p>{detail.sourceGroup} · {detail.isCustom ? "家庭自定义" : "内置菜"}</p>
            </div>
          </div>
          <div className="detail-status-row">
            <StatusPill tone={detail.disabled ? "muted" : detail.dataStatus === "ready" ? "sage" : "gold"}>
              {detail.disabled ? "已停用" : detail.dataStatus === "ready" ? "可推荐" : "待完善"}
            </StatusPill>
            <span>{detail.recipeComplete ? "食材完整" : "食材表未完成"}</span>
            <button className="text-link quiet" onClick={() => onToggle(detail.disabled)} disabled={busy}>{detail.disabled ? "启用" : "停用"}</button>
          </div>
          {detail.isCustom ? (
            <div className="detail-meta-actions">
              <button className="text-link" onClick={() => setEditingMeta((value) => !value)}>
                <PencilLine size={14} /> {editingMeta ? "收起编辑" : "编辑菜名与分类"}
              </button>
              <button className="text-link danger-link" onClick={onDelete}><Trash2 size={14} /> 从菜库移除</button>
            </div>
          ) : null}

          {detail.isCustom && editingMeta ? (
            <section className="detail-section meta-editor">
              <div className="section-head compact-head"><h3>菜品信息</h3><span>食材表保持不变</span></div>
              <div className="form-grid">
                <Field label="菜名"><input value={metaName} onChange={(event) => setMetaName(event.target.value)} /></Field>
                <Field label="菜单角色">
                  <select
                    value={metaRole}
                    onChange={(event) => {
                      const role = event.target.value as typeof metaRole;
                      setMetaRole(role);
                      if (role === "veg" || role === "other") setMetaProtein("none");
                      if (role === "meat" && (metaProtein === "none" || metaProtein === "other")) setMetaProtein("pork");
                    }}
                  >
                    <option value="meat">荤菜</option>
                    <option value="veg">素菜</option>
                    <option value="soup">汤</option>
                    <option value="other">非推荐池</option>
                  </select>
                </Field>
                <Field label="主蛋白质">
                  <select value={metaProtein} onChange={(event) => setMetaProtein(event.target.value as Protein)} disabled={metaRole === "veg" || metaRole === "other"}>
                    {Object.entries(PROTEIN_LABELS)
                      .filter(([key]) => key !== "other")
                      .filter(([key]) => metaRole === "meat" ? key !== "none" : true)
                      .map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                  </select>
                </Field>
                <Field label="辣度">
                  <select value={metaSpice} onChange={(event) => setMetaSpice(Number(event.target.value) as 0 | 1 | 2)}>
                    <option value={0}>不辣</option><option value={1}>微辣</option><option value={2}>辣</option>
                  </select>
                </Field>
                <Field label="口味">
                  <select value={metaFlavor} onChange={(event) => setMetaFlavor(event.target.value as typeof metaFlavor)}>
                    <option value="light">清淡</option><option value="normal">适中</option><option value="rich">重口</option>
                  </select>
                </Field>
              </div>
              <div className="detail-actions">
                <button className="btn btn-ghost compact" onClick={() => setEditingMeta(false)} disabled={metaBusy}>取消</button>
                <button className="btn btn-primary compact" onClick={() => void saveMeta()} disabled={metaBusy || !metaName.trim()}>
                  {metaBusy ? <Spinner /> : "保存菜品信息"}
                </button>
              </div>
            </section>
          ) : null}

          <section className="detail-section">
            <div className="section-head compact-head"><h3>食材表</h3><span>{recipe.length} 样</span></div>
            {loading ? <LoadingBlock label="正在读菜谱…" /> : (
              <>
                <div className="tag-wrap editable-tags">
                  {recipe.map((ingredient) => (
                    <button key={ingredient.id || ingredient.name} className="tag removable" onClick={() => onRemoveIngredient(ingredient.id, ingredient.name)}>
                      {ingredient.name}<span>×</span>
                    </button>
                  ))}
                  {recipe.length === 0 ? <p className="muted-copy">还没有食材，补一项就能开始。</p> : null}
                </div>
                <div className="inline-add">
                  <input value={newIngredient} onChange={(event) => onNewIngredientChange(event.target.value)} placeholder="新增食材，例如：牛里脊" aria-label="新增食材" />
                  <select value={newCategory} onChange={(event) => onNewCategoryChange(event.target.value as IngredientCategory)} aria-label="食材分类">
                    <option value="meat">肉禽蛋</option>
                    <option value="vegetable">蔬菜</option>
                    <option value="soy">豆制品</option>
                    <option value="seasoning">调料</option>
                    <option value="staple">主食</option>
                    <option value="other">其他</option>
                  </select>
                  <button className="icon-btn" onClick={onAddIngredient} aria-label="添加食材"><Plus size={17} /></button>
                </div>
                <div className="detail-actions">
                  {detail.dataStatus === "draft" ? (
                    <button className="btn btn-ghost compact" onClick={onSuggest} disabled={busy}><Sparkles size={15} /> AI 补全草稿</button>
                  ) : null}
                  <button className="btn btn-primary compact" onClick={onSaveRecipe} disabled={busy || (!dirty && detail.dataStatus !== "draft")}>
                    {busy ? <Spinner /> : dirty || detail.dataStatus === "draft" ? "保存并标为可推荐" : "已保存"}
                  </button>
                </div>
                <p className="tiny-note">内置菜的食材校正保存在家庭空间；采购清单会按这里的食材 ID 生成。</p>
              </>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function CreateDishModal({
  open,
  onClose,
  onCreated,
  api,
  toast
}: {
  open: boolean;
  ingredients: Ingredient[];
  onClose: () => void;
  onCreated: () => Promise<void>;
  api: ReturnType<typeof useApp>["api"];
  toast: ReturnType<typeof useApp>["toast"];
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"meat" | "veg" | "soup" | "other">("meat");
  const [protein, setProtein] = useState<Protein>("pork");
  const [spiceLevel, setSpiceLevel] = useState<0 | 1 | 2>(1);
  const [flavor, setFlavor] = useState<"light" | "normal" | "rich">("normal");
  const [items, setItems] = useState<NewIngredient[]>([{ name: "", category: "vegetable" }]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast("先写一个菜名", "error");
      return;
    }
    setBusy(true);
    try {
      await api("/api/dishes", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          role,
          protein: role === "meat" || role === "soup" ? protein : "none",
          spiceLevel,
          flavor,
          autoPlannable: role !== "other",
          ingredients: items.filter((item) => item.name.trim())
        })
      });
      setName("");
      setRole("meat");
      setProtein("pork");
      setSpiceLevel(1);
      setFlavor("normal");
      setItems([{ name: "", category: "vegetable" }]);
      await onCreated();
    } catch (error) {
      toast(error instanceof Error ? error.message : "新增失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="加一道家里常吃的菜"
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>先不加</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? <Spinner /> : "放进菜库"}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="菜名"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：青椒炒肉" /></Field>
        <Field label="菜单角色">
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="meat">荤菜</option>
            <option value="veg">素菜</option>
            <option value="soup">汤</option>
            <option value="other">非推荐池</option>
          </select>
        </Field>
        {role === "meat" || role === "soup" ? (
          <Field label="主蛋白质">
            <select value={protein} onChange={(event) => setProtein(event.target.value as Protein)}>
              {Object.entries(PROTEIN_LABELS).filter(([key]) => key !== "none").map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="辣度">
          <select value={spiceLevel} onChange={(event) => setSpiceLevel(Number(event.target.value) as 0 | 1 | 2)}>
            <option value={0}>不辣</option><option value={1}>微辣</option><option value={2}>辣</option>
          </select>
        </Field>
        <Field label="口味">
          <select value={flavor} onChange={(event) => setFlavor(event.target.value as typeof flavor)}>
            <option value="light">清淡</option><option value="normal">适中</option><option value="rich">重口</option>
          </select>
        </Field>
      </div>
      <div className="detail-section">
        <div className="section-head compact-head"><h3>食材</h3><span>有食材才会进入推荐</span></div>
        {items.map((item, index) => (
          <div className="inline-add" key={index}>
            <input
              value={item.name}
              onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))}
              placeholder="食材名"
              aria-label="食材名"
            />
            <select
              value={item.category}
              onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, category: event.target.value as IngredientCategory } : row))}
              aria-label="食材分类"
            >
              <option value="meat">肉禽蛋</option><option value="vegetable">蔬菜</option><option value="soy">豆制品</option>
              <option value="seasoning">调料</option><option value="staple">主食</option><option value="other">其他</option>
            </select>
            <button className="icon-btn" aria-label="移除食材" onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="text-link" onClick={() => setItems((current) => [...current, { name: "", category: "vegetable" }])}><Plus size={14} /> 再加一项</button>
      </div>
    </Modal>
  );
}
