# Doc Forge スライド機能 実装計画

更新日: 2026-03-08

## Context

`doc-forge` に、対話で育てた原稿から PowerPoint を生成する機能を追加する。
要件上の正式方針は以下。

```text
doc-forge
  -> sourceMarkdown
  -> slide JSON
  -> PptxGenJS
  -> .pptx
```

現状の `doc-forge` は単一 Markdown 文書を編集するアプリであり、スライド構造、テーマ、PowerPoint 出力は未実装である。

本計画では、既存の文書機能を壊さずに `slides` モードを追加する。

## 判断済みの前提

- セッション種別は `document` と `slides` を持つ
- `sourceMarkdown` は対話で育てる下書き
- PowerPoint 出力の正本は `slideDeck` という slide JSON
- `.pptx` 生成は `pptxgenjs` を使用する
- テーマは `slide master + placeholder` 前提のプリセット + トークン UI
- V1 は `見た目が安定した .pptx` を優先し、PowerPoint 上での高度な再編集性は追わない

## フェーズ構成

実装を6フェーズに分割する。各フェーズは可能な限り単独で動作確認できる状態まで持っていく。

### Phase 0: PptxGenJS Spike
### Phase 1: データモデル / API 拡張
### Phase 2: slide planner
### Phase 3: スライド編集 UI
### Phase 4: テーマエンジン
### Phase 5: PptxGenJS renderer / export

---

## Phase 0: PptxGenJS Spike

### 目的

PptxGenJS の利用方法を `doc-forge` のランタイム上で確定し、実装リスクを潰す。

### タスク

1. `pptxgenjs` を追加する
2. 最小サンプルで `.pptx` が生成できることを確認する
3. `defineSlideMaster()` による master 定義を確認する
4. `slide.addNotes()` による speaker notes 追加を確認する
5. API route から `write({ outputType: "nodebuffer" })` または `stream()` で返せることを確認する

### 成果物

- `scripts/` または `tests/fixtures/` 配下の最小サンプル
- 出力フローの技術メモ

### 完了条件

- title slide + content slide + notes を含むサンプル deck が `.pptx` として出力できる
- Next.js / Electron 前提で server-side generation が成立する

---

## Phase 1: データモデル / API 拡張

### 目的

既存の `document` セッションと共存しつつ、`slides` セッションに必要な保存構造を追加する。

### 方針

既存 `sessions.document_content` は `document` セッション用として温存する。
`slides` セッション向けに追加カラムを持たせ、後方互換を崩さない。

### 想定スキーマ変更

#### sessions

- `artifact_type` TEXT NOT NULL DEFAULT `'document'`
- `source_markdown` TEXT NULL
- `slide_deck_json` TEXT NULL
- `theme_json` TEXT NULL
- `export_options_json` TEXT NULL
- `planner_version` TEXT NULL
- `renderer_version` TEXT NULL

#### snapshots

- `artifact_type` TEXT NOT NULL DEFAULT `'document'`
- `payload_json` TEXT NULL
- `payload_text` TEXT NULL

`document` では `payload_text` を主に使い、`slides` では `payload_json` を主に使う。

### タスク

1. DB 初期化ロジックへ migration helper を追加する
2. 既存 DB に `ALTER TABLE` で追加カラムを安全に足す
3. `src/lib/types.ts` を session union 型へ拡張する
4. `src/lib/store.ts` を artifact-aware に改修する
5. `src/app/api/sessions/**` を `artifactType` 前提に拡張する
6. snapshots API を `slides` でも復元可能な形にする

### 推奨型定義

```ts
type ArtifactType = "document" | "slides";

interface SlideDeck {
  title: string;
  subtitle?: string;
  objective?: string;
  audience?: string;
  slides: SlideSpec[];
}

interface SlideSpec {
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
```

### 完了条件

- 新規セッション作成時に `artifactType` を保存できる
- 既存 `document` セッションが従来どおり開ける
- `slides` セッションで `sourceMarkdown` と `slideDeck` を保存・再取得できる

---

## Phase 2: slide planner

### 目的

`sourceMarkdown` から `slideDeck` を生成するロジックを実装する。

### 設計方針

- 変換の骨格は deterministic rule で作る
- LLM は主に短文化、タイトル整形、bullet 圧縮に使う
- `エクスポート時だけ構成を決める` のは避け、常に slideDeck を保存する

### planner の責務

1. Markdown を AST または見出し構造へパースする
2. title / section / content / summary の slide kind を決める
3. bullet 数が閾値を超える場合は複数スライドへ分割する
4. 本文段落を bullet または body へ再配置する
5. speaker notes のベース文面を生成する
6. planner metadata を付与する

### compile options

- `maxBulletsPerSlide`
- `insertSectionDivider`
- `generateTitleSlide`
- `preferBulletsOverParagraphs`
- `includeSummarySlide`

### タスク

1. `src/lib/slides/planner.ts` を追加する
2. Markdown parser 層を追加する
3. deterministic planner を実装する
4. LLM 補助ステップを optional に切り出す
5. `POST /api/sessions/[id]/slides/plan` を追加する
6. planner 結果を DB に保存する

### テスト

- 見出しベースの分割
- bullet 分割
- title slide 自動生成
- 長文段落の圧縮
- 異常入力時の fail-safe

### 完了条件

- 固定 fixture の `sourceMarkdown` から再現可能な `slideDeck` が得られる
- `slides/plan` API が保存まで完了する

---

## Phase 3: スライド編集 UI

### 目的

