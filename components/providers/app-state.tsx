"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/auth/browser";
import type { AppConfig } from "@/lib/client/app-config";
import { sendEvent } from "@/lib/client/events";
import { ApiWishClient, MemoryWishClient, type WishClient } from "@/lib/client/wish-client";
import { LIMITS } from "@/lib/schemas/limits";
import type { Offer, SourceId } from "@/lib/schemas/offer";
import type { AiUsage, ChatTurn, SearchEvent } from "@/lib/schemas/search-api";
import type { SourceRunOutcome } from "@/lib/schemas/source";
import { conditionsEqual, emptyConditions, type PurchaseWish, type WishConditions } from "@/lib/schemas/wish";
import { readSseStream } from "@/lib/sse";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind: "message" | "clarification" | "note" | "error";
  questions?: string[];
};

export type SourceResult = {
  sourceId: SourceId;
  label: string;
  demo: boolean;
  offers: Offer[];
  excluded: Offer[];
  notices: string[];
  affiliate: boolean;
  outcome: SourceRunOutcome | null;
  message: string;
};

export type SearchState = {
  status: "idle" | "running" | "done" | "aborted" | "failed";
  stageMessage: string;
  sources: Partial<Record<SourceId, SourceResult>>;
  error: { code: string; message: string } | null;
  aiUsed: AiUsage | null;
  keywords: string | null;
  completedAt: string | null;
};

/** 保存済み希望との対応。conditions は保存時点の条件（未保存の変更検出に使う）。 */
export type SavedRef = {
  wishId: string;
  version: number;
  title: string;
  conditions: WishConditions;
  contextToken: string | null;
};

export type OutboundState = { sourceId: SourceId; wishId: string | null; version: number | null; at: number };

type AppState = {
  config: AppConfig;
  wishClient: WishClient;
  // 認証
  authReady: boolean;
  userEmail: string | null;
  signedIn: boolean;
  signInDemo: () => void;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  // 下書き
  draft: WishConditions;
  setDraft: (c: WishConditions) => void;
  savedRef: SavedRef | null;
  setSavedRef: (r: SavedRef | null) => void;
  isDirty: boolean;
  // 会話・検索
  chat: ChatEntry[];
  search: SearchState;
  runSearch: (message: string | null) => Promise<void>;
  cancelSearch: () => void;
  resetSession: () => void;
  pendingMessage: string | null;
  setPendingMessage: (m: string | null) => void;
  autoSearch: boolean;
  setAutoSearch: (v: boolean) => void;
  pendingSaveAfterLogin: boolean;
  setPendingSaveAfterLogin: (v: boolean) => void;
  startFromWish: (wish: PurchaseWish, contextToken: string | null) => void;
  // 外部遷移と結果報告
  outbound: OutboundState | null;
  markOutbound: (sourceId: SourceId) => void;
  clearOutbound: () => void;
};

const Ctx = createContext<AppState | null>(null);

const initialSearch: SearchState = {
  status: "idle",
  stageMessage: "",
  sources: {},
  error: null,
  aiUsed: null,
  keywords: null,
  completedAt: null,
};

function newId() {
  return crypto.randomUUID();
}

