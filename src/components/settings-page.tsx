"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Cloud,
  Download,
  HardDrive,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldAlert,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import type { Ingredient, IngredientCategory, Settings } from "@/domain/types";
import { CATEGORY_LABELS } from "@/domain/labels";
import { useApp } from "./app-provider";
import { Field, LoadingBlock, Modal, PageHeader, Segmented, Spinner, StatusPill } from "./ui";

interface SettingsResponse {
  family: {
    name: string;
    timezone: string;
    profile: { adults: number; children: number; childAge: number | null; spiceTolerance: string };
  };
  settings: Settings;
  counts: { total: number; ready: number; draft: number; autoPlannable: number };
  ai: { configured: boolean; model: string | null; maxDailyCalls: number; maxCallsPerIpPerDay: number };
}

export function SettingsPage() {
  const { info, api, toast, refreshApp } = useApp();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [profile, setProfile] = useState({ familyName: "", adults: 3, children: 1, childAge: 8, spiceTolerance: "微辣" });
  const [repeatDays, setRepeatDays] = useState(7);
  const [maxSpicy, setMaxSpicy] = useState<0 | 1 | 2>(1);
  const [thirdDefault, setThirdDefault] = useState<"veg" | "soup">("veg");
  const [pantryIds, setPantryIds] = useState<string[]>([]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingIngredients, setLoadingIngredients] = useState(true);
  const [importBackup, setImportBackup] = useState<unknown | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!info) return;
    setProfile({
      familyName: info.family.name,
      adults: info.family.profile.adults,
      children: info.family.profile.children,
      childAge: info.family.profile.childAge ?? 0,
      spiceTolerance: info.family.profile.spiceTolerance
    });
    setRepeatDays(info.settings.repeatDays);
    setMaxSpicy(info.settings.maxSpicyDishes);
    setThirdDefault(info.settings.thirdDishDefault);
    setPantryIds(info.settings.pantryIngredientIds);
    setBlockedIds(info.settings.blockedIngredientIds);
  }, [info]);

  useEffect(() => {
    void api<{ ingredients: Ingredient[] }>("/api/ingredients")
      .then((result) => setIngredients(result.ingredients))
      .catch((error) => toast(error instanceof Error ? error.message : "食材库加载失败", "error"))
      .finally(() => setLoadingIngredients(false));
  }, [api, toast]);

  const ingredientMap = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
  const availablePantry = ingredients.filter((ingredient) => !pantryIds.includes(ingredient.id));
  const availableBlocked = ingredients.filter((ingredient) => !blockedIds.includes(ingredient.id));

  async function saveSection(section: string, payload: Record<string, unknown>) {
    setSaving(section);
    try {
      await api<SettingsResponse>("/api/settings", { method: "PATCH", body: JSON.stringify(payload) });
      await refreshApp();
      toast("设置已保存，后续推荐会立即使用", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSaving(null);
    }
  }

  function saveProfile() {
    void saveSection("profile", {
      family: {
        name: profile.familyName,
        profile: {
          adults: profile.adults,
          children: profile.children,
          childAge: Number(profile.childAge) || null,
          spiceTolerance: profile.spiceTolerance
        }
      }
    });
  }

  function saveRules() {
    void saveSection("rules", {
      repeatDays,
      maxSpicyDishes: maxSpicy,
      thirdDishDefault: thirdDefault
    });
  }

  async function exportData() {
    try {
      const response = await fetch("/api/export", { cache: "no-store" });
      if (!response.ok) throw new Error("导出失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mingri-menu-${info?.today ?? "backup"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast("家庭数据已导出，不含任何 AI Key", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "导出失败", "error");
    }
  }

  async function chooseImportFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !("schemaVersion" in parsed)) throw new Error("这不是有效的家庭备份文件");
      setImportBackup(parsed);
      setImportOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "无法读取备份", "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!importBackup) return;
    setImportBusy(true);
    try {
      await api("/api/import", {
        method: "POST",
        body: JSON.stringify({ backup: importBackup, confirm: true })
      });
      setImportOpen(false);
      setImportBackup(null);
      await refreshApp();
      toast("家庭数据已恢复", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "导入失败", "error");
    } finally {
      setImportBusy(false);
    }
  }

  if (!info) return null;

  return (
    <div className="page settings-page">
      <PageHeader mark="家" title="我的家庭" subtitle="单家庭空间 · 无登录共享访问" />

      <section className="profile-card">
        <span className="eyebrow">Family table</span>
        <h2>{info.family.name}</h2>
        <p>{info.family.profile.adults} 位大人 · {info.family.profile.children} 位孩子 · 晚餐默认两道荤菜加一道素/汤</p>
        <div className="profile-meta">
          <span>{info.family.profile.spiceTolerance}上限 {info.settings.maxSpicyDishes} 道</span>
          <span>{info.settings.repeatDays} 天不重复</span>
          <span>第三道默认{info.settings.thirdDishDefault === "veg" ? "素菜" : "汤"}</span>
        </div>
      </section>

      <section className="setting-group">
        <div className="group-head"><h3><UsersRound size={16} /> 家庭资料</h3><span>只影响推荐语气与人数</span></div>
        <div className="form-grid">
          <Field label="家庭空间名称"><input value={profile.familyName} onChange={(event) => setProfile({ ...profile, familyName: event.target.value })} /></Field>
          <Field label="辣度接受度"><input value={profile.spiceTolerance} onChange={(event) => setProfile({ ...profile, spiceTolerance: event.target.value })} placeholder="例如：微辣" /></Field>
          <Field label="大人人数"><input type="number" min={1} value={profile.adults} onChange={(event) => setProfile({ ...profile, adults: Number(event.target.value) })} /></Field>
          <Field label="孩子人数"><input type="number" min={0} value={profile.children} onChange={(event) => setProfile({ ...profile, children: Number(event.target.value) })} /></Field>
          <Field label="孩子年龄"><input type="number" min={0} max={18} value={profile.childAge} onChange={(event) => setProfile({ ...profile, childAge: Number(event.target.value) })} /></Field>
        </div>
        <button className="btn btn-ghost compact group-save" onClick={saveProfile} disabled={saving === "profile"}>
          {saving === "profile" ? <Spinner /> : <Check size={15} />} 保存家庭资料
        </button>
      </section>

      <section className="setting-group">
        <div className="group-head"><h3><Bot size={16} /> AI 安排</h3><span>服务端配置</span></div>
        <div className={`ai-state ${info.ai.configured ? "" : "offline"}`}>
          <i /> {info.ai.configured ? `已连接 · ${info.ai.model}` : "未配置 · 当前使用本地规则"}
        </div>
        <div className="setting-row"><span>每次读取最近 7 天晚餐<small>还需结合未来已安排菜单去重</small></span><StatusPill tone="sage">已启用</StatusPill></div>
        <div className="setting-row"><span>AI 失败时本地兜底<small>仍能生成合法的两荤一素/汤</small></span><StatusPill tone="sage">已启用</StatusPill></div>
        <div className="setting-row"><span>今日 AI 生成次数<small>全局上限 {info.ai.maxDailyCalls} 次 · 单设备 {info.ai.maxCallsPerIpPerDay} 次</small></span><b>{info.ai.callsToday} / {info.ai.maxDailyCalls}</b></div>
        <div className="setting-row"><span><KeyRound size={14} /> API Key 与模型<small>只由部署环境变量提供，浏览器永远不接触</small></span><StatusPill tone="muted">服务端</StatusPill></div>
      </section>

      <section className="setting-group">
        <div className="group-head"><h3><RotateCcw size={16} /> 家庭规则</h3><span>硬规则会由服务端校验</span></div>
        <Field label="重复天数" hint="与目标日期相差在这个范围内的已确认菜单，不能重复选菜">
          <Segmented value={repeatDays} options={[3, 5, 7, 10].map((value) => ({ value, label: `${value} 天` }))} onChange={setRepeatDays} ariaLabel="重复天数" />
        </Field>
        <Field label="每餐最多辣菜" hint="汤也计入辣菜数量">
          <Segmented value={maxSpicy} options={[{ value: 0, label: "不吃辣" }, { value: 1, label: "1 道" }, { value: 2, label: "2 道" }]} onChange={(value) => setMaxSpicy(value as 0 | 1 | 2)} ariaLabel="每餐最多辣菜" />
        </Field>
        <Field label="第三道默认" hint="汤算一个菜位，不再额外加第 4 道">
          <Segmented value={thirdDefault} options={[{ value: "veg", label: "素菜" }, { value: "soup", label: "汤" }]} onChange={(value) => setThirdDefault(value as "veg" | "soup")} ariaLabel="第三道默认" />
        </Field>
        <button className="btn btn-ghost compact group-save" onClick={saveRules} disabled={saving === "rules"}>
          {saving === "rules" ? <Spinner /> : <Check size={15} />} 保存家庭规则
        </button>
      </section>

      {loadingIngredients ? <LoadingBlock label="正在读食材库…" /> : (
        <>
          <IngredientEditor
            title="家里常备食材"
            hint="清单会自动排除这些食材；可以随时覆盖默认值。"
            icon={<HardDrive size={16} />}
            selectedIds={pantryIds}
            available={availablePantry}
            ingredientMap={ingredientMap}
            onAdd={(id) => setPantryIds((current) => [...current, id])}
            onRemove={(id) => setPantryIds((current) => current.filter((item) => item !== id))}
            onRestore={() => setPantryIds(ingredients.filter((item) => item.defaultPantry).map((item) => item.id))}
            onSave={() => void saveSection("pantry", { pantryIngredientIds: pantryIds })}
            saving={saving === "pantry"}
          />
          <IngredientEditor
            title="忌口与过敏"
            hint="包含这些食材的菜不会进入 AI 候选池，也不能手动选。"
            icon={<ShieldAlert size={16} />}
            selectedIds={blockedIds}
            available={availableBlocked}
            ingredientMap={ingredientMap}
            onAdd={(id) => setBlockedIds((current) => [...current, id])}
            onRemove={(id) => setBlockedIds((current) => current.filter((item) => item !== id))}
            onSave={() => void saveSection("blocked", { blockedIngredientIds: blockedIds })}
            saving={saving === "blocked"}
            tone="danger"
          />
        </>
      )}

      <section className="setting-group">
        <div className="group-head"><h3><Cloud size={16} /> 云端与访问</h3><span>单家庭实例</span></div>
        <div className="setting-row"><span>云端同步<small>菜单、菜库、菜谱和设置自动保存</small></span><StatusPill tone="sage">正常</StatusPill></div>
        <div className="setting-row"><span>数据量<small>菜库 {info.counts.total} 道 · 可推荐 {info.counts.autoPlannable} 道 · 待完善 {info.counts.draft} 道</small></span><Link className="text-link quiet" href="/library">查看菜库</Link></div>
        <div className="access-note">
          <LockKeyhole size={18} />
          <p>当前为无登录链接访问。任何拿到链接的人都可以查看和修改，请勿公开发送。页面与接口已设置 noindex，但这不等于访问控制。</p>
        </div>
      </section>

      <section className="setting-group">
        <div className="group-head"><h3><Download size={16} /> 数据备份</h3><span>不含 API Key</span></div>
        <div className="setting-row"><span>导出家庭数据<small>包含设置、自定义菜、菜谱和全部菜单</small></span><button className="btn btn-ghost compact" onClick={() => void exportData()}><Download size={15} /> JSON</button></div>
        <div className="setting-row"><span>从备份恢复<small>会覆盖当前菜单与自定义数据，需要二次确认</small></span><button className="btn btn-ghost compact" onClick={() => fileRef.current?.click()}><Upload size={15} /> 导入</button></div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void chooseImportFile(file);
          }}
        />
      </section>

      <p className="version-note">明日菜单 v{info.appVersion} · {info.family.timezone} · 家庭数据保存在云端</p>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="覆盖当前家庭数据？"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setImportOpen(false)} disabled={importBusy}>取消</button>
            <button className="btn btn-danger" onClick={() => void confirmImport()} disabled={importBusy}>
              {importBusy ? <><LoaderCircle className="spin" size={16} /> 正在恢复…</> : "确认覆盖"}
            </button>
          </>
        }
      >
        <p className="modal-lead">导入会替换当前设置、自定义菜、家庭菜谱和全部菜单。内置菜库不会丢失。操作前建议先导出一份当前数据。</p>
      </Modal>
    </div>
  );
}

