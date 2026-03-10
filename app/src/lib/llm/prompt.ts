import type { ArtifactType, Message, SlideDeck } from "@/lib/types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

const DOCUMENT_SYSTEM_PROMPT = `あなたはドキュメント共同編集のアシスタントです。ユーザーと対話しながらMarkdownドキュメントを改善します。

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
- internal_notes が渡された場合は背景メモとして参照してよいが、本文へは必要な内容だけを統合する
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

const SLIDES_SYSTEM_PROMPT = `あなたはスライド共同編集のアシスタントです。ユーザーと対話しながら slideDeck を改善します。

## 役割
- チャットは、プレゼン資料の構成と表現を具体化するための対話に使う
- update_slide_deck は、現在の slideDeck 全体を改善するために使う

## 振る舞い
- ユーザー向けの通常テキスト返信を毎ターン必ず返す
- 「承知しました」「更新しました」だけで終わらず、改善意図や着眼点を短く説明する
- 日本語で対話する

## スライド編集ルール
- slideDeck は title と slides を持つ完全な JSON として扱う
- 既存 slide の順序や内容を尊重しつつ必要箇所だけ更新する
- slides は title / kind / layout / bullets / body / speakerNotes / visuals を持つ
- focusSlideId が渡された場合は、その slide を優先して更新する
- kind は "title | section | content | summary" のいずれかにする
- layout は "title-slide | title-body | section-divider | summary-grid" のいずれかにする
- 不要な slide を勝手に削除しない
- visuals は既存情報を保持し、根拠なく消さない

## update_slide_deck ツールの使い方
- 各ターンで少なくとも1回は呼び出し、slideDeck 全体を返す
- summary には、何をどう改善したかを簡潔に書く
- slide_deck には object をそのまま入れる
- 既存 slide を更新するときは id を維持する
- 禁止:
  - <slideDeck> タグの出力
  - 会話ログの転記
  - slide_deck を文字列化すること`;

export function buildMessages(input: {
  artifactType: ArtifactType;
  doc: string;
  notes?: string;
  slideDeck?: SlideDeck | null;
  currentSlideId?: string | null;
  history: Message[];
  userMessage: string;
}): LlmMessage[] {
  const msgs: LlmMessage[] = [];

  // Include recent history (up to 20 messages)
  const recent = input.history.slice(-20);
  for (const m of recent) {
    msgs.push({ role: m.role, content: m.content });
  }

  let contextBlock = input.userMessage;
  if (input.artifactType === "slides") {
    const parts: string[] = [];
    if (input.doc) {
      parts.push(`<sourceMarkdown>\n${input.doc}\n</sourceMarkdown>`);
    }
    if (input.slideDeck) {
      parts.push(
        `<slideDeck>\n${JSON.stringify(input.slideDeck, null, 2)}\n</slideDeck>`
      );
    }
    if (input.currentSlideId) {
      parts.push(`<focusSlideId>\n${input.currentSlideId}\n</focusSlideId>`);
      const focusSlide =
        input.slideDeck?.slides.find(
          (slide) => slide.id === input.currentSlideId
        ) ?? null;
      if (focusSlide) {
        parts.push(
          `<focusSlide>\n${JSON.stringify(focusSlide, null, 2)}\n</focusSlide>`
        );
      }
    }
    parts.push(input.userMessage);
    contextBlock = parts.join("\n\n");
  } else if (input.doc) {
    const parts = [`<document>\n${input.doc}\n</document>`];
    if (input.notes?.trim()) {
      parts.push(`<internal_notes>\n${input.notes.trim()}\n</internal_notes>`);
    }
    parts.push(input.userMessage);
    contextBlock = parts.join("\n\n");
  }

  msgs.push({ role: "user", content: contextBlock });

  return msgs;
}

export function getSystemPrompt(artifactType: ArtifactType): string {
  return artifactType === "slides"
    ? SLIDES_SYSTEM_PROMPT
    : DOCUMENT_SYSTEM_PROMPT;
}
