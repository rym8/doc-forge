import { create } from "zustand";
import type { ArtifactType, Session, Message, Snapshot } from "./types";

interface DocForgeStore {
  sessions: Session[];
  currentSessionId: string | null;
  currentSlideId: string | null;
  documentContent: string;
  messages: Message[];
  snapshots: Snapshot[];
  globalError: string | null;

  loadSessions(): Promise<void>;
  selectSession(id: string): Promise<void>;
  createSession(title: string, artifactType?: ArtifactType): Promise<void>;
  updateSessionTitle(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  updateDocument(content: string): Promise<void>;
  setCurrentSlideId(id: string | null): void;
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

function replaceSession(sessions: Session[], nextSession: Session): Session[] {
  const hasSession = sessions.some((session) => session.id === nextSession.id);
  const merged = hasSession
    ? sessions.map((session) =>
        session.id === nextSession.id ? nextSession : session
      )
    : [nextSession, ...sessions];

  return merged.sort((a, b) => b.updatedAt - a.updatedAt);
}

function getEditableContent(session: Session | null | undefined): string {
  if (!session) return "";
  return session.artifactType === "slides"
    ? (session.sourceMarkdown ?? session.documentContent ?? "")
    : session.documentContent ?? "";
}

async function deleteSnapshot(sessionId: string, snapshotId: string) {
  const res = await fetch(`/api/sessions/${sessionId}/snapshots`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotId }),
  });
  if (!res.ok) {
    throw new Error(`スナップショット削除に失敗しました (${res.status})`);
  }
}

export const useStore = create<DocForgeStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentSlideId: null,
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
      const existingSessions = get().sessions;
      set({
        sessions: replaceSession(existingSessions, session),
        currentSessionId: id,
        currentSlideId: null,
        documentContent: getEditableContent(session),
        messages,
        snapshots,
      });
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async createSession(title: string, artifactType: ArtifactType = "document") {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artifactType }),
      });
      if (!res.ok) throw new Error(`セッション作成に失敗しました (${res.status})`);
      const session = await res.json();
      set((state) => ({
        sessions: replaceSession(state.sessions, session),
        currentSessionId: session.id,
        currentSlideId: null,
        documentContent: getEditableContent(session),
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
              currentSlideId: null,
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
    const { currentSessionId, documentContent: prev, sessions } = get();
    if (!currentSessionId) return;
    const currentSession = sessions.find((session) => session.id === currentSessionId);
    set({ documentContent: content });
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          currentSession?.artifactType === "slides"
            ? {
                documentContent: content,
                sourceMarkdown: content,
              }
            : { documentContent: content }
        ),
      });
      if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
      const session = await res.json();
      set((state) => ({
        sessions: replaceSession(state.sessions, session),
        documentContent: getEditableContent(session),
      }));
    } catch (err) {
      set({ documentContent: prev, globalError: toErrorMessage(err) });
    }
  },

  setCurrentSlideId(id: string | null) {
    set({ currentSlideId: id });
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
    const { snapshots, currentSessionId, sessions } = get();
    if (!currentSessionId || snapshots.length === 0) return;
    const latest = snapshots[0];
    const currentSession = sessions.find((session) => session.id === currentSessionId);
    try {
      if (currentSession?.artifactType === "slides" && latest.payload) {
        const res = await fetch(`/api/sessions/${currentSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentContent: latest.payload.sourceMarkdown,
            sourceMarkdown: latest.payload.sourceMarkdown,
            slideDeck: latest.payload.slideDeck,
            theme: latest.payload.theme,
            exportOptions: latest.payload.exportOptions,
            plannerVersion: latest.payload.plannerVersion,
            rendererVersion: latest.payload.rendererVersion,
          }),
        });
        if (!res.ok) throw new Error(`スナップショット復元に失敗しました (${res.status})`);
        const session = await res.json();
        set((state) => ({
          sessions: replaceSession(state.sessions, session),
          documentContent: getEditableContent(session),
        }));
      } else {
        await get().updateDocument(latest.previousContent);
      }
      await deleteSnapshot(currentSessionId, latest.id);
      set((state) => ({ snapshots: state.snapshots.filter((s) => s.id !== latest.id) }));
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },

  async restoreSnapshot(snapshotId: string) {
    const { snapshots, currentSessionId, sessions } = get();
    const snap = snapshots.find((s) => s.id === snapshotId);
    if (!snap) return;
    try {
      if (!currentSessionId) return;
      const currentSession = sessions.find((session) => session.id === currentSessionId);
      if (currentSession?.artifactType === "slides" && snap.payload) {
        const res = await fetch(`/api/sessions/${currentSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentContent: snap.payload.sourceMarkdown,
            sourceMarkdown: snap.payload.sourceMarkdown,
            slideDeck: snap.payload.slideDeck,
            theme: snap.payload.theme,
            exportOptions: snap.payload.exportOptions,
            plannerVersion: snap.payload.plannerVersion,
            rendererVersion: snap.payload.rendererVersion,
          }),
        });
        if (!res.ok) throw new Error(`スナップショット復元に失敗しました (${res.status})`);
        const session = await res.json();
        set((state) => ({
          sessions: replaceSession(state.sessions, session),
          documentContent: getEditableContent(session),
        }));
      } else {
        await get().updateDocument(snap.previousContent);
      }
      await get().loadSnapshots();
    } catch (err) {
      set({ globalError: toErrorMessage(err) });
    }
  },
}));
