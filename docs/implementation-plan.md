# Doc Forge 実装計画

## Context

LLMとの対話を通じてドキュメントをブラッシュアップするWebアプリ「Doc Forge」のMVP実装計画。
コンセプトドキュメント（`src/doc-forge/docs/concept.md`）で議論した内容を元に、
動くMVPを最短で立ち上げることを目的とする。

### 判断済みの設計方針
- 技術スタック: Next.js App Router + TypeScript + Tailwind + shadcn/ui
- LLM連携: Claude API tool use（構造化出力の信頼性のため）
- データ永続化: Drizzle ORM + SQLite（better-sqlite3）
- 状態管理: Zustand
- ドキュメント更新: 自動適用 + Undo（毎回の承認/却下は行わない）
- Archive: スナップショット方式で変更履歴を保持

---

## フェーズ構成

MVP実装を5つのステップに分割する。各ステップは独立して動作確認可能。

### Step 1: プロジェクトスキャフォールド + 3ペインレイアウト
### Step 2: データ層（DB + ストア）
### Step 3: Markdownエディタ + ライブプレビュー
### Step 4: LLMチャット連携（tool useによるドキュメント更新）
### Step 5: Archive機能 + Undo

---

## Step 1: プロジェクトスキャフォールド + 3ペインレイアウト

### 目的
Next.jsプロジェクトを初期化し、3ペインUIの骨格を作る。

### タスク

1. **プロジェクト初期化**
   ```
   cd src/doc-forge
   npx create-next-app@latest app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   ```

2. **shadcn/ui セットアップ**
   ```
   cd app
   npx shadcn@latest init
   npx shadcn@latest add resizable button input scroll-area card separator
   ```

3. **3ペインレイアウト実装**
   - `src/app/page.tsx` — メインレイアウト
   - shadcn/ui `ResizablePanelGroup` + `ResizablePanel` + `ResizableHandle` を使用
   - 左ペイン（セッション一覧）: デフォルト幅 20%
   - 中央ペイン（ドキュメント）: デフォルト幅 50%
   - 右ペイン（チャット）: デフォルト幅 30%

4. **各ペインのプレースホルダコンポーネント**
   - `src/components/session-panel.tsx`
   - `src/components/document-panel.tsx`
   - `src/components/chat-panel.tsx`

