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

### いちばん簡単（macOS / ダブルクリック）

`doc-forge` フォルダ直下の以下を使います。

- `setup-doc-forge.command`（初回1回だけ）
- `start-doc-forge.command`（毎回起動）

### ターミナルから最短で使う

```bash
# claude-code 配下で作業している場合
cd src/doc-forge

# 公開リポジトリ doc-forge を単体で clone した場合
# cd doc-forge

./setup-doc-forge.sh   # 初回のみ
./start-doc-forge.sh   # 毎回
```

### Windows（PowerShell）

```powershell
# claude-code 配下で作業している場合
cd src\doc-forge

# 公開リポジトリ doc-forge を単体で clone した場合
# cd doc-forge

powershell -ExecutionPolicy Bypass -File .\setup-doc-forge.ps1   # 初回のみ
powershell -ExecutionPolicy Bypass -File .\start-doc-forge.ps1   # 毎回
```

### app 配下で直接実行したい場合

```bash
# claude-code 配下で作業している場合
cd src/doc-forge/app

# 公開リポジトリ doc-forge を単体で clone した場合
# cd doc-forge/app

npm run setup:local   # npm ci + .env.local 自動作成
npm run start:local   # 開発サーバー起動
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
npm run test:desktop:smoke
```

E2E 実行例:

```bash
LLM_PROVIDER=mock npm run test:e2e
LLM_PROVIDER=gemini npm run test:e2e
```

Desktop smoke（Windows向け配布物）実行例:

```bash
npm run dist:win
LLM_PROVIDER=mock npm run test:desktop:smoke
```

補足:

- `test:desktop:smoke` は Windows 専用です
- 先に `dist:win` で `dist/win-unpacked` を生成してから実行してください
- 調査用に一時ファイルを残したい場合は `DOC_FORGE_DESKTOP_SMOKE_KEEP_ARTIFACTS=1` を指定します

## standalone 実行（ローカルアプリ化 Step 1）

Electron同梱を想定した `standalone` 出力で単体起動できます。

```bash
npm run build
PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

配布済み Electron アプリでは、この `server.js` をアプリ同梱の Electron ランタイムで起動します。
配布先の macOS / Windows に system `node` が入っていることは前提にしません。

必要な環境変数（必須/任意）は以下です。

- `PORT`（任意）: 待ち受けポート。未指定時は `3000`
- `HOSTNAME`（任意）: 待ち受けホスト。ローカル用途は `127.0.0.1` 推奨
- `LLM_PROVIDER`（任意）: `mock` / `gemini` / `openai` / `anthropic`
- `GEMINI_API_KEY` または `GOOGLE_API_KEY`（任意）
- `OPENAI_API_KEY`（任意）
- `ANTHROPIC_API_KEY`（任意）
- `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL`（任意）
- `DOC_FORGE_DB_PATH`（任意）: DB保存先の上書き
- `DOC_FORGE_CREDENTIALS_SECRET`（任意）: 保存キー暗号化のマスターシークレット
- `DOC_FORGE_CREDENTIALS_SECRET_PATH`（任意）: 保存キー暗号化ファイルの保存先

外部APIなしで動作確認する場合は、`LLM_PROVIDER=mock` を指定します。

## Electron で起動（ローカルアプリ化 Step 2）

専用ウィンドウで Doc Forge を起動できます。

```bash
npm install
npm run desktop:dev
```

既定では Electron が Next 開発サーバーを子プロセスで起動し、`http://127.0.0.1:3210` を表示します。
必要に応じて次の環境変数を使えます。

- `DOC_FORGE_DESKTOP_SERVER`（任意）: `dev` または `standalone`
- `DOC_FORGE_DESKTOP_PORT`（任意）: 既定 `3210`
- `DOC_FORGE_DESKTOP_HOST`（任意）: 既定 `127.0.0.1`

`standalone` モードを使う場合は先に `npm run build` を実行してください。

補足:

- packaged + `standalone` では待ち受け host は常に `127.0.0.1` に固定されます。
- `DOC_FORGE_DESKTOP_HOST` は開発時の検証用です。配布版では `0.0.0.0` などへ変更できません。
- Markdown 内の外部リンクはアプリ内へ遷移せず、既定ブラウザで開きます。

