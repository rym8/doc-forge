# Doc Forge スライド作成 / PowerPoint出力機能 要件定義

更新日: 2026-03-08

## 1. この文書の目的

`doc-forge` に、対話で育てた資料素案をもとに PowerPoint 資料を生成する機能を追加する。

V1 では、以下のパイプラインを正式方針とする。

```text
doc-forge
  -> slide JSON
  -> PptxGenJS
  -> .pptx
```

本書では以下を定義する。

- 何を V1 で提供するか
- `slide JSON` をどう設計するか
- テーマとレイアウトをどう扱うか
- `.pptx` 出力の安定性をどう担保するか

## 2. 背景

### 2.1 ユーザーが欲しいもの

今回の要求は、次の体験である。

1. 対話でスライド資料の素案を作る
2. その素案から、適切なスライド構成を作る
3. 事前に設定したテーマを適用する
4. ボタン1つで PowerPoint 資料をエクスポートする

### 2.2 Marp ベースを採らない理由

Marp は Markdown から見た目の良いスライドを作るには強いが、今回優先したいのは `PowerPoint を第一級成果物にすること` である。

今回の用途では、次の理由から `slide JSON + PptxGenJS` の方が自然である。

- PowerPoint を直接生成できる
- レイアウトを slide / shape 単位で制御しやすい
- テーマや placeholder 設計を PowerPoint 的に扱いやすい
- 将来的に Google Slides への exporter を足しやすい

## 3. プロダクトゴール

この機能のゴールは次の一文で定義する。

**ユーザーが対話で育てた資料素案を、テーマ付きの PowerPoint 資料として安定的に出力できること。**

重視する価値は以下。

- 対話で内容を磨き続けられること
- スライド化の過程が再現可能であること
- PowerPoint ファイルとしてそのまま共有できること
- テーマをプロダクト内で管理できること

## 4. 採用する設計前提

### 4.1 slide JSON を正本にする

V1 では、スライド成果物の正本を Markdown ではなく `slide JSON` にする。

理由:

- スライド単位の追加、削除、順序変更を安定して扱える
- PptxGenJS へのマッピングが明確
- テーマ適用時に shape ごとの配置を制御しやすい
- 将来の Google Slides exporter と整合を取りやすい

### 4.2 sourceMarkdown は下書きとして残す

一方で、`doc-forge` の強みは対話で原稿を育てることにあるため、原稿用の `sourceMarkdown` は保持する。

V1 では成果物を二層で扱う。

1. `sourceMarkdown`
   - 対話で育てる原稿
   - 章立て、要点、話す順序を整理する用途
2. `slideDeck`
   - `slide JSON` 形式のスライド構造
   - `.pptx` 出力の正本

### 4.3 PptxGenJS を PowerPoint 出力エンジンとして採用する

V1 では、`.pptx` の生成は PptxGenJS を用いる。

理由:

- Node.js 環境で `.pptx` を直接生成できる
- テキスト、画像、表、チャート、ノートなどを扱える
- slide master やレイアウト共通化が可能
- 現在の `doc-forge` の Next.js / Electron 構成と相性がよい

### 4.4 テーマは CSS ではなく PowerPoint レイアウト前提で設計する

V1 のテーマは、Web CSS ではなく PowerPoint 的なレイアウト定義として扱う。
PptxGenJS の slide master / placeholder 機能を前提にする。

具体的には以下を持つ。

- デッキ全体のページサイズ
- 背景色 / 背景画像
- タイトル用フォント、本文用フォント
- 文字色、アクセント色
- タイトル帯や区切り帯の装飾
- ヘッダー / フッター
- ロゴ位置
- 各レイアウトの placeholder 定義

## 5. 推奨アーキテクチャ

### 5.1 全体パイプライン

```text
対話
  -> sourceMarkdown 作成 / 更新
  -> slide planner
  -> slide JSON 生成 / 更新
  -> PptxGenJS renderer
  -> .pptx 出力
```

### 5.2 コンポーネント責務

#### A. sourceMarkdown editor

- 対話で原稿を育てる
- 現在の `doc-forge` の主体験を維持する

#### B. slide planner