### 作成ファイル
```
src/doc-forge/app/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/           (shadcn/ui自動生成)
│   │   ├── session-panel.tsx
│   │   ├── document-panel.tsx
│   │   └── chat-panel.tsx
│   └── lib/
│       └── utils.ts      (shadcn/ui自動生成)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

### 完了条件
- `npm run dev` でブラウザに3ペインレイアウトが表示される
- 各ペインがリサイズ可能

---

## Step 2: データ層（DB + ストア）

### 目的
Session / Message / Snapshot のデータモデルをDB + クライアントストアに実装する。

### タスク

1. **Drizzle ORM + SQLite セットアップ**
   ```
   npm install drizzle-orm better-sqlite3
   npm install -D drizzle-kit @types/better-sqlite3
   ```

2. **スキーマ定義** — `src/lib/db/schema.ts`
   ```typescript
   // sessions テーブル
   sessions: {
     id: text (UUID)
     title: text
     document_content: text (Markdown)
     created_at: integer (timestamp)
     updated_at: integer (timestamp)
   }

   // messages テーブル
   messages: {
     id: text (UUID)
     session_id: text (FK → sessions)
     role: text ('user' | 'assistant')
     content: text
     created_at: integer (timestamp)
   }

   // snapshots テーブル（Archive用）
   snapshots: {
     id: text (UUID)
     session_id: text (FK → sessions)
     section_id: text
     section_heading: text
     previous_content: text
     action: text ('replaced' | 'removed' | 'restructured')
     reason: text (nullable)
     related_message_id: text (nullable, FK → messages)
     created_at: integer (timestamp)
   }
   ```

3. **DB接続** — `src/lib/db/index.ts`
   - better-sqlite3でDB初期化
   - DBファイルは `src/doc-forge/app/data/doc-forge.db`

4. **API Routes**
   - `src/app/api/sessions/route.ts` — GET（一覧）, POST（新規作成）
   - `src/app/api/sessions/[id]/route.ts` — GET（詳細）, PATCH（更新）, DELETE
   - `src/app/api/sessions/[id]/messages/route.ts` — GET, POST

5. **Zustand ストア** — `src/lib/store.ts`
   ```typescript
   interface DocForgeStore {
     // セッション
     sessions: Session[]
     currentSessionId: string | null
     // ドキュメント
     documentContent: string
     // メッセージ
     messages: Message[]
     // アクション
     loadSessions(): Promise<void>
     selectSession(id: string): Promise<void>
     createSession(title: string): Promise<void>
     updateDocument(content: string): Promise<void>
     addMessage(role, content): Promise<void>
   }
   ```

### 作成ファイル
```
src/lib/
├── db/
│   ├── index.ts          (DB接続)
│   ├── schema.ts         (テーブル定義)
│   └── migrate.ts        (マイグレーション)
├── store.ts              (Zustand)
└── types.ts              (共有型定義)
src/app/api/
├── sessions/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       └── messages/
│           └── route.ts
```

### 完了条件
- セッション一覧がDBから読み込まれ、左ペインに表示される
- セッションを選択するとドキュメント内容が中央ペインに表示される
- 新規セッション作成が動作する

---

## Step 3: Markdownエディタ + ライブプレビュー

### 目的
中央ペインでMarkdownの編集とリアルタイムプレビューを実現する。

### タスク

1. **依存パッケージ**
   ```
   npm install react-markdown remark-gfm rehype-highlight
   ```

2. **ドキュメントパネル改修** — `src/components/document-panel.tsx`
   - 表示モード切替: **プレビュー** / **エディタ** / **分割**
   - プレビュー: `react-markdown` でレンダリング
   - エディタ: `<textarea>` or `contenteditable`（MVPはtextareaで十分）
   - 変更はデバウンス（500ms）してストア + API経由でDBに保存

3. **Markdownスタイリング** — `src/app/globals.css`
   - `.prose` クラス（Tailwind Typography plugin）でMarkdownをきれいに表示
   ```
   npm install @tailwindcss/typography
   ```

### 作成ファイル
```
src/components/
├── document-panel.tsx    (改修)
├── markdown-preview.tsx  (新規: react-markdownラッパー)
└── markdown-editor.tsx   (新規: テキストエリアエディタ)
```

### 完了条件
- Markdownを編集するとリアルタイムでプレビューが更新される
- 変更がDBに自動保存される
- GFM（テーブル、チェックリスト等）が正しく表示される

---

## Step 4: LLMチャット連携（tool useによるドキュメント更新）

### 目的
右ペインでLLMと対話し、ドキュメントがリアルタイムに更新される体験を実現する。
**ここがMVPの核心。**

### タスク

1. **Anthropic SDK インストール**
   ```
   npm install @anthropic-ai/sdk
   ```

2. **LLMサービス層** — `src/lib/llm/client.ts`
   - Claude APIのtool useを使用
   - tool定義:
     ```typescript
     {
       name: "update_document",
       description: "ドキュメントのMarkdown全体を更新する",
       input_schema: {
         type: "object",
         properties: {
           document: { type: "string", description: "更新後のMarkdown全文" },
           summary: { type: "string", description: "変更内容の要約" }
         },
         required: ["document", "summary"]
       }
     }
     ```
   - **MVPではドキュメント全文置換で始める**（セクション単位の部分更新はPhase 1.5）
   - セクション単位の更新は見出しIDの管理が必要になり、MVPでは複雑すぎる

3. **プロンプト構築** — `src/lib/llm/prompt.ts`
   - System Prompt: ドキュメント共同編集者としての振る舞い
   - Document Context: 現在のMarkdown全文
   - Conversation: 直近20件のメッセージ
   ```typescript
   function buildMessages(doc: string, history: Message[], userMsg: string) {
     return [
       { role: "user", content: `<document>\n${doc}\n</document>\n\n${userMsg}` },
       // ... history
     ]
   }
   ```

4. **チャットAPI Route** — `src/app/api/chat/route.ts`
   - POST: ユーザーメッセージ受信 → Claude API呼び出し → レスポンス返却
   - ストリーミング対応（対話パートはSSEでストリーム、tool_use結果は完了後に返す）
   - tool_useの `update_document` が呼ばれたら:
     1. 旧ドキュメントをsnapshotsに保存（Archive）
     2. document_contentを更新
     3. クライアントにドキュメント更新イベントを送信

5. **チャットパネル改修** — `src/components/chat-panel.tsx`
   - メッセージ入力 + 送信ボタン
   - メッセージ一覧表示（ユーザー / アシスタントの吹き出し）
   - ストリーミング表示（アシスタントの返答がリアルタイムで流れる）
   - ドキュメント更新通知（「ドキュメントを更新しました」バッジ）
   - 送信中のローディング表示

6. **環境変数**
   - `.env.local` に `ANTHROPIC_API_KEY` を設定

### 作成ファイル
```
src/lib/llm/
├── client.ts             (Claude API呼び出し)
├── prompt.ts             (プロンプト構築)
└── tools.ts              (tool定義)
src/app/api/
└── chat/
    └── route.ts          (チャットAPI)
