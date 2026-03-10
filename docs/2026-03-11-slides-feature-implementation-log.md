# Doc Forge スライド機能 実装ログ

更新日: 2026-03-11

## 概要

本ドキュメントは、Doc Forge のスライド作成・出力機能群に対して行った一連の実装・改善を記録する。
対象コミット: `12800ba` → `45c8280` → `1aa56d6` → `bd17241`

---

## P0: スライドモード統合 + E2Eタイムアウト調整

### 内容

- スライドモードにも `ChatPanel`（`artifactMode="slides"` モード）を表示し、ドキュメントモードと同様にチャットで原稿を操作できるようにした
- Playwright の `expect.timeout` を実 LLM プロバイダーに合わせて延長（15s → 45s、テスト全体 90s）

### 変更ファイル
- `src/app/page.tsx`
- `playwright.config.ts`
- `tests/e2e/chat-flow.spec.ts`

---

## P1: スライドプレビュー強化・新テーマ・DnD並べ替え

### スライドプレビュー（`slide-preview.tsx`）

レイアウトごとに視覚的な表現を大幅強化。

| レイアウト | 追加表現 |
|---|---|
| `title-body` / `section` | アクセントカラーのヘッダーバンド、セクションに左ボーダー |
| 箇条書き | テーマカラーのカスタム bullet |
| `two-column` | 2カラム分割表示 |
| `flow-horizontal` | 番号付きフローステップ（丸数字） |
| `four-panel` | 4分割パネルレイアウト |
| テーブル | テーマ色のヘッダー行、ストライプ行 |

発表者ノート（`speakerNotes`）をプレビュー下部に常時表示するようにした。

### 新テーマプリセット（`theme.ts`）

既存の3プリセットに加え、5プリセットを追加（計8種）。

| プリセットID | 特徴 |
|---|---|
| `tech-minimal` | ダークネイビー・モノ、技術系 |
| `warm-business` | アンバー系、ウォームトーン |
| `ocean-professional` | ティール・ブルー系 |
| `pastel-workshop` | パステルパープル、ソフトトーン |
| `monochrome-print` | モノクロ印刷対応 |

### スライドリスト DnD並べ替え（`slide-list.tsx`）

上下ボタンによる並べ替えを廃止し、`@dnd-kit` によるドラッグ＆ドロップ並べ替えに切り替えた。

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

`SortableContext` + `DragOverlay` で滑らかな並べ替えを実現。

---

## P2: テーマ比較プレビュー

### 内容

テーマタブのプリセット一覧にホバーすると、「現在のテーマ」と「ホバー中のプリセット」を横並びで比較できるようにした。

```tsx
// slides-workspace.tsx
const [comparePreset, setComparePreset] = useState<SlideTheme | null>(null);

onMouseEnter={() => setComparePreset(preset)}
onMouseLeave={() => setComparePreset(null)}
```

---

## P3-1: マルチプロバイダー対応 UI

### 内容

チャットパネルにモデルセレクター（`auto / Claude / GPT-4o / Gemini / Mock`）を追加。
選択したプロバイダーはリクエストヘッダー `X-LLM-Provider` で API に渡す。

```tsx
// chat-panel.tsx
<select value={provider} onChange={(e) => setProvider(e.target.value)}>
  <option value="auto">auto</option>
  <option value="anthropic">Claude</option>
  <option value="openai">GPT-4o</option>
  <option value="gemini">Gemini</option>
  <option value="mock">Mock</option>
</select>
```

API 側（`/api/chat/route.ts`）でヘッダーを読み取り `chatWithProvider()` を分岐。

### Gemini サポート（`llm/client.ts`）

```
GEMINI_API_KEY または GOOGLE_API_KEY を .env.local に設定
```

`chatGemini()` 関数を追加。Gemini 1.5 Flash を使用。
フォールバック優先順位: Gemini → OpenAI → Anthropic → Mock。

---