- `sourceMarkdown` をもとに slide JSON を生成する
- スライド分割、タイトル短文化、情報量調整を行う
- 必要なら LLM の補助を受ける

#### C. theme engine

- テーマプリセットとトークン設定から layout 定義を生成する
- title slide / section slide / content slide などのマスターを管理する
- PptxGenJS の `defineSlideMaster()` と placeholder 命令へ変換できる形にする

#### D. pptx renderer

- slide JSON と theme を受け取り、PptxGenJS の命令列へ変換する
- `.pptx` を生成する

## 6. 推奨データモデル

V1 では、最低限以下を保存対象とする。

```json
{
  "artifactType": "slides",
  "sourceMarkdown": "string",
  "slideDeck": {
    "title": "string",
    "subtitle": "string",
    "objective": "string",
    "audience": "string",
    "slides": [
      {
        "id": "uuid",
        "kind": "title|section|content|summary",
        "title": "string",
        "bullets": ["string"],
        "body": "string",
        "speakerNotes": "string",
        "visuals": [],
        "layout": "title-body",
        "themeVariant": "default"
      }
    ]
  },
  "theme": {
    "presetId": "corp-default",
    "tokens": {
      "pageSize": "LAYOUT_WIDE",
      "titleFontFamily": "string",
      "bodyFontFamily": "string",
      "backgroundColor": "string",
      "textColor": "string",
      "accentColor": "string",
      "headerText": "string",
      "footerText": "string",
      "logoAssetPath": "string"
    }
  },
  "exportOptions": {
    "includeSpeakerNotes": true,
    "defaultLayout": "title-body"
  }
}
```

## 7. ユーザーフロー

### 基本フロー

1. ユーザーがスライド用セッションを作成する
2. チャットで発表目的、対象読者、主張、構成案を詰める
3. `sourceMarkdown` が育つ
4. `スライド化` で slide JSON を生成する
5. スライド一覧と各ページプレビューを確認する
6. テーマを選ぶ、必要ならトークンを調整する
7. `PowerPoint 出力` で `.pptx` を生成する

### UI フロー方針

V1 では、完全なワンボタン魔法変換にはしない。
少なくとも次の 2 ステップをユーザーが踏めるようにする。

- `スライド化`
- `PowerPoint 出力`

理由:

- 自動スライド化の結果を事前確認できる
- タイトル過多、情報過多、ページ分割不足を修正できる
- 出力の不安定さを減らせる

## 8. V1 の対象範囲

### 8.1 V1 で実現すること

- スライド用セッションを新規作成できる
- `sourceMarkdown` を対話で育てられる
- `sourceMarkdown` から slide JSON を生成できる
- slide JSON を UI で確認・軽微修正できる
- テーマプリセットを選択できる
- テーマトークンを UI から変更できる
- `.pptx` を出力できる
- 出力結果を再生成できる

### 8.2 V1 であえてやらないこと

- PowerPoint 上で完全に自然な再編集性の保証
- Google Slides の同時出力
- テーマ CSS の自由編集
- 複雑なアニメーションやトランジション
- 高度な図版自動生成
- 複数人リアルタイム共同編集

## 9. 機能要件

### FR-1. セッション作成

- 新規セッション作成時に `document` と `slides` を選択できること
- `slides` 選択時に、タイトル、目的、想定読者の雛形を含む初期原稿を生成できること

### FR-2. 原稿編集

- `sourceMarkdown` は現在の `doc-forge` に近い操作感で編集できること
- チャットによる原稿更新を継続利用できること
- Markdown の見出し、箇条書き、表を保持できること

### FR-3. スライド化

- `sourceMarkdown` から slide JSON を生成できること
- スライド分割ルールを一定範囲で制御できること
  - 見出し優先
  - 1スライドあたりの最大 bullet 数
  - タイトルスライド自動生成
  - 章区切りスライド挿入
- 変換時にエラーが出ても `sourceMarkdown` を壊さないこと

### FR-4. スライド編集 UI

- slide JSON を一覧形式で確認できること
- 特定スライドを選び、内容を重点的に確認できること
- スライドの追加、削除、複製、移動ができること
- 各スライドで title / bullets / body / notes を編集できること

### FR-5. テーマ管理