function IngredientEditor({
  title,
  hint,
  icon,
  selectedIds,
  available,
  ingredientMap,
  onAdd,
  onRemove,
  onRestore,
  onSave,
  saving,
  tone = "normal"
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  selectedIds: string[];
  available: Ingredient[];
  ingredientMap: Map<string, Ingredient>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onRestore?: () => void;
  onSave: () => void;
  saving: boolean;
  tone?: "normal" | "danger";
}) {
  const [pick, setPick] = useState("");
  return (
    <section className={`setting-group ingredient-editor ${tone}`}>
      <div className="group-head"><h3>{icon} {title}</h3>{onRestore ? <button className="text-link quiet" onClick={onRestore}><RotateCcw size={13} /> 恢复默认</button> : <span>{selectedIds.length} 项</span>}</div>
      <p className="setting-hint">{hint}</p>
      <div className="tag-wrap selected-ingredients">
        {selectedIds.map((id) => {
          const ingredient = ingredientMap.get(id);
          if (!ingredient) return null;
          return (
            <button className="tag removable" key={id} onClick={() => onRemove(id)} title={CATEGORY_LABELS[ingredient.category]}>
              {ingredient.name}<X size={11} />
            </button>
          );
        })}
        {selectedIds.length === 0 ? <span className="muted-copy">暂未设置</span> : null}
      </div>
      <div className="inline-add">
        <select value={pick} onChange={(event) => setPick(event.target.value)} aria-label={`添加${title}`}>
          <option value="">选择食材</option>
          {available.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} · {CATEGORY_LABELS[ingredient.category]}</option>)}
        </select>
        <button className="icon-btn" aria-label="添加" onClick={() => { if (pick) { onAdd(pick); setPick(""); } }} disabled={!pick}><Plus size={16} /></button>
      </div>
      <button className="btn btn-ghost compact group-save" onClick={onSave} disabled={saving}>
        {saving ? <Spinner /> : <Check size={15} />} 保存{title}
      </button>
    </section>
  );
}