## P3-2: PDF プレビュー出力

スライドデッキを HTML に変換し `window.print()` でブラウザの印刷ダイアログに渡す簡易 PDF 出力機能。

```tsx
const printSlidesAsPdf = useCallback(() => {
  const html = buildPrintHtml(draftDeck, draftTheme);
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.print();
}, [draftDeck, draftTheme]);
```

`@page { size: A4 landscape; }` で横向きA4固定。テーマのフォント・色を反映。

---

## P3-3: セッションテンプレート

新規セッション作成時に5種のビジネステンプレートから選択できるようにした（`lib/templates.ts`）。

| テンプレート | 用途 |
|---|---|
| 事業計画提案 | 提案・稟議書 |
| プロジェクトキックオフ | 背景・ゴール・チーム・スケジュール |
| 週次レポート | KPI・進捗・リスク・ネクストアクション |
| 製品ロードマップ | ビジョン・フェーズ別ロードマップ |
| 調査・分析レポート | サマリー・方法論・分析・推奨事項 |

`session-panel.tsx` でテンプレートシートを開き、選択した Markdown を新規セッションの初期コンテンツとして挿入。

---

## P2 スライド拡張: 画像生成・Google Drive・Electron 対応

### AI 画像生成（`/api/sessions/[id]/generate-image`）

スライド詳細エディタから直接 AI 画像生成を起動できるようにした。

- Gemini API の `imagen-3.0-generate-002` を使用（Gemini キー必要）
- 生成画像をセッションのアセットとして `/api/sessions/[id]/assets` に保存
- 生成後に `imageUrl` フィールドへ自動挿入

```typescript
// generate-image/route.ts
const result = await ai.models.generateImages({
  model: "imagen-3.0-generate-002",
  prompt: body.prompt,
  config: { numberOfImages: 1, aspectRatio: "16:9" },
});
```

### Google Drive アップロード（`/api/sessions/[id]/export/google-drive`）

1. PPTX を生成（`pptxgenjs`）
2. Google Drive API で Google Slides としてアップロード
3. 返り値の URL をステータスバーにリンク表示

Google OAuth フロー（`/api/google-auth/`）:
- `/authorize` → Google 認証ページへリダイレクト
- `/callback` → アクセストークン取得 → DB に暗号化保存
- `/disconnect` → トークン削除

トークンは `credentials-crypto.ts`（AES-256-GCM）で暗号化し `data/.doc-forge-credentials.key` に鍵を保管（.gitignore 対象）。

### Electron アセット修正（`electron/main.mjs`）

デスクトップアプリで画像アセット（セッション画像）を正しく配信するため、
`/api/sessions/[id]/assets/[fileName]` のリクエストを Next.js スタンドアロンサーバーに透過するよう修正。

---

## UX 改善まとめ（2026-03-11）

### 1. スライドモードからチャットパネルを除去

**変更前**: スライドモードでもドキュメントモードと同じ 62/38 の ResizablePanelGroup レイアウト（左: Workspace, 右: ChatPanel）
**変更後**: `SlidesWorkspace` が全幅表示。チャットパネルは不要と判断し除去。

```tsx
// page.tsx (変更後)
{hasSession && slidesViewMode === "slides" ? (
  <SlidesWorkspace />
) : (
  <ResizablePanelGroup ...>
    <DocumentPanel />
    <ChatPanel />
  </ResizablePanelGroup>
)}
```

### 2. スライドプレビューのスケールバグ修正（タブ切り替え）

**問題**: スライド↔テーマタブを切り替えるとプレビューのスケールが壊れ、右側にはみ出す。

**原因**: `useRef` は ref が DOM から外れても再実行されない。テーマタブに切り替えるとプレビューパネルの DOM がアンマウントされ、`ResizeObserver` の接続が切れる。

**解決**: `useRef` の代わりに `useState<HTMLDivElement | null>` + ref コールバック（`ref={setPreviewPanelEl}`）を使用。DOM の attach/detach に連動して `useEffect` が再実行される。