src/components/
├── chat-panel.tsx        (改修)
├── chat-message.tsx      (新規: 個別メッセージ)
└── chat-input.tsx        (新規: 入力フォーム)
```

### 完了条件
- チャットでメッセージを送るとLLMが返答する
- LLMの返答がストリーミングで表示される
- LLMが `update_document` toolを使うと、中央ペインのドキュメントがリアルタイムに更新される
- 対話履歴がDBに保存される

---

## Step 5: Archive機能 + Undo

### 目的
ドキュメント変更の履歴を閲覧でき、元に戻せるようにする。

### タスク

1. **スナップショットAPI** — `src/app/api/sessions/[id]/snapshots/route.ts`
   - GET: セッションの変更履歴一覧

2. **Undo機能**
   - Zustandストアに `undo()` アクションを追加
   - 直近のスナップショットのprevious_contentでdocument_contentを上書き
   - キーボードショートカット: `Ctrl+Z` / `Cmd+Z`

3. **Archive表示UI** — `src/components/archive-drawer.tsx`
   - ドキュメントパネル内にトグルボタン（「変更履歴」）
   - サイドドロワーで変更一覧を時系列表示
   - 各スナップショット: 変更日時、アクション種別、変更サマリー
   - 「この版に戻す」ボタンで復元

### 作成ファイル
```
src/app/api/sessions/[id]/snapshots/
└── route.ts
src/components/
├── archive-drawer.tsx    (新規)
└── document-panel.tsx    (改修: Archiveトグル追加)
src/lib/
└── store.ts              (改修: undo追加)
```

### 完了条件
- LLMによるドキュメント更新のたびにスナップショットがDBに保存される
- 「変更履歴」から過去のバージョンを閲覧できる
- Undoで直前の状態に戻せる
- 戻した版から再び対話を続けられる

---

## ファイル構成（最終形）

```
src/doc-forge/
├── docs/
│   └── concept.md                   (コンセプトドキュメント)
├── app/                             (Next.jsアプリ)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   └── api/
│   │   │       ├── sessions/
│   │   │       │   ├── route.ts
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts
│   │   │       │       ├── messages/route.ts
│   │   │       │       └── snapshots/route.ts
│   │   │       └── chat/
│   │   │           └── route.ts
│   │   ├── components/
│   │   │   ├── ui/                  (shadcn/ui)
│   │   │   ├── session-panel.tsx
│   │   │   ├── document-panel.tsx
│   │   │   ├── markdown-preview.tsx
│   │   │   ├── markdown-editor.tsx
│   │   │   ├── chat-panel.tsx
│   │   │   ├── chat-message.tsx
│   │   │   ├── chat-input.tsx
│   │   │   └── archive-drawer.tsx
│   │   └── lib/
│   │       ├── db/
│   │       │   ├── index.ts
│   │       │   ├── schema.ts
│   │       │   └── migrate.ts
│   │       ├── llm/
│   │       │   ├── client.ts
│   │       │   ├── prompt.ts
│   │       │   └── tools.ts
│   │       ├── store.ts
│   │       ├── types.ts
│   │       └── utils.ts
│   ├── data/                        (SQLite DBファイル)
│   ├── drizzle.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.ts
```

---

## 技術スタック確定版

| レイヤー | 技術 | 理由 |
|---------|------|------|
| フレームワーク | Next.js 15 (App Router) | SSR + API Routes一体型 |
| 言語 | TypeScript | 型安全 |
| UI | Tailwind CSS + shadcn/ui | Resizableコンポーネント等が揃っている |
| Markdown | react-markdown + remark-gfm | 軽量、プラグイン豊富 |
| 状態管理 | Zustand | 軽量、ボイラープレート少 |
| ORM | Drizzle ORM | 型安全、SQLiteネイティブ対応 |
| DB | SQLite (better-sqlite3) | ローカルファースト、セットアップ不要 |
| LLM | Anthropic Claude API (@anthropic-ai/sdk) | tool use対応、ストリーミング |
| Markdown CSS | @tailwindcss/typography | .proseクラスで美しいMD表示 |

---

## 設計上のキーポイント

### ドキュメント更新はMVPでは全文置換
- セクション単位の部分更新（section_id管理）はPhase 1.5で実装
- MVPでは `update_document` toolがMarkdown全文を返す方式
- シンプルだがドキュメントが長くなるとトークン消費が増える。MVP規模なら問題なし

### ストリーミングの分離
- 対話テキスト: SSEでリアルタイムストリーム
- ドキュメント更新（tool_use）: レスポンス完了後にまとめて反映
- これにより中央ペインが中途半端な状態にならない

### Archive自動保存
- `update_document` tool実行時にサーバー側で自動的にスナップショットを作成
- クライアントは意識しなくてよい

---

## 検証方法

各ステップの完了時に以下を確認する:

1. **Step 1**: `npm run dev` → ブラウザで3ペインが表示、リサイズ可能
2. **Step 2**: セッション作成 → 一覧表示 → 選択 → 詳細表示のフロー確認
3. **Step 3**: Markdownを入力 → プレビューに即座に反映 → リロード後もDB保存済み
4. **Step 4**: チャットで「箇条書きにして」等指示 → ドキュメントが更新される
5. **Step 5**: ドキュメント更新後に「変更履歴」→ 過去版閲覧 → 「戻す」で復元

### E2Eシナリオ（MVP完成時）
1. 新規セッション「プレゼン企画」を作成
2. チャットで「AI導入のプレゼン構成を考えて」と送信
3. LLMがドキュメントを生成（中央ペインに表示）
4. 「課題の部分をもっと具体的に」と追加指示
5. ドキュメントが更新され、旧版がArchiveに保存される
6. 変更履歴から旧版を確認できる
7. セッション一覧に戻って別のセッションを選択できる

---

## 実装順序とタイムライン目安

| Step | 内容 | 依存 |
|------|------|------|
| 1 | スキャフォールド + 3ペインUI | なし |
| 2 | データ層（DB + API + Store） | Step 1 |
| 3 | Markdownエディタ + プレビュー | Step 2 |
| 4 | LLMチャット連携 | Step 2, 3 |
| 5 | Archive + Undo | Step 4 |

Step 1〜3はUI+データの基盤。Step 4がプロダクトの核心。Step 5で安全網を追加。

---

## MVP実装結果（2026-03-04）

### ステータス: 全5ステップ完了

| Step | 内容 | 状態 | 備考 |
|------|------|------|------|
| 1 | スキャフォールド + 3ペインUI | **完了** | Next.js 16.1.6 + shadcn/ui |
| 2 | データ層（DB + API + Store） | **完了** | Drizzle ORM + SQLite + Zustand |
| 3 | Markdownエディタ + プレビュー | **完了** | react-markdown + remark-gfm + typography |
| 4 | LLMチャット連携 | **完了** | Claude API (claude-sonnet-4-20250514) + SSEストリーミング |
| 5 | Archive + Undo | **完了** | スナップショットAPI + Sheet UI + Cmd+Z |

### 計画からの差分

#### react-resizable-panels API変更
- 計画時の `direction` propは、react-resizable-panels最新版で `orientation` に変更されていた
- shadcn/uiの `ResizablePanelGroup` ラッパーがそのまま渡す設計のため、`orientation="horizontal"` で使用

#### スキーマ簡略化
- 計画では `snapshots` テーブルに `section_id`, `section_heading`, `action` 等のカラムがあったが、MVPでは全文置換方式のため以下に簡略化:
  - `id`, `session_id`, `previous_content`, `summary`, `related_message_id`, `created_at`
- Phase 1.5でセクション単位更新を実装する際に拡張する

#### migrate.ts を省略
- 計画では `src/lib/db/migrate.ts` を別ファイルにする予定だったが、`db/index.ts` 内で `CREATE TABLE IF NOT EXISTS` による自動マイグレーションで対応
- MVPのスキーマが安定するまではこれで十分

#### DB接続のProxy化
- `next build` 時に複数ワーカーが同時にDBを開いて `SQLITE_BUSY` エラーになる問題が発生
- DB接続をProxy経由の遅延初期化に変更し、`busy_timeout = 5000` を設定して解決

#### セッションパネル改善
- デフォルト幅20% → 22%、minSize 15% → 18% に拡大
- セッション項目にホバーでタイトル全文表示（title属性）、更新日表示を追加

### 実装済みファイル一覧（32ファイル）

```
src/doc-forge/app/src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                   # Claude API SSEストリーミング
│   │   └── sessions/
│   │       ├── route.ts                     # GET(一覧), POST(作成)
│   │       └── [id]/
│   │           ├── route.ts                 # GET, PATCH, DELETE
│   │           ├── messages/route.ts        # GET, POST
│   │           └── snapshots/route.ts       # GET
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                             # 3ペイン ResizablePanelGroup
├── components/
│   ├── archive-drawer.tsx                   # 変更履歴Sheet + Restore
│   ├── chat-input.tsx                       # メッセージ入力 + Enter送信
│   ├── chat-message.tsx                     # メッセージ吹き出し
│   ├── chat-panel.tsx                       # SSE受信 + ストリーミング表示
│   ├── document-panel.tsx                   # Editor/Split/Preview + Undo
│   ├── markdown-editor.tsx                  # textarea + 自動リサイズ
│   ├── markdown-preview.tsx                 # react-markdown + GFM
│   ├── session-panel.tsx                    # セッション一覧 + CRUD
│   └── ui/                                  # shadcn/ui (8コンポーネント)
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── resizable.tsx
│       ├── scroll-area.tsx
│       ├── separator.tsx
│       └── sheet.tsx
└── lib/
    ├── db/
    │   ├── index.ts                         # Proxy遅延接続 + busy_timeout
    │   └── schema.ts                        # sessions/messages/snapshots
    ├── llm/
    │   ├── client.ts                        # streamChat() + chat()
    │   ├── prompt.ts                        # System Prompt + buildMessages()
    │   └── tools.ts                         # update_document tool定義
    ├── store.ts                             # Zustand (CRUD + undo + restore)
    ├── types.ts                             # Session/Message/Snapshot型
    └── utils.ts                             # shadcn/ui cn()
