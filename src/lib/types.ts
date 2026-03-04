export interface Session {
  id: string;
  title: string;
  documentContent: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  sessionId: string;
  previousContent: string;
  summary: string;
  relatedMessageId: string | null;
  createdAt: number;
}