slides セッション専用の UI を追加し、source / deck / chat を往復できるようにする。

### UI 方針

中央ワークスペースを artifact type で切り替える。

- `document` セッション:
  - 現状の DocumentPanel を維持
- `slides` セッション:
  - `Source`
  - `Slides`
  - `Theme`
  の3タブ構成にする

### 推奨コンポーネント

- `components/slides/slides-workspace.tsx`
- `components/slides/source-markdown-panel.tsx`
- `components/slides/slide-list.tsx`
- `components/slides/slide-detail-editor.tsx`
- `components/slides/slide-preview.tsx`
- `components/slides/slide-toolbar.tsx`

### タスク

1. 新規セッション作成 UI に artifact type 選択を追加する
2. `Home` または `DocumentPanel` を artifact-aware にする
3. sourceMarkdown エディタを移植する
4. slide list UI を追加する
5. slide detail editor を追加する
6. `スライド化` ボタンを追加する
7. slides 用の復元 / undo UI を追加する

### UX 要件

- 自動スライド化後、生成結果が一覧で読める
- 特定スライドを選ぶと title / bullets / notes を編集できる
- スライド順序変更ができる

### 完了条件

- `slides` セッションだけで source と slideDeck を UI 上から操作できる
- `document` セッションの既存体験を壊していない

---

## Phase 4: テーマエンジン

### 目的

テーマプリセットとトークン設定から、PptxGenJS master 定義を生成する。

### 設計方針

テーマは CSS ではなく、PowerPoint 的な master/layout 定義として扱う。

### 推奨ディレクトリ

```text
src/lib/slides/theme/
  presets.ts
  tokens.ts
  masters.ts
  preview.ts
```

### master の最低セット

- `TITLE_MASTER`
- `SECTION_MASTER`
- `CONTENT_MASTER`
- `SUMMARY_MASTER`

### タスク

1. theme token schema を定義する
2. 初期プリセットを 2-3 種作る
3. token -> master 定義変換を実装する
4. slide kind / layout -> masterName マッピングを実装する
5. Theme タブ UI を追加する
6. ロゴ画像等の asset 取り込み方針を決める

### テスト

- token 変更で master 定義が安定生成される
- 必須 token 欠落時に安全に fallback する

### 完了条件

- テーマ変更が slide preview と export に反映される
- 同じ theme から同じ master 定義が得られる

---

## Phase 5: PptxGenJS renderer / export

### 目的

`slideDeck + theme` から `.pptx` を生成し、ダウンロードできるようにする。

### renderer の責務

1. `new PptxGenJS()` を生成する
2. page layout を設定する
3. `defineSlideMaster()` で master を定義する
4. slideDeck を順に走査して `addSlide({ masterName })` する
5. title / bullets / body / image / table / notes を配置する
6. `write({ outputType: "nodebuffer" })` などで API 応答へ載せる

### 推奨ファイル

- `src/lib/slides/pptx/renderer.ts`
- `src/lib/slides/pptx/mappers.ts`
- `src/app/api/sessions/[id]/export/pptx/route.ts`

### タスク

1. slide kind ごとの renderer を実装する
2. bullets / body / notes の mapper を実装する
3. image / table は V1 最低限のみ対応する
4. export API を追加する
5. UI に `PowerPoint 出力` ボタンを追加する
6. エラー時の表示文言を実装する

### 出力方式

- API route 内で `.pptx` を in-memory 生成する
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` で返す
- `Content-Disposition: attachment` を付ける

### テスト

- サンプル deck の `.pptx` が生成される
- notes あり / なしを切り替えられる
- title / content / summary が想定 master を使う

### 完了条件

- UI から `.pptx` をダウンロードできる
- 最低1つのサンプル deck で手動確認を通る

---

## クロスカット課題

### 1. 既存 chat API との統合

現状の chat は `update_document` 前提なので、slides モードでは分岐が必要。

対応:

- `artifactType=document` では現状維持
- `artifactType=slides` では次のどちらかを採る
  - A. まずは chat は `sourceMarkdown` だけ更新する
  - B. 追加ツールで `slideDeck` 更新も許可する

推奨:

- 初期は A
- planner 完成後に B を段階導入

### 2. snapshot の粒度

slides では全文 Markdown snapshot では不足する。

対応:

- `sourceMarkdown` と `slideDeck` を別々に snapshot できるようにする
- restore 時は artifactType ごとに復元処理を分ける

### 3. テスト戦略

最終 `.pptx` のバイナリ完全一致テストは壊れやすい。

対応:

- planner は JSON snapshot テスト
- theme engine は master 定義 snapshot テスト
- renderer は slide count / notes / title などの構造検査を中心にする
- `.pptx` は smoke test と手動確認を併用する

---

## 推奨実装順

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

理由:

- 最初に renderer の成立を確認しないと設計全体が不安定
- 次に永続化と planner を固めないと UI が二度手間になる
- theme は renderer に依存するため後段でよい

## 直近タスク

最初の実装着手は以下の順で進める。

1. `pptxgenjs` を追加し、最小サンプルの `.pptx` 生成を確認する
2. DB / 型 / API に `artifactType=slides` と `slideDeck` 保存を追加する
3. 固定 Markdown fixture から `slideDeck` を生成する planner を実装する

## 完了条件

この計画の完了条件は以下。

- `slides` セッションを作成できる
- 対話で `sourceMarkdown` を更新できる
- `スライド化` で `slideDeck` を生成できる
- テーマを適用して `.pptx` を出力できる
- 既存 `document` セッションが壊れていない
