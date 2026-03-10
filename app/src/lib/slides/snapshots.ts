import { v4 as uuid } from "uuid";
import type { Session, SlidesSnapshotPayload, Snapshot } from "@/lib/types";

export interface SnapshotRow {
  id: string;
  sessionId: string;
  artifactType?: string | null;
  previousContent: string;
  summary: string;
  payloadJson?: string | null;
  relatedMessageId: string | null;
  createdAt: number;
}

function safeParsePayload(value?: string | null): SlidesSnapshotPayload | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SlidesSnapshotPayload;
  } catch {
    return null;
  }
}

export function toSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    sessionId: row.sessionId,
    artifactType: row.artifactType === "slides" ? "slides" : "document",
    previousContent: row.previousContent ?? "",
    summary: row.summary ?? "",
    payload: safeParsePayload(row.payloadJson),
    relatedMessageId: row.relatedMessageId ?? null,
    createdAt: row.createdAt,
  };
}

export function buildSlidesSnapshotPayload(
  session: Session
): SlidesSnapshotPayload {
  return {
    sourceMarkdown: session.sourceMarkdown ?? session.documentContent ?? "",
    slideDeck: session.slideDeck,
    theme: session.theme,
    exportOptions: session.exportOptions,
    plannerVersion: session.plannerVersion,
    rendererVersion: session.rendererVersion,
  };
}

export function buildDocumentSnapshotValues(input: {
  sessionId: string;
  previousContent: string;
  summary: string;
  relatedMessageId?: string | null;
}) {
  return {
    id: uuid(),
    sessionId: input.sessionId,
    artifactType: "document" as const,
    previousContent: input.previousContent,
    summary: input.summary,
    payloadJson: null,
    relatedMessageId: input.relatedMessageId ?? null,
    createdAt: Date.now(),
  };
}

export function buildSlidesSnapshotValues(input: {
  session: Session;
  summary: string;
  relatedMessageId?: string | null;
}) {
  return {
    id: uuid(),
    sessionId: input.session.id,
    artifactType: "slides" as const,
    previousContent:
      input.session.sourceMarkdown ?? input.session.documentContent ?? "",
    summary: input.summary,
    payloadJson: JSON.stringify(buildSlidesSnapshotPayload(input.session)),
    relatedMessageId: input.relatedMessageId ?? null,
    createdAt: Date.now(),
  };
}