## デスクトップUX改善（ローカルアプリ化 Step 4）

`npm run desktop:dev` で起動した場合、次の補助機能が有効になります。

- ネイティブメニュー:
  - `再読み込み`
  - `ログを表示`
  - `データフォルダを開く`
- 初回起動ガイド:
  - 初回のみ、LLMキー設定導線（`メニュー -> 設定 -> LLMキー設定`）を表示

ログファイルの保存先:

- `app.getPath("userData")/logs/desktop.log`

## 配布パッケージ作成（ローカルアプリ化 Step 5）

配布用ビルドは次の順で実行します。

```bash
npm run build:desktop
```

`build:desktop` は以下を行います。

- `src/app/icon.png` を `electron/assets/icon.png` に同期（Windows/macOSのアプリアイコン）
- Next.js を `standalone` でビルド
- 配布に必要な `public` / `.next/static` を `.next/standalone` 配下へ同期
- electron-builder は `.next/standalone` を packaging 専用 project dir として使い、root の `node_modules` を直接 rebuild しません

配布物生成コマンド:

- 現在OS向け: `npm run dist:current`
- macOS向け（dmg + zip）: `npm run dist:mac`
- Windows向け（nsis + zip）: `npm run dist:win`
- インストーラなし展開物確認: `npm run pack:dir`

注意:

- `dist:win` / `dist:win:signed` は platform check により Windows 以外では fail-fast します。
- 非推奨ですが、どうしても強制実行する場合は `DOC_FORGE_ALLOW_UNSUPPORTED_BUILD_PLATFORM=1` を付けて実行できます。
- Windows向け配布物は Windowsマシン上、または Windows runner（CI）での生成を推奨します。
- 署名なし配布物は初回起動時に OS の警告が出る場合があります。

出力先:

- `dist/`
- 生成ファイル名形式: `DocForge-${version}-${os}-${arch}.${ext}`

## 署名と配布セキュリティ（ローカルアプリ化 Step 6）

署名付き配布物を作る場合は、先に署名用環境変数を設定してから実行します。

### 署名ビルドコマンド

- macOS署名 + notarize前提: `npm run dist:mac:signed`
- Windows署名前提: `npm run dist:win:signed`

上記コマンドでは、実行前に環境変数チェックが走ります。

### 必要な環境変数

macOS:

- 証明書（必須）: `CSC_LINK`, `CSC_KEY_PASSWORD`
- notarize（どちらか必須）
  - API Key方式: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - Apple ID方式: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

Windows:

- `CSC_LINK`, `CSC_KEY_PASSWORD`

### CIテンプレート

GitHub Actions のテンプレートを以下に追加しています。

- `src/doc-forge/.github/workflows/release-desktop-signed.yml`
- `src/doc-forge/.github/workflows/windows-desktop-check.yml`

- `release-desktop-signed.yml`: macOS/Windows の署名済み配布物を `dist/` へ生成
- `windows-desktop-check.yml`: PR/main push で Windows unsigned 配布ビルドと desktop smoke を検証

## データ保存

- ターミナル起動（`npm run dev` / `npm run start:local`）:
  - セッションと文書: `data/*.db`
  - 保存キー用の暗号化鍵: `data/.doc-forge-credentials.key`
- Electron起動（`npm run desktop:dev`）:
  - `app.getPath("userData")/data/doc-forge.db`
  - `app.getPath("userData")/data/.doc-forge-credentials.key`

Step 3 以降、Electron初回起動時は次のファイルを自動移行します（移行先が未作成の場合のみ）。

- `app/data/doc-forge.db`（必要に応じて `-wal`, `-shm` も）
- `app/data/.doc-forge-credentials.key`

`data` 配下は公開リポジトリに含めない運用を推奨します。

## 公開時の注意

- `.env*` はコミットしない
- API キーは README やサンプル画像にも載せない
- 万一漏えいが疑われる場合はすぐにキーを再発行する

## ライセンス

このリポジトリには `MIT License` を付与しています。  
商用利用、改変、再配布を許可しつつ、著作権表示とライセンス文の同梱を求めるライセンスです。