```tsx
const [previewPanelEl, setPreviewPanelEl] = useState<HTMLDivElement | null>(null);

useEffect(() => {
  if (!previewPanelEl) return;
  const observer = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width - 32;
    if (width > 0) setPreviewScale(width / SLIDE_DESIGN_WIDTH);
  });
  observer.observe(previewPanelEl);
  return () => observer.disconnect();
}, [previewPanelEl]);  // ← previewPanelEl が変わるたびに再実行
```

固定デザイン幅: `SLIDE_DESIGN_WIDTH = 640px`、`SLIDE_DESIGN_HEIGHT = 360px`（16:9）。
プレビューコンテナの高さを `SLIDE_DESIGN_HEIGHT * previewScale` で管理。

### 3. 差分バナーの × 閉じるボタン追加

スライド編集時に表示される「未保存の変更」バナーが常時表示されて邪魔なため、× ボタンで非表示にできるようにした。

```tsx
const [diffDismissed, setDiffDismissed] = useState(false);

// deckDiffItems が変化したら自動でリセット（新しい差分発生時は再表示）
useEffect(() => {
  setDiffDismissed(false);
}, [deckDiffItems.length]);

{deckDiffItems.length > 0 && !diffDismissed && (
  <div className="flex items-start gap-2 px-4 py-2">
    <div className="flex-1"><ChangesSummary ... /></div>
    <button onClick={() => setDiffDismissed(true)} aria-label="閉じる">
      <XIcon className="h-3.5 w-3.5" />
    </button>
  </div>
)}
```

### 4. 「スライド保存」→ エクスポートダイアログに変更

**変更前**: スライドタブの「スライド保存」ボタンはデッキをDBに保存するのみ。テーマタブに「Go: PowerPoint」「Go: Google Slides」「Go: Drive Upload」「PDF プレビュー」ボタンが存在。

**変更後**:
- 「スライド保存」ボタンをクリック → エクスポート先選択ダイアログが開く
- ダイアログ内でエクスポート先を選択 → **自動的に未保存の変更を先に保存してからエクスポート**
- テーマタブの「Step 3: テーマを確認して Go」ブロックを完全削除（テーマタブはテーマ設定のみ）

```tsx
// handleSaveAndExport
const handleSaveAndExport = useCallback(
  async (kind: "pptx" | "google-slides" | "drive" | "pdf") => {
    setExportDialogOpen(false);
    // 未保存の変更があれば先に保存（タイトルスライド欠損防止）
    if (draftDeck && deckDiffItems.length > 0) {
      await saveDeck(draftDeck);
    }
    if (kind === "pdf") printSlidesAsPdf();
    else if (kind === "drive") await handleUploadToGoogleDrive();
    else await handleExportArtifact(kind);
  },
  [...]
);
```

### 5. タイトルスライド欠損バグの修正

**問題**: エクスポート API はDB（`session.slideDeck`）を読む。「スライド保存」を押さずにエクスポートすると、未保存のスライド編集がPPTXに反映されない（タイトルスライドが消えたように見える）。

**解決**: `handleSaveAndExport` で `deckDiffItems.length > 0` の場合に `saveDeck()` を先に呼ぶことで、DB が常に最新状態でエクスポートされることを保証。

---

## アーキテクチャ概要（現在）