```

### 起動方法

```bash
cd src/doc-forge/app
cp .env.local.example .env.local   # ANTHROPIC/OPENAI/GEMINI のいずれかを設定
npm run dev
# → http://localhost:3000
```

### 検証結果

- `npm run build` — 全ルート正常コンパイル（TypeScriptエラーなし）
- `npm run dev` — HTTP 200、3ペインレイアウト表示
- Session API — POST/GET/PATCH/DELETE 全て動作確認済み
- **未検証**: LLMチャット連携のE2E（Anthropic/OpenAI/Gemini の各プロバイダで確認が必要）

### 実装アップデート（2026-03-04 追加）

- LLMプロバイダを `Anthropic` 固定から `Anthropic/OpenAI/Gemini` の自動選択方式に変更
- `LLM_PROVIDER=mock` を追加し、外部APIキー無しでE2Eを実行可能にした
- `.env.local` で `LLM_PROVIDER` が未指定なら、以下優先順でAPIキーを検出して使用:
  1. `GEMINI_API_KEY`（または `GOOGLE_API_KEY`）
  2. `OPENAI_API_KEY`
  3. `ANTHROPIC_API_KEY`
- `LLM_PROVIDER=anthropic|openai|gemini` で固定可能
- quota / rate limit エラー時は次順位プロバイダへ自動フォールバック

### 次のステップ（Phase 1.5候補）

- [ ] LLMチャットのE2E動作確認
- [ ] セクション単位の部分更新（update_section tool追加）
- [ ] アウトラインモード / フォーカスモード
- [ ] 対話履歴の自動要約（長いセッション対策）
- [ ] エクスポート機能（PDF / HTML）