- テーマプリセットを選択できること
- UI から最低限のテーマトークンを変更できること
- テーマ設定をセッション単位または再利用可能プリセットとして保存できること
- テーマ変更後にプレビューと `.pptx` 出力へ反映されること
- テーマは slide master と placeholder 配置へマッピングされること

### FR-6. PowerPoint 出力

- slide JSON と theme をもとに `.pptx` を出力できること
- 出力ファイル名にセッション名またはデッキタイトルを反映できること
- 出力失敗時は原因をユーザーへ表示できること
- 出力前に必要な依存関係をチェックできること

### FR-7. 履歴と再現性

- `sourceMarkdown` の履歴を保持すること
- slide JSON の最新状態を保持すること
- どのテーマ設定、変換条件、renderer バージョンで出力したかを記録できること

### FR-8. ノート対応

- speaker notes を slide JSON に保持できること
- 出力時に speaker notes を `.pptx` へ埋め込めること
- notes の有無を出力オプションで制御できること

## 10. 非機能要件

### NFR-1. 安定性

- 同じ slide JSON、同じ theme、同じ renderer バージョンなら、実質同じ `.pptx` が得られること
- 自動スライド化の挙動差分を追跡できること

### NFR-2. ローカル完結性

- LLM 以外の主要処理は原則ローカルで完結すること
- 出力時に外部 SaaS へ依存しないこと

### NFR-3. パフォーマンス

- 通常的な 10-30 枚の資料なら、スライド化と出力が現実的な待ち時間に収まること

### NFR-4. 保守性

- theme 定義はコードと分離し、プリセットとして追加しやすいこと
- renderer はテスト可能な純粋関数層を中心に実装すること

## 11. 主要な懸念点と提案

### 懸念1: Markdown を直接 PPTX 化しようとすると曖昧さが大きい

問題:

- 文書として自然な構成と、スライドとして自然な構成は一致しない
- エクスポート時だけ構成を決めると結果が読めない

提案:

- `sourceMarkdown -> slide JSON` の中間成果物を必ず持つ
- 自動スライド化の結果を出力前に可視化する

### 懸念2: theme を自由にしすぎると崩れる

問題:

- 任意レイアウト、任意フォント、任意装飾を全部 UI で許すと壊れやすい

提案:

- V1 はプリセット + トークン編集に絞る
- layout ごとの placeholder を明示的に固定する

### 懸念3: LLM 任せのスライド分割は不安定

問題:

- 毎回同じ資料が違う切れ方になる可能性がある

提案:

- 見出し、bullet 数、section 区切りは deterministic rule を持つ
- LLM は主に短文化、要点抽出、タイトル整形に使う

### 懸念4: PowerPoint の再編集性と出力安定性は両立しない場合がある

問題:

- 凝った見た目ほど、後から手編集しづらくなることがある

提案:

- V1 は `見た目の安定した .pptx を出す` を正式要件にする
- `PowerPoint 上での高い再編集性` は Phase 2 以降で検証する

## 12. V1 の実装方針

### Phase A: データ基盤

- セッション種別 `slides` を追加
- `sourceMarkdown` / `slideDeck` / `theme` / `exportOptions` を DB と型へ追加

### Phase B: planner

- `sourceMarkdown` から slide JSON を生成する planner を実装
- deterministic rule と LLM 補助の責務を分ける

### Phase C: editor / preview

- スライド一覧 UI
- スライド詳細 UI
- テーマプリセット選択
- テーマトークン編集 UI

### Phase D: renderer

- PptxGenJS で `.pptx` を生成する renderer を実装
- slide kind / layout ごとの mapping を実装

### Phase E: export / verify

- 出力導線
- サンプル deck の snapshot テスト
- 生成ファイルのスモークテスト

## 13. 実装開始の判断

この要件で進める場合、先に固定すべき判断は次の4点である。

1. `sourceMarkdown` は下書きとして保持する
2. PowerPoint 出力の正本は `slide JSON` にする
3. `.pptx` 生成は PptxGenJS を使う
4. V1 のテーマはプリセット + トークン UI に絞る

この方針は、現在の `doc-forge` の対話体験を維持しつつ、PowerPoint を第一級成果物にするうえで最も筋が良い。
