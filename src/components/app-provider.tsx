"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { AppInfo } from "@/lib/client-types";
import { ClientApiError, type ApiErrorPayload } from "@/lib/client-types";

type ToastKind = "default" | "success" | "error";

interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

interface AppContextValue {
  info: AppInfo | null;
  loading: boolean;
  loadError: string | null;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  refreshApp: () => Promise<AppInfo | null>;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  toast: (message: string, kind?: ToastKind) => void;
  toastState: ToastState | null;
}

const AppContext = createContext<AppContextValue | null>(null);

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDateState] = useState("");
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const infoRef = useRef<AppInfo | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyInfo = useCallback((next: AppInfo | null) => {
    infoRef.current = next;
    setInfo(next);
  }, []);

  const loadApp = useCallback(async () => {
    try {
      setLoadError(null);
      const response = await fetch("/api/app", { cache: "no-store" });
      const body = (await readJson(response)) as AppInfo | ApiErrorPayload | null;
      if (!response.ok || !body || "error" in body) {
        throw new Error(body && "error" in body ? body.error.message : "应用初始化失败");
      }
      applyInfo(body);
      return body;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "应用初始化失败");
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyInfo]);

  useEffect(() => {
    void loadApp();
  }, [loadApp]);

  useEffect(() => {
    if (info && !selectedDate) setSelectedDateState(info.tomorrow);
  }, [info, selectedDate]);

  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date);
  }, []);

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const token = infoRef.current?.csrfToken;
    if (token) headers.set("x-csrf-token", token);
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    const body = await readJson(response);
    if (!response.ok) {
      if (body && typeof body === "object" && "error" in body) {
        const payload = body as ApiErrorPayload;
        throw new ClientApiError({
          status: response.status,
          code: payload.error.code,
          message: payload.error.message,
          action: payload.error.action,
          details: payload.error.details
        });
      }
      throw new ClientApiError({
        status: response.status,
        code: "REQUEST_FAILED",
        message: "请求失败，请稍后重试。"
      });
    }
    return body as T;
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "default") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState({ id: Date.now(), message, kind });
    toastTimer.current = setTimeout(() => setToastState(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      info,
      loading,
      loadError,
      selectedDate,
      setSelectedDate,
      refreshApp: loadApp,
      api,
      toast,
      toastState
    }),
    [info, loading, loadError, selectedDate, setSelectedDate, loadApp, api, toast, toastState]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
