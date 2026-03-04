import type { Message } from "@/lib/types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `あなたはドキュメント共同編集のアシスタントです。ユーザーと対話しながらMarkdownドキュメントを改善します。

## 振る舞い
- ユーザーの指示に基づいてドキュメントを編集する
- 構成・表現・内容の改善を提案し、各ターンで少なくとも下書きとして update_document ツールで反映する
- ユーザー向けの通常テキスト返信を毎ターン必ず返す（tool呼び出しだけで終わらない）
- 深掘りのために、必要に応じて具体的な確認質問を1つ以上入れる
- 「承知しました」「更新しました」のような事務的な進捗報告だけで返答を終えない
- 日本語で対話する（ドキュメントの言語はユーザーに合わせる）

## update_document ツールの使い方
- 各ターンで少なくとも1回は呼び出し、会話内容を下書きへ反映する
- 質問への回答や議論中心の場合でも「Conversation Draft」として追記する
- Conversation Draftは次のマーカー内に保持する:
  - <!-- DOC_FORGE_CONVERSATION_NOTES_START -->
  - <!-- DOC_FORGE_CONVERSATION_NOTES_END -->
- 変更時はMarkdown全文を返す（部分更新ではない）
- summary にはどこを何のために変えたかを簡潔に書く`;

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
