export type ArtifactType = "document" | "slides";

export interface SlideVisualImage {
  type: "image";
  src: string;
  assetPath?: string;
  alt?: string;
  caption?: string;
}

export interface SlideVisualTable {
  type: "table";
  rows: string[][];
  caption?: string;
}

export type SlideVisual = SlideVisualImage | SlideVisualTable;

export interface SlideSpec {
  id: string;
  kind: "title" | "section" | "content" | "summary";
  title: string;
  bullets: string[];
  body?: string;
  speakerNotes?: string;
  visuals: SlideVisual[];
  layout: string;
  themeVariant?: string;
}

export interface SlideDeck {
  title: string;
  subtitle?: string;
  objective?: string;
  audience?: string;
  slides: SlideSpec[];
}

export interface SlideThemeTokens {
  pageSize: string;
  titleFontFamily: string;
  bodyFontFamily: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  headerText: string;
  footerText: string;
  logoAssetPath: string;
}

export interface SlideTheme {
  presetId: string;
  tokens: SlideThemeTokens;
}

export interface SlideExportOptions {
  includeSpeakerNotes: boolean;
  defaultLayout: string;
}

export interface SlidesSnapshotPayload {
  sourceMarkdown: string;
  slideDeck: SlideDeck | null;
  theme: SlideTheme | null;
  exportOptions: SlideExportOptions | null;
  plannerVersion: string | null;
  rendererVersion: string | null;
}

export interface Session {
  id: string;
  title: string;
  artifactType: ArtifactType;
  documentContent: string;
  sourceMarkdown: string | null;
  slideDeck: SlideDeck | null;
  slideDeckWarnings: string[];
  theme: SlideTheme | null;
  exportOptions: SlideExportOptions | null;
  plannerVersion: string | null;
  rendererVersion: string | null;
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
  artifactType: ArtifactType;
  previousContent: string;
  summary: string;
  payload: SlidesSnapshotPayload | null;
  relatedMessageId: string | null;
  createdAt: number;
}
