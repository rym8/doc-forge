const CONVERSATION_NOTES_START = "<!-- DOC_FORGE_CONVERSATION_NOTES_START -->";
const CONVERSATION_NOTES_END = "<!-- DOC_FORGE_CONVERSATION_NOTES_END -->";
const CONVERSATION_NOTES_BLOCK =
  /<!-- DOC_FORGE_CONVERSATION_NOTES_START -->[\s\S]*?<!-- DOC_FORGE_CONVERSATION_NOTES_END -->/gi;
const LEGACY_CONVERSATION_SECTION = /\n?##\s+Conversation Draft[\s\S]*$/im;
const INTERNAL_NOTES_HEADING = "制作メモ（プレビュー非表示）";
const NOTE_INTENT_HEADING = "資料の意図";
const NOTE_DECISIONS_HEADING = "会話で固まったこと";
const NOTE_OFF_DOCUMENT_HEADING = "資料外だが重要なメモ";
const PREVIEW_HIDDEN_MEMO_SECTIONS = [
  "Conversation Draft",
  "今回の更新",
  "参考メモ",
  "AIメモ",
  "会話メモ",
  INTERNAL_NOTES_HEADING,
];
const VISIBLE_UPDATE_SECTION = "更新内容";
const BODY_SECTION_CANDIDATES = [
  "本文ドラフト",
  "概要",
  "提案内容",
  "詳細",
  "主な機能",
  "アプリの概要",
];
const BODY_SECTION_RULES = [
  {
    keywords: ["課題", "問題", "手戻り", "悩み", "分断", "ボトルネック"],
    headings: ["解決する課題", "課題", "背景", "現状"],
  },
  {
    keywords: ["独自性", "価値", "強み", "特徴", "メリット", "コンセプト"],
    headings: ["独自性", "価値", "アプリの概要", "概要", "特徴", "主な機能"],
  },
  {
    keywords: ["機能", "できる", "出力", "プレビュー", "テンプレート", "ワークフロー"],
    headings: ["主な機能", "機能", "使い方", "ワークフロー"],
  },
  {
    keywords: ["ユーザー", "読者", "ターゲット", "対象", "誰に"],
    headings: ["ターゲットユーザー", "想定読者", "対象ユーザー"],
  },
  {
    keywords: ["目的", "狙い", "何のため", "メッセージ"],
    headings: ["目的", "発表の目的", "メッセージ"],
  },
  {
    keywords: ["未確定", "未定", "確認", "次に", "懸念", "リスク"],
    headings: ["未確定事項", "次に確認すること", "懸念", "リスク"],
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarize(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function hasStructuredHeadings(content: string): boolean {
  const h2Count = (content.match(/^##\s+/gm) ?? []).length;
  return h2Count >= 2;
}

function looksLikeConversationMemo(content: string): boolean {
  return (
    /^#\s*Draft\b/i.test(content) ||
    /^-\s*(User|Assistant)\s*:/m.test(content) ||
    /DOC_FORGE_CONVERSATION_NOTES/i.test(content)
  );
}

function inferTitle(seed: string): string {
  const normalized = seed.replace(/\s+/g, " ").trim();
  if (!normalized) return "文書タイトル（作成中）";

  const candidate = normalized
    .replace(/^(資料|文書|ドキュメント|企画|提案|メモ|案)\s*/, "")
    .replace(/^(作成|作って|作る)\s*/, "")
    .replace(/^(について|に関して)\s*/, "")
    .trim();

  const title = candidate || normalized;
  if (title.length <= 42) return title;
  return `${title.slice(0, 42)}...`;
}

function stripH2Sections(content: string, headings: string[]): string {
  let next = content;
  for (const heading of headings) {
    const escaped = escapeRegExp(heading);
    const pattern = new RegExp(
      `\\n?##\\s+${escaped}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`,
      "gi"
    );
    next = next.replace(pattern, "\n");
  }
  return next;
}

function extractH2Headings(content: string): string[] {
  return Array.from(content.matchAll(/^##\s+(.+)$/gm)).map((match) =>
    (match[1] ?? "").trim()
  );
}

function extractSectionBody(
  content: string,
  heading: string,
  level = 2
): string | null {
  const hashes = "#".repeat(level);
  const escaped = escapeRegExp(heading);
  const pattern = new RegExp(
    `^${hashes}\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n${hashes}\\s+|$)`,
    "m"
  );
  const match = content.match(pattern);
  const body = match?.[1]?.trim();
  return body ? body : null;
}

function findVisibleBodyHeading(content: string): string | null {
  const headings = extractH2Headings(content);
  for (const candidate of BODY_SECTION_CANDIDATES) {
    const matched = headings.find((heading) => heading.includes(candidate));
    if (matched) return matched;
  }
  return null;
}

function findBestBodyHeading(
  content: string,
  userLine: string,
  assistantLine: string
): string | null {
  const headings = extractH2Headings(content);
  const haystack = `${userLine}\n${assistantLine}`;

  for (const rule of BODY_SECTION_RULES) {
    if (!rule.keywords.some((keyword) => haystack.includes(keyword))) {
      continue;
    }
    const matched = headings.find((heading) =>
      rule.headings.some((candidate) => heading.includes(candidate))
    );
    if (matched) return matched;
  }

  return findVisibleBodyHeading(content);
}

function buildSectionPattern(level: number, heading: string): RegExp {
  const hashes = "#".repeat(level);
  const escapedHeading = escapeRegExp(heading);
  return new RegExp(
    `(^${hashes}\\s+${escapedHeading}\\s*\\n)([\\s\\S]*?)(?=\\n${hashes}\\s+|$)`,
    "m"
  );
}

function upsertHeadingSection(
  document: string,
  heading: string,
  body: string,
  level = 2
): string {
  const hashes = "#".repeat(level);
  const section = `${hashes} ${heading}\n${body.trim()}`;
  const pattern = buildSectionPattern(level, heading);

  if (pattern.test(document)) {
    return document.replace(pattern, `${section}\n`);
  }

  return `${document.trimEnd()}\n\n${section}\n`;
}

function appendBulletsToSection(
  document: string,
  heading: string,
  bullets: string[],
  level = 2
): string {
  const uniqueBullets = Array.from(
    new Set(
      bullets
        .map((bullet) => bullet.trim())
        .filter(Boolean)
    )
  );

  if (uniqueBullets.length === 0) {
    return document.trim();
  }

  const pattern = buildSectionPattern(level, heading);
  if (!pattern.test(document)) {
    return upsertHeadingSection(
      document,
      heading,
      uniqueBullets.map((bullet) => `- ${bullet}`).join("\n"),
      level
    );
  }

  return document.replace(pattern, (_match, prefix, body) => {
    const trimmedBody = String(body).trimEnd();
    const existingLines = trimmedBody
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const existingSet = new Set(existingLines);
    const additions = uniqueBullets
      .map((bullet) => `- ${bullet}`)
      .filter((line) => !existingSet.has(line));

    if (additions.length === 0) {
      return `${prefix}${trimmedBody}${trimmedBody ? "\n" : ""}`;
    }

    if (!trimmedBody) {
      return `${prefix}${additions.join("\n")}\n`;
    }

    const lastLine = existingLines.at(-1) ?? "";
    const separator = /^(- |\d+\. )/.test(lastLine) ? "\n" : "\n\n";
    return `${prefix}${trimmedBody}${separator}${additions.join("\n")}\n`;
  });
}

function buildInitialStructuredDocument(
  userLine: string,
  assistantLine: string
): string {
  const title = inferTitle(userLine || assistantLine);
  const objective = userLine || "この文書の目的を対話しながら具体化する。";
  const draftPoint = assistantLine || "要点を整理しながら本文を具体化する。";

  return `# ${title}

## 目的
- ${objective}

## 想定読者
- 未定（対話を通じて具体化）

## 本文ドラフト
- ${draftPoint}

## 次に確認すること
- 読者像 / 利用シーン / 読後に取ってほしい行動を確定する
- 追加すべき事例・データ・根拠を明確にする`;
}

function extractTaggedConversationNotes(content: string): string {
  const escapedStart = escapeRegExp(CONVERSATION_NOTES_START);
  const escapedEnd = escapeRegExp(CONVERSATION_NOTES_END);
  const pattern = new RegExp(
    `${escapedStart}\\s*([\\s\\S]*?)\\s*${escapedEnd}`,
    "i"
  );
  const match = content.match(pattern);
  const raw = match?.[1]?.trim() ?? "";
  if (!raw) return "";

  return raw
    .replace(
      new RegExp(`^##\\s+${escapeRegExp(INTERNAL_NOTES_HEADING)}\\s*\\n?`, "i"),
      ""
    )
    .trim();
}

function extractLegacyConversationNotes(content: string): string {
  const parts: string[] = [];
  for (const heading of PREVIEW_HIDDEN_MEMO_SECTIONS) {
    const body = extractSectionBody(content, heading, 2);
    if (!body) continue;
    parts.push(`### ${heading}\n${body}`);
  }
  return parts.join("\n\n").trim();
}

function inferObjective(material: string, userLine: string, assistantLine: string): string {
  const explicitGoal =
    extractSectionBody(material, "目的", 2) ??
    extractSectionBody(material, "発表の目的", 2);
  if (explicitGoal) {
    return summarize(
      explicitGoal
        .replace(/^-+\s*/gm, "")
        .replace(/\n+/g, " "),
      180
    );
  }

  const title = material.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (userLine) return userLine;
  if (assistantLine) return assistantLine;
  if (title) return `${title}の価値と構成を具体化する`;
  return "この資料で伝える価値と意思決定を明確にする";
}

function buildInitialConversationNotes(
  material: string,
  userLine: string,
  assistantLine: string
): string {
  const objective = inferObjective(material, userLine, assistantLine);

  return `### ${NOTE_INTENT_HEADING}
- ${objective}

### ${NOTE_DECISIONS_HEADING}
- ${assistantLine || "会話で固まった内容をここに残す"}

### ${NOTE_OFF_DOCUMENT_HEADING}
- ${userLine || "資料外の判断材料や前提条件をここに残す"}`;
}

function updateConversationNotes(
  existingContent: string,
  material: string,
  userMessage: string,
  assistantText: string
): string {
  const userLine = summarize(userMessage, 220);
  const assistantLine = summarize(assistantText, 220);
  let notes =
    extractTaggedConversationNotes(existingContent) ||
    extractLegacyConversationNotes(existingContent);

  if (!notes) {
    notes = buildInitialConversationNotes(material, userLine, assistantLine);
  }

  notes = appendBulletsToSection(
    notes,
    NOTE_INTENT_HEADING,
    [inferObjective(material, userLine, assistantLine)],
    3
  );
  notes = appendBulletsToSection(
    notes,
    NOTE_DECISIONS_HEADING,
    [assistantLine],
    3
  );
  notes = appendBulletsToSection(
    notes,
    NOTE_OFF_DOCUMENT_HEADING,
    [userLine],
    3
  );

  return notes.trim();
}

export function stripConversationArtifacts(content: string): string {
  return stripH2Sections(
    content
      .replace(CONVERSATION_NOTES_BLOCK, "\n")
      .replace(LEGACY_CONVERSATION_SECTION, "\n"),
    PREVIEW_HIDDEN_MEMO_SECTIONS
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractConversationNotes(content: string): string {
  const tagged = extractTaggedConversationNotes(content);
  if (tagged) return tagged;
  return extractLegacyConversationNotes(content);
}

export function splitDocumentContent(content: string): {
  material: string;
  notes: string;
} {
  return {
    material: stripConversationArtifacts(content),
    notes: extractConversationNotes(content),
  };
}

export function composeDocumentContent(material: string, notes = ""): string {
  const cleanMaterial = stripConversationArtifacts(material).trim();
  const cleanNotes = notes.trim();
  if (!cleanNotes) {
    return cleanMaterial;
  }

  return `${cleanMaterial}

${CONVERSATION_NOTES_START}
## ${INTERNAL_NOTES_HEADING}
${cleanNotes}
${CONVERSATION_NOTES_END}`.trim();
}

export function ensureStructuredDocument(content: string): string {
  const cleaned = stripConversationArtifacts(content).trim();
  if (!cleaned) return "";
  if (hasStructuredHeadings(cleaned)) return cleaned;
  if (looksLikeConversationMemo(cleaned)) {
    return buildInitialStructuredDocument(summarize(cleaned, 180), "");
  }
  return cleaned;
}

export function mergeDocumentWithConversationNotes(
  existingContent: string,
  nextDocument: string,
  userMessage: string,
  assistantText: string
): string {
  const material = ensureStructuredDocument(nextDocument);
  const notes = updateConversationNotes(
    existingContent,
    material,
    userMessage,
    assistantText
  );
  return composeDocumentContent(material, notes);
}

export function buildStructuredAutoUpdate(
  doc: string,
  userMessage: string,
  assistantText: string
): { document: string; summary: string } {
  const cleaned = stripConversationArtifacts(doc).trim();
  const userLine = summarize(userMessage, 240);
  const assistantLine = summarize(assistantText, 240);

  let base = "";
  if (!cleaned) {
    base = buildInitialStructuredDocument(userLine, assistantLine);
  } else if (hasStructuredHeadings(cleaned)) {
    base = cleaned;
  } else if (looksLikeConversationMemo(cleaned)) {
    base = buildInitialStructuredDocument(userLine, assistantLine);
  } else {
    base = cleaned;
  }

  const reflectionLines = [assistantLine || userLine].filter(Boolean);
  const bodyHeading = findBestBodyHeading(base, userLine, assistantLine);
  let updated = base;
  if (bodyHeading) {
    updated = appendBulletsToSection(updated, bodyHeading, reflectionLines);
  } else {
    updated = upsertHeadingSection(
      updated,
      VISIBLE_UPDATE_SECTION,
      reflectionLines.map((line) => `- ${line}`).join("\n")
    );
  }

  updated = appendBulletsToSection(updated, "次に確認すること", [
    "目的と想定読者の優先度を確認する",
    "読後に取ってほしい行動を明確にする",
  ]);

  return {
    document: mergeDocumentWithConversationNotes(
      doc,
      updated.trim(),
      userMessage,
      assistantText
    ),
    summary: "会話内容を本文へ反映し、制作メモも更新",
  };
}
