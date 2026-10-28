"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";
import type { Dish, DishRole, Flavor, Protein, SpiceLevel } from "@/domain/types";
import { FLAVOR_LABELS, PROTEIN_LABELS, ROLE_LABELS, SPICE_LABELS } from "@/domain/labels";

export function PageHeader({
  mark = "明",
  title,
  subtitle,
  action
}: {
  mark?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">{mark}</div>
        <div>
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

export function LoadingBlock({ label = "正在准备…" }: { label?: string }) {
  return (
    <div className="loading-block">
      <LoaderCircle className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  eyebrow,
  title,
  body,
  action
}: {
  eyebrow?: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    closeButton.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={`sheet-layer ${open ? "open" : ""}`} aria-hidden={!open}>
      <button className="sheet-backdrop" aria-label="关闭" onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button ref={closeButton} className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </aside>
    </div>,
    document.body
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-layer">
      <button className="modal-backdrop" aria-label="关闭" onClick={onClose} />
      <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  );
}

export function DishSeal({ dish, size = "normal" }: { dish: Pick<Dish, "role" | "protein" | "name">; size?: "normal" | "small" }) {
  const char = dishChar(dish);
  const tone = dishTone(dish);
  return (
    <div className={`dish-art ${size} tone-${tone}`} aria-hidden="true">
      {char}
    </div>
  );
}

function dishChar(dish: Pick<Dish, "role" | "protein" | "name">): string {
  if (dish.role === "soup") return "汤";
  if (dish.role === "veg") return "蔬";
  const proteinChars: Partial<Record<Protein, string>> = {
    pork: "猪",
    beef: "牛",
    chicken: "鸡",
    duck: "鸭",
    lamb: "羊",
    rabbit: "兔",
    fish: "鱼",
    shrimp: "虾",
    frog: "蛙",
    squid: "鱿",
    crab: "蟹",
    crayfish: "虾",
    egg: "蛋"
  };
  return proteinChars[dish.protein] ?? dish.name.slice(0, 1);
}

function dishTone(dish: Pick<Dish, "role" | "protein">): string {
  if (dish.role === "soup") return "soup";
  if (dish.role === "veg") return "veg";
  if (dish.protein === "fish" || dish.protein === "shrimp" || dish.protein === "crab" || dish.protein === "squid") return "fish";
  if (dish.protein === "beef" || dish.protein === "lamb") return "beef";
  if (dish.protein === "chicken" || dish.protein === "duck" || dish.protein === "egg") return "gold";
  return "pork";
}

export function DishTags({
  role,
  protein,
  spiceLevel,
  flavor,
  compact = false
}: {
  role: DishRole;
  protein: Protein;
  spiceLevel: SpiceLevel;
  flavor: Flavor;
  compact?: boolean;
}) {
  return (
    <div className={`tags ${compact ? "compact" : ""}`}>
      <span className="tag">{ROLE_LABELS[role]}</span>
      {role === "meat" ? <span className="tag">{PROTEIN_LABELS[protein]}</span> : null}
      <span className={`tag ${spiceLevel > 0 ? "hot" : ""}`}>{SPICE_LABELS[spiceLevel]}</span>
      <span className={`tag ${flavor === "light" ? "good" : flavor === "rich" ? "rich" : ""}`}>{FLAVOR_LABELS[flavor]}</span>
    </div>
  );
}

export function StatusPill({ children, tone = "sage" }: { children: ReactNode; tone?: "sage" | "gold" | "muted" | "red" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle className="spin" size={size} />;
}