```
doc-forge/app/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # ルートレイアウト（ドキュメント/スライドモード切替）
│   │   └── api/
│   │       ├── sessions/               # セッション CRUD + スナップショット
│   │       │   └── [id]/
│   │       │       ├── messages/       # LLM チャット
│   │       │       ├── slides/plan/    # スライド自動生成（LLM）
│   │       │       ├── export/pptx/    # PPTX 生成
│   │       │       ├── export/google-slides-script/  # Google Slides 互換 PPTX
│   │       │       ├── export/google-drive/          # Drive アップロード
│   │       │       ├── assets/         # 画像アップロード
│   │       │       └── generate-image/ # AI 画像生成（Gemini Imagen）
│   │       ├── google-auth/            # OAuth フロー
│   │       └── settings/               # LLM キー・Google OAuth 設定
│   ├── components/
│   │   ├── slides/
│   │   │   ├── slides-workspace.tsx    # スライドモードのメインコンテナ
│   │   │   ├── slide-list.tsx          # DnD ソート対応スライドリスト
│   │   │   ├── slide-detail-editor.tsx # スライド詳細編集（画像/テーブル）
│   │   │   ├── slide-preview.tsx       # リアルタイムプレビュー
│   │   │   └── changes-summary.tsx     # 差分バナー
│   │   ├── document-panel.tsx          # Markdown エディタ + プレビュー
│   │   ├── chat-panel.tsx              # LLM チャット（プロバイダー選択付き）
│   │   ├── session-panel.tsx           # セッション管理 + テンプレート選択
│   │   └── google-oauth-settings.tsx   # Google Drive 連携設定
│   └── lib/
│       ├── slides/
│       │   ├── planner.ts              # LLM → SlideSpec[] 変換
│       │   ├── pptx.ts                 # PptxGenJS レンダリング
│       │   ├── theme.ts                # テーマプリセット（8種）
│       │   ├── diff.ts                 # スライド差分計算
│       │   ├── normalize.ts            # スライドデータ正規化
│       │   └── reconcile.ts            # 原稿読み込み時の差分マージ
│       ├── llm/
│       │   ├── client.ts               # Gemini/OpenAI/Anthropic/Mock
│       │   └── credentials.ts          # APIキー解決ロジック
│       └── google/
│           ├── oauth.ts                # OAuth トークン管理
│           └── credentials.ts          # Drive 認証情報暗号化
├── tests/e2e/
│   └── chat-flow.spec.ts               # Playwright E2E テスト（6テスト）
└── electron/
    └── main.mjs                        # デスクトップアプリエントリ
```

---

## スライドデータ型（`SlideSpec`）

```typescript
type SlideSpec = {
  id: string;
  kind: "title" | "content" | "section" | "blank";
  title?: string;
  bullets?: string[];
  body?: string;
  speakerNotes?: string;
  layout: "title-body" | "two-column" | "flow-horizontal" | "four-panel" | "image-left" | "image-right" | "full-image";
  themeVariant?: "default" | "accent" | "muted";
  visuals?: Array<{
    type: "image" | "table";
    imageUrl?: string;
    imageCaption?: string;
    tableData?: string[][];
    tableCaption?: string;
  }>;
};
```

---

## テーマプリセット一覧

| presetId | 背景 | アクセント | タイトルフォント |
|---|---|---|---|
| `corp-default` | #FFFFFF | #1E3A5F | Arial |
| `midnight-boardroom` | #0F172A | #38BDF8 | Georgia |
| `sakura-light` | #FFF5F7 | #E91E8C | Hiragino Sans |
| `tech-minimal` | #F8F9FA | #2D3748 | JetBrains Mono |
| `warm-business` | #FFFBF5 | #D97706 | Georgia |
| `ocean-professional` | #F0F9FF | #0369A1 | Source Sans Pro |
| `pastel-workshop` | #FAF5FF | #7C3AED | Nunito |
| `monochrome-print` | #FFFFFF | #111827 | Arial |

---

## 残課題・将来対応

- [ ] Electron デスクトップ版での Google Drive OAuth フロー（ブラウザリダイレクト問題）
- [ ] スライド内テキストの LLM によるブラッシュアップ機能
- [ ] スライドごとの AI 画像自動提案（原稿内容から prompt 生成）
- [ ] テンプレートのユーザーカスタマイズ・保存
- [ ] ドキュメントモードとスライドモード間の双方向同期（原稿 ↔ スライド）
