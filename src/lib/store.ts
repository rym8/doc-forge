import { create } from "zustand";
import type { Session, Message, Snapshot } from "./types";

interface DocForgeStore {
  sessions: Session[];
  currentSessionId: string | null;
  documentContent: string;
  messages: Message[];
  snapshots: Snapshot[];

  loadSessions(): Promise<void>;
  selectSession(id: string): Promise<void>;
  createSession(title: string): Promise<void>;
  updateSessionTitle(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  updateDocument(content: string): Promise<void>;
  setDocumentContent(content: string): void;
  addMessage(role: "user" | "assistant", content: string): Promise<Message>;
  loadSnapshots(): Promise<void>;
  undo(): Promise<void>;
  restoreSnapshot(snapshotId: string): Promise<void>;
}

export const useStore = create<DocForgeStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  documentContent: "",
  messages: [],
  snapshots: [],

  async loadSessions() {
    const res = await fetch("/api/sessions");
    const sessions = await res.json();
    set({ sessions });
  },

  async selectSession(id: string) {
    const [sessionRes, msgsRes, snapsRes] = await Promise.all([
      fetch(`/api/sessions/${id}`),
      fetch(`/api/sessions/${id}/messages`),
      fetch(`/api/sessions/${id}/snapshots`),
    ]);
    const session = await sessionRes.json();
    const messages = await msgsRes.json();
    const snapshots = await snapsRes.json();
    set({
      currentSessionId: id,
      documentContent: session.documentContent ?? "",
      messages,
      snapshots,
    });
  },

  async createSession(title: string) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const session = await res.json();
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id,
      documentContent: session.documentContent ?? "",
      messages: [],
      snapshots: [],
    }));
  },

  async updateSessionTitle(id: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    const updated = await res.json();
    set((state) => ({
      sessions: state.sessions
        .map((s) => (s.id === id ? updated : s))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }));
  },

  async deleteSession(id: string) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
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
  },

  async updateDocument(content: string) {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    set({ documentContent: content });
    await fetch(`/api/sessions/${currentSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentContent: content }),
    });
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
    const msg = await res.json();
    set((state) => ({ messages: [...state.messages, msg] }));
    return msg;
  },

  async loadSnapshots() {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    const res = await fetch(`/api/sessions/${currentSessionId}/snapshots`);
    const snapshots = await res.json();
    set({ snapshots });
  },

  async undo() {
    const { snapshots, currentSessionId } = get();
    if (!currentSessionId || snapshots.length === 0) return;
    // Snapshots are ordered desc by createdAt, so [0] is the most recent
    const latest = snapshots[0];
    await get().updateDocument(latest.previousContent);
    await get().loadSnapshots();
  },

  async restoreSnapshot(snapshotId: string) {
    const { snapshots } = get();
    const snap = snapshots.find((s) => s.id === snapshotId);
    if (!snap) return;
    await get().updateDocument(snap.previousContent);
    await get().loadSnapshots();
  },
}));