export function AppStateProvider({ config, children }: { config: AppConfig; children: React.ReactNode }) {
  const [wishClient] = useState<WishClient>(() => (config.mode === "demo" ? new MemoryWishClient() : new ApiWishClient()));
  const [draft, setDraft] = useState<WishConditions>(() => emptyConditions(config.category.id));
  const [savedRef, setSavedRef] = useState<SavedRef | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [search, setSearch] = useState<SearchState>(initialSearch);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [autoSearch, setAutoSearch] = useState(false);
  const [pendingSaveAfterLogin, setPendingSaveAfterLogin] = useState(false);
  const [outbound, setOutbound] = useState<OutboundState | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(config.mode === "demo" || !config.authEnabled);

  const activeRequest = useRef<{ id: string; controller: AbortController } | null>(null);
  const chatRef = useRef<ChatEntry[]>([]);
  const draftRef = useRef(draft);
  const savedRefRef = useRef(savedRef);
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    savedRefRef.current = savedRef;
  }, [savedRef]);

  // --- 認証（live のみ）
  const refreshAuth = useCallback(async () => {
    if (config.mode === "demo") return;
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    const { data } = await supabase.auth.getUser();
    setUser(data.user ?? null);
    setAuthReady(true);
  }, [config.mode]);

  useEffect(() => {
    if (config.mode === "demo") return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [config.mode]);

  const signOut = useCallback(async () => {
    if (config.mode === "demo") {
      setDemoSignedIn(false);
      return;
    }
    await getBrowserSupabase()?.auth.signOut();
    setUser(null);
    setSavedRef(null);
  }, [config.mode]);

  const pushChat = useCallback((entry: Omit<ChatEntry, "id">) => {
    setChat((prev) => [...prev, { ...entry, id: newId() }]);
  }, []);

  const cancelSearch = useCallback(() => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    setSearch((s) => (s.status === "running" ? { ...s, status: "aborted", stageMessage: "検索を中止しました。" } : s));
  }, []);

  const runSearch = useCallback(
    async (message: string | null) => {
      // 古い応答が新しい条件を上書きしないよう、前の検索を中止して識別子で区別する。
      activeRequest.current?.controller.abort();
      const clientRequestId = newId();
      const controller = new AbortController();
      activeRequest.current = { id: clientRequestId, controller };
      const isCurrent = () => activeRequest.current?.id === clientRequestId;

      const trimmed = message?.trim() ? message.trim().slice(0, LIMITS.messageMaxChars) : null;
      const history: ChatTurn[] = chatRef.current
        .filter((e) => e.kind === "message" || e.kind === "clarification")
        .map((e) => ({ role: e.role, text: (e.questions ? `${e.text}\n${e.questions.join("\n")}` : e.text).slice(0, LIMITS.historyTurnMaxChars) }))
        .slice(-LIMITS.historyMaxTurns * 2);
      if (trimmed) pushChat({ role: "user", text: trimmed, kind: "message" });

      setSearch({ ...initialSearch, status: "running", stageMessage: "検索を開始しています" });
      sendEvent("search_started");

      let res: Response;
      try {
        res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientRequestId,
            message: trimmed,
            history,
            conditions: draftRef.current,
            contextToken: savedRefRef.current?.contextToken ?? null,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
      } catch {
        if (!isCurrent()) return;
        setSearch((s) => ({ ...s, status: "failed", error: { code: "network", message: "通信に失敗しました。接続を確認してください。" } }));
        return;
      }

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        if (!isCurrent()) return;
        const err = { code: body?.error?.code ?? "error", message: body?.error?.message ?? "検索できませんでした。" };
        if (err.code === "invalid_context") setSavedRef((r) => (r ? { ...r, contextToken: null } : r));
        setSearch((s) => ({ ...s, status: "failed", error: err }));
        pushChat({ role: "assistant", text: err.message, kind: "error" });
        return;
      }

      let finished = false;
      try {
        for await (const event of readSseStream(res.body)) {
          if (!isCurrent()) return;
          finished = handleEvent(event) || finished;
        }
      } catch {
        // 中断・切断
      }
      if (!isCurrent()) return;
      activeRequest.current = null;
      if (!finished) {
        setSearch((s) => ({ ...s, status: "aborted", stageMessage: "検索が中断されました。表示中の候補は途中までの結果です。" }));
      }

      function handleEvent(event: SearchEvent): boolean {
        switch (event.type) {
          case "status":
            setSearch((s) => ({ ...s, stageMessage: event.message }));
            return false;
          case "intent":
            if (event.aiUsed !== "none") setDraft({ ...event.conditions, title: draftRef.current.title });
            setSearch((s) => ({ ...s, aiUsed: event.aiUsed, keywords: event.keywords }));
            if (event.reply) pushChat({ role: "assistant", text: event.reply, kind: "message" });
            for (const note of event.notes) pushChat({ role: "assistant", text: note, kind: "note" });
            return false;
          case "clarification":
            pushChat({ role: "assistant", text: event.message, kind: "clarification", questions: event.questions });
            return false;
          case "offers":
            setSearch((s) => ({
              ...s,
              sources: {
                ...s.sources,
                [event.sourceId]: {
                  sourceId: event.sourceId,
                  label: event.label,
                  demo: event.demo,
                  offers: event.offers,
                  excluded: event.excluded,
                  notices: event.notices,
                  affiliate: event.affiliate,
                  outcome: s.sources[event.sourceId]?.outcome ?? null,
                  message: s.sources[event.sourceId]?.message ?? "",
                },
              },
            }));
            return false;
          case "source_status":
            setSearch((s) => {
              const prev = s.sources[event.sourceId];
              return {
                ...s,
                sources: {
                  ...s.sources,
                  [event.sourceId]: {
                    sourceId: event.sourceId,
                    label: event.label,
                    demo: event.demo,
                    offers: prev?.offers ?? [],
                    excluded: prev?.excluded ?? [],
                    notices: prev?.notices ?? [],
                    affiliate: prev?.affiliate ?? false,
                    outcome: event.outcome,
                    message: event.message,
                  },
                },
              };
            });
            return false;
          case "error":
            setSearch((s) => ({ ...s, error: { code: event.code, message: event.message } }));
            pushChat({ role: "assistant", text: event.message, kind: "error" });
            return false;
          case "done":
            setSearch((s) => ({
              ...s,
              status: "done",
              stageMessage: event.searched ? "検索が完了しました。" : "",
              completedAt: new Date().toISOString(),
            }));
            return true;
        }
      }
    },
    [pushChat],
  );

  const resetSession = useCallback(() => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    setDraft(emptyConditions(config.category.id));
    setSavedRef(null);
    setChat([]);
    setSearch(initialSearch);
  }, [config.category.id]);

  const startFromWish = useCallback((wish: PurchaseWish, contextToken: string | null) => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    const conditions: WishConditions = {
      title: wish.title,
      categoryId: wish.categoryId,
      productType: wish.productType,
      purpose: wish.purpose,
      budgetJpy: wish.budgetJpy,
      budgetScope: wish.budgetScope,
      quantity: wish.quantity,
      condition: wish.condition,
      required: wish.required,
      preferences: wish.preferences,
      wantedBy: wish.wantedBy,
    };
    setDraft(conditions);
    draftRef.current = conditions;
    const ref = { wishId: wish.id, version: wish.version, title: wish.title, conditions, contextToken };
    setSavedRef(ref);
    savedRefRef.current = ref;
    setChat([]);
    chatRef.current = [];
    setSearch(initialSearch);
  }, []);

  const markOutbound = useCallback((sourceId: SourceId) => {
    const ref = savedRefRef.current;
    setOutbound({ sourceId, wishId: ref?.wishId ?? null, version: ref?.version ?? null, at: Date.now() });
    sendEvent("outbound_click", sourceId);
  }, []);

  const value = useMemo<AppState>(() => {
    const signedIn = config.mode === "demo" ? demoSignedIn : Boolean(user);
    return {
      config,
      wishClient,
      authReady,
      userEmail: config.mode === "demo" ? (demoSignedIn ? "デモ利用者" : null) : (user?.email ?? null),
      signedIn,
      signInDemo: () => setDemoSignedIn(true),
      signOut,
      refreshAuth,
      draft,
      setDraft,
      savedRef,
      setSavedRef,
      isDirty: savedRef ? !conditionsEqual(savedRef.conditions, draft) : false,
      chat,
      search,
      runSearch,
      cancelSearch,
      resetSession,
      pendingMessage,
      setPendingMessage,
      autoSearch,
      setAutoSearch,
      pendingSaveAfterLogin,
      setPendingSaveAfterLogin,
      startFromWish,
      outbound,
      markOutbound,
      clearOutbound: () => setOutbound(null),
    };
  }, [
    config,
    wishClient,
    authReady,
    demoSignedIn,
    user,
    signOut,
    refreshAuth,
    draft,
    savedRef,
    chat,
    search,
    runSearch,
    cancelSearch,
    resetSession,
    pendingMessage,
    autoSearch,
    pendingSaveAfterLogin,
    startFromWish,
    outbound,
    markOutbound,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider がありません");
  return v;
}
