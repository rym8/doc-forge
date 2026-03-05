import { create } from "zustand";
import type { Session, Message, Snapshot } from "./types";

interface DocForgeStore {
  sessions: Session[];
  currentSessionId: string | null;
  documentContent: string;
  messages: Message[];
  snapshots: Snapshot[];
  globalError: string | null;

  loadSessions(): Promise<void>;
  selectSession(id: string): Promise<void>;
  createSession(title: string): Promise<void>;
  updateSessionTitle(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  updateDocument(content: string): Promise<void>;
  setDocumentContent(content: string): void;
  clearError(): void;
  addMessage(role: "user" | "assistant", content: string): Promise<Message>;
  loadSnapshots(): Promise<void>;
  undo(): Promise<void>;
  restoreSnapshot(snapshotId: string): Promise<void>;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "予期しないエラーが発生しました";
}

export const useStore = create<DocForgeStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  documentContent: "",
  messages: [],
  snapshots: [],
  globalError: null,

  clearError() {
    set({ globalError: null });
  },

  async loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`セッション読み込みに失敗しました (${res.status})`);
      const sessions = await res.json();
      set({ sessions });
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async selectSession(id: string) {
    try {
      const [sessionRes, msgsRes, snapsRes] = await Promise.all([
        fetch(`/api/sessions/${id}`),
        fetch(`/api/sessions/${id}/messages`),
        fetch(`/api/sessions/${id}/snapshots`),
      ]);
      if (!sessionRes.ok) throw new Error(`セッション取得に失敗しました (${sessionRes.status})`);
      if (!msgsRes.ok) throw new Error(`メッセージ取得に失敗しました (${msgsRes.status})`);
      if (!snapsRes.ok) throw new Error(`スナップショット取得に失敗しました (${snapsRes.status})`);
      const session = await sessionRes.json();
      const messages = await msgsRes.json();
      const snapshots = await snapsRes.json();
      set({
        currentSessionId: id,
        documentContent: session.documentContent ?? "",
        messages,
        snapshots,
      });
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async createSession(title: string) {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`セッション作成に失敗しました (${res.status})`);
      const session = await res.json();
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSessionId: session.id,
        documentContent: session.documentContent ?? "",
        messages: [],
        snapshots: [],
      }));
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async updateSessionTitle(id: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error(`タイトル更新に失敗しました (${res.status})`);
      const updated = await res.json();
      set((state) => ({
        sessions: state.sessions
          .map((s) => (s.id === id ? updated : s))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      }));
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async deleteSession(id: string) {
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`セッション削除に失敗しました (${res.status})`);
      const { sessions, currentSessionId } = get();
      const next = sessions.filter((s) => s.id !== id);
      set({
        sessions: next,
        ...(currentSessionId === id
          ? {
              currentSessionId: null,
              documentContent: "",
              messages: [],
              snapshots: [],
            }
          : {}),
      });
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async updateDocument(content: string) {
    const { currentSessionId, documentContent: prev } = get();
    if (!currentSessionId) return;
    set({ documentContent: content });
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentContent: content }),
      });
      if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
    } catch (err) {
      set({ documentContent: prev, globalError: toErrorMessage(err) });
    }
  },

  setDocumentContent(content: string) {
    set({ documentContent: content });
  },

  async addMessage(role, content) {
    const { currentSessionId } = get();
    if (!currentSessionId) throw new Error("アクティブなセッションがありません");
    const res = await fetch(`/api/sessions/${currentSessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    if (!res.ok) throw new Error(`メッセージ送信に失敗しました (${res.status})`);
    const msg = await res.json();
    set((state) => ({ messages: [...state.messages, msg] }));
    return msg;
  },

  async loadSnapshots() {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}/snapshots`);
      if (!res.ok) throw new Error(`スナップショット読み込みに失敗しました (${res.status})`);
      const snapshots = await res.json();
      set({ snapshots });
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async undo() {
    const { snapshots, currentSessionId } = get();
    if (!currentSessionId || snapshots.length === 0) return;
    // Snapshots are ordered desc by createdAt, so [0] is the most recent
    const latest = snapshots[0];
    try {
      await get().updateDocument(latest.previousContent);
      const res = await fetch(`/api/sessions/${currentSessionId}/snapshots`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: latest.id }),
      });
      if (!res.ok) throw new Error(`スナップショット削除に失敗しました (${res.status})`);
      set((state) => ({ snapshots: state.snapshots.filter((s) => s.id !== latest.id) }));
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async restoreSnapshot(snapshotId: string) {
    const { snapshots } = get();
    const snap = snapshots.find((s) => s.id === snapshotId);
    if (!snap) return;
    try {
      await get().updateDocument(snap.previousContent);
      await get().loadSnapshots();
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },
}));
