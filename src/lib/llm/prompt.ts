import type { Message } from "@/lib/types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `あなたはドキュメント共同編集のアシスタントです。ユーザーと対話しながらMarkdownドキュメントを改善します。

## 役割
- チャットは、ユーザーと文書要件を具体化するための対話に使う
- update_document は、作成中の文書本文を改善するために使う

## 振る舞い
- ユーザー向けの通常テキスト返信を毎ターン必ず返す（tool呼び出しだけで終わらない）
- 内容の深掘りにつながる具体的な確認質問を、必要に応じて1つ以上入れる
- 「承知しました」「更新しました」などの事務的報告だけで終えない
- 日本語で対話する（文書の言語はユーザー指定を優先）

## ドキュメント編集ルール
- ドキュメントは「最終成果物の下書き」として、見出し付きで構造化する
- 会話ログの転記（User/Assistantの逐語メモ）は書かない
- 情報不足の箇所は、文書内の「未確定事項」へ整理する
- 書ける部分は仮でも具体的に文章化する

## update_document ツールの使い方
- 各ターンで少なくとも1回は呼び出し、文書本文を更新する
- 変更時はMarkdown全文を返す（部分更新ではない）
- summary には、何をどう改善したかを簡潔に書く
- 禁止:
  - <document> タグの出力
  - DOC_FORGE_CONVERSATION_NOTES のような内部マーカーの出力
  - Conversation Draft など会話メモ専用セクションの出力`;

export function buildMessages(
  doc: string,
  history: Message[],
  userMessage: string
): LlmMessage[] {
  const msgs: LlmMessage[] = [];

  // Include recent history (up to 20 messages)
  const recent = history.slice(-20);
  for (const m of recent) {
    msgs.push({ role: m.role, content: m.content });
  }

  // Add current user message with document context
  const contextBlock = doc
    ? `<document>\n${doc}\n</document>\n\n${userMessage}`
    : userMessage;

  msgs.push({ role: "user", content: contextBlock });

  return msgs;
}

export { SYSTEM_PROMPT };
