const CONVERSATION_NOTES_BLOCK =
  /<!-- DOC_FORGE_CONVERSATION_NOTES_START -->[\s\S]*?<!-- DOC_FORGE_CONVERSATION_NOTES_END -->/gi;
const LEGACY_CONVERSATION_SECTION = /\n?##\s+Conversation Draft[\s\S]*$/im;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarize(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function toBlockQuote(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
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

export function stripConversationArtifacts(content: string): string {
  return content
    .replace(CONVERSATION_NOTES_BLOCK, "\n")
    .replace(LEGACY_CONVERSATION_SECTION, "\n")
    .trim();
}

export function ensureStructuredDocument(content: string): string {
  const cleaned = stripConversationArtifacts(content).trim();
  if (!cleaned) return "";
  if (hasStructuredHeadings(cleaned)) return cleaned;
  if (looksLikeConversationMemo(cleaned)) {
    return `${buildInitialStructuredDocument(summarize(cleaned, 180), "")}

## 参考メモ
${toBlockQuote(cleaned)}`;
  }
  return cleaned;
}

function upsertH2Section(
  document: string,
  heading: string,
  body: string
): string {
  const escapedHeading = escapeRegExp(heading);
  const section = `## ${heading}\n${body.trim()}`;
  const pattern = new RegExp(
    `^##\\s+${escapedHeading}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`,
    "m"
  );

  if (pattern.test(document)) {
    return document.replace(pattern, `${section}\n`);
  }

  return `${document.trimEnd()}\n\n${section}\n`;
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
    base = `${buildInitialStructuredDocument(userLine, assistantLine)}

## 参考メモ
${toBlockQuote(cleaned)}`;
  } else {
    base = cleaned;
  }

  const reflectionLines = [
    `- 依頼内容: ${userLine || "（入力なし）"}`,
    assistantLine
      ? `- 反映案: ${assistantLine}`
      : "- 反映案: 次の対話で本文案を具体化する",
  ];

  let updated = upsertH2Section(base, "今回の更新", reflectionLines.join("\n"));
  updated = upsertH2Section(
    updated,
    "次に確認すること",
    [
      "- 目的と想定読者の優先度を確認する",
      "- 読後に取ってほしい行動を明確にする",
    ].join("\n")
  );

  return {
    document: updated.trim(),
    summary: "会話内容から本文を構造化して更新",
  };
}
