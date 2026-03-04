# Doc Forge

Doc Forge は、対話しながら Markdown 文書を育てていくローカル向けアプリです。  
チャットで要件を整理しつつ、ドキュメントを同時に更新していけます。

## 目的

- 思考中のメモを、実際に使える文書へ短時間で引き上げる
- 会話の流れを残しながら、本文を継続的に改善する
- 複数の LLM を切り替えずに使える実運用の土台を作る

## 主な機能

- チャットとドキュメントを1画面で編集
- 初期は空の文書から開始し、対話に応じて本文を自動で構造化
- セッションの作成、切り替え、削除、タイトル編集
- LLM キーの画面設定と暗号化保存
- Gemini / OpenAI / Claude の自動選択
- quota / rate limit 発生時の自動フォールバック
- Playwright による E2E テスト

## 動作環境

- Node.js 20 以上
- npm 10 以上

## セットアップと起動

まず `doc-forge/app` フォルダへ移動します。

```bash
# claude-code 配下で作業している場合
cd src/doc-forge/app

# 公開リポジトリ doc-forge を単体で clone した場合
# cd doc-forge/app
```

次に依存関係を入れて、環境変数ファイルを作成します。

```bash
npm install
cp .env.local.example .env.local
```

起動コマンド:

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 使い方

1. 左上の `メニュー` から `新規セッション` を作成
2. 右側のチャットに要件や意図を入力
3. 左側の `Document` で本文を確認
4. 必要に応じて `編集 / 両方 / プレビュー` を切り替え
5. セッション名は一覧で対象行を選択して編集

## LLM キー設定

左上の `メニュー` を開き、`設定` タブの `LLMキー設定` で管理します。

- どれか1つのキーがあれば利用開始できます
- 優先順は `Gemini -> OpenAI -> Claude`
- 実行中に quota / rate limit が出たら次のプロバイダへ自動フォールバック
- 画面で保存したキーは環境変数より優先
- 保存キーはサーバー側で暗号化して SQLite に保存

環境変数でも設定できます。

- `GEMINI_API_KEY` または `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

`LLM_PROVIDER` を指定すると先頭プロバイダを固定できます。  
例: `LLM_PROVIDER=gemini`  
外部APIを使わずに確認したい場合は `LLM_PROVIDER=mock` を使います。

## 開発コマンド

```bash
npm run dev
npm run lint
npm run build
npm run test:e2e
```

E2E 実行例:

```bash
LLM_PROVIDER=mock npm run test:e2e
LLM_PROVIDER=gemini npm run test:e2e
```

## データ保存

- セッションと文書: `data/*.db`
- 保存キー用の暗号化鍵: `data/.doc-forge-credentials.key`

`data` 配下は公開リポジトリに含めない運用を推奨します。

## 公開時の注意

- `.env*` はコミットしない
- API キーは README やサンプル画像にも載せない
- 万一漏えいが疑われる場合はすぐにキーを再発行する

## ライセンス

このリポジトリには `MIT License` を付与しています。  
商用利用、改変、再配布を許可しつつ、著作権表示とライセンス文の同梱を求めるライセンスです。
