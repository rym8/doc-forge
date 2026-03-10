# 2026-03-07 Doc Forge ローカルアプリ是正実装計画

## 1. この計画の目的

2026-03-07 時点のローカルアプリ化実装は、PoC としては成立しているが、
レビュー結果から「他者へ安心して配布できる品質」には未達と判断した。

この計画では、レビューで出た問題を優先度順に整理し、
**配布事故・セキュリティ事故・運用回帰を先に潰すための実装順**を定義する。

---

## 2. レビュー結果の要約

### Must Fix

1. 配布版が外部 `node` 実行環境に依存している
2. `dist:*` 実行後に `better-sqlite3` の ABI が崩れ、通常の Node/E2E 実行系が壊れる
3. Electron の外部ナビゲーション制御がなく、文書リンクからアプリ本体が外部サイトへ遷移できる
4. `DOC_FORGE_DESKTOP_HOST` を変えると無認証 API を LAN に露出し得る

### Should Fix

5. Windows 配布物の生成戦略が Apple Silicon ローカルでは成立しない
6. API 入力バリデーションが薄く、不正入力で壊れやすい
7. `spawn` エラー処理と packaged smoke test が不足している

### Nice to Have

8. `asar` 無効のままで改ざん耐性が弱い
9. アイコン未設定、初回警告低減のための最終配布品質調整が未完了

---

## 3. 是正方針

- 先に **配布成立性** を直す
- 次に **セキュリティ境界** を閉じる
- その後に **Windows 配布・回帰テスト・配布品質** を上げる

この順番にしないと、署名や自動更新へ進んでも基礎が不安定なままになる。

---

## 4. 実装フェーズ

## Phase 0: リリースゲートの明文化

### 目的

未修正の状態で配布が進むのを防ぐ。

### 実装タスク

1. 現状を「内部検証版」と明記する
2. 配布判定条件をこの文書に固定する
3. README にも「配布前に修正必須の項目」があることを短く追記する

### 完了条件

- Must Fix を潰すまで「正式配布可能」とは扱わないと明文化されている

---

## Phase 1: 配布版を自己完結させる

### P0-1. packaged app の外部 Node 依存を解消

#### 目的

Node 未導入の配布先でもアプリが起動するようにする。

#### 実装方針

- `electron/main.mjs` の standalone 起動で外部 `node` を呼ばない
- packaged 時は `process.execPath` を使い、`ELECTRON_RUN_AS_NODE=1` で server.js を起動する方式を第一候補とする
- `spawn` の `error` ハンドラを追加し、起動失敗時に明示エラーを出す

#### 主対象

- `src/doc-forge/app/electron/main.mjs`
- `src/doc-forge/app/README.md`

#### 完了条件

- system の `node` が PATH になくても packaged app が起動する

#### 検証

- `PATH` から `node` を外した状態で packaged app を起動
- 初回画面表示、セッション作成、終了まで通ること

---

### P0-2. 配布ビルドと通常開発環境の ABI 汚染を分離

#### 目的

`dist:*` 実行後に E2E や `npm run dev` が壊れないようにする。

#### 実装方針

- Electron 配布用の staging/workdir を分離する
- `electron-builder` / native module rebuild は staging 側で完結させる
- source tree の `node_modules` は Node 実行用のまま維持する

#### 候補アプローチ

1. `.desktop-build/` のような専用ディレクトリを作り、そこへ package root を生成して packaging する
2. staging 側だけで `better-sqlite3` を Electron ABI 向けに rebuild する
3. source tree 側には post-package の restore を不要にする

#### 主対象

- `src/doc-forge/app/package.json`
- `src/doc-forge/app/scripts/prepare-standalone-assets.mjs`
- 新規 packaging staging script

#### 完了条件

- `npm run dist:mac` 実行後でも `npm run dev` と `LLM_PROVIDER=mock npm run test:e2e` が通る

#### 検証

- `dist:mac` 実行
- 続けて `npm run lint`
- 続けて `LLM_PROVIDER=mock npm run test:e2e`

---

## Phase 2: デスクトップ境界を閉じる

### P0-3. BrowserWindow の外部遷移を遮断

#### 目的

Markdown 内リンクや外部遷移で、アプリ本体が意図せず外部サイトへ遷移しないようにする。

#### 実装方針

- `webContents.on("will-navigate")` でローカルサーバー以外への遷移を拒否
- `setWindowOpenHandler` で新規ウィンドウを拒否
- `http` / `https` リンクは必要なら `shell.openExternal` へ逃がす
- renderer 側でもリンク描画時に `target="_blank"` と安全属性を付与する

#### 主対象

- `src/doc-forge/app/electron/main.mjs`
- `src/doc-forge/app/src/components/markdown-preview.tsx`

#### 完了条件

- アプリ本体はローカル UI 以外へ遷移しない

#### 検証

- 文書に外部 URL を書いてクリック
- BrowserWindow 内で遷移せず、必要なら外部ブラウザだけが開く

---

### P0-4. packaged mode のホスト公開を禁止

#### 目的

無認証 API が LAN に露出する事故を防ぐ。

#### 実装方針

- packaged mode では `DOC_FORGE_DESKTOP_HOST` を無視し、`127.0.0.1` 固定にする
- 開発時のみホスト上書きを許可する
- 必要なら `localhost`, `127.0.0.1`, `::1` の loopback のみ許可する

#### 主対象

- `src/doc-forge/app/electron/main.mjs`
- `src/doc-forge/app/README.md`

#### 完了条件

- packaged app が loopback 以外で listen しない

#### 検証

- packaged mode で `DOC_FORGE_DESKTOP_HOST=0.0.0.0` を与えても loopback 固定になること
- `lsof` などで bind 先を確認

---

## Phase 3: 回帰を止める

### P1-1. desktop smoke test を追加

#### 目的

「ビルドできるが起動しない」を CI とローカルで早期検知する。

#### 実装方針

- packaged app の最小 smoke test を追加
- チェック対象:
  - 起動
  - セッション作成
  - 文書保存
  - 再起動復元

#### 主対象

- Playwright / 追加テストスクリプト
- packaging scripts

#### 完了条件

- 配布判定に desktop smoke test が含まれる

---

### P1-2. API request validation を追加

#### 目的

ローカル用途でも、壊れた入力で API や DB が不安定になるのを防ぐ。

#### 実装方針

- `sessions`, `chat`, `settings` API に最小バリデーションを追加
- 文字数上限、必須項目、型不正を 4xx で返す
- 未知フィールドの扱いも決める

#### 主対象

- `src/doc-forge/app/src/app/api/sessions/route.ts`
- `src/doc-forge/app/src/app/api/sessions/[id]/route.ts`
- `src/doc-forge/app/src/app/api/chat/route.ts`
- `src/doc-forge/app/src/app/api/settings/llm-credentials/route.ts`

#### 完了条件

- 主要 API が不正入力で 500 を返さない

---

## Phase 4: 配布運用を安定化

### P1-3. Windows 配布の正式経路を固定

#### 目的

Apple Silicon ローカルで失敗する `dist:win` を「想定どおりの制約」にする。

#### 実装方針

- arm64 Mac では `dist:win` を fail-fast で止める
- Windows 実機または Windows runner を正規生成経路にする
- Windows 用 smoke test を別途追加する

#### 主対象

- `src/doc-forge/app/package.json`
- `src/doc-forge/app/scripts/check-signing-env.mjs` または新規 platform check script
- `src/doc-forge/.github/workflows/release-desktop-signed.yml`
- `src/doc-forge/app/README.md`

#### 完了条件

- Windows 配布物の生成場所と検証手順が1通りに固定されている

---

### P1-4. packaging hardening

#### 目的

改ざん耐性と配布品質を底上げする。

#### 実装方針

- `asar: true` を基本に戻し、必要なものだけ `asarUnpack` へ出す
- `better-sqlite3` など native module の unpack 方針を明示
- app icon を追加

#### 主対象

- `src/doc-forge/app/package.json`
- app icon assets

#### 完了条件

- electron-builder の主要警告が解消される

---

## 5. 着手順

1. P0-1 packaged app の Node 依存解消
2. P0-2 packaging と通常開発環境の分離
3. P0-3 外部ナビゲーション遮断
4. P0-4 loopback 固定
5. P1-1 desktop smoke test
6. P1-2 API validation
7. P1-3 Windows 正規配布経路
8. P1-4 packaging hardening

この順番なら、まず「起動できるか」「壊れないか」「外へ漏れないか」を先に固められる。

---

## 6. 配布再開の判定基準

以下を満たしたら「他者へ配布してよい」状態とみなす。

- packaged app が system `node` なしで起動する
- `dist:mac` 実行後に `npm run dev` / `npm run test:e2e` が壊れない
- BrowserWindow が外部 URL へ直接遷移しない
- packaged mode で loopback 以外に bind しない
- desktop smoke test が成功する
- macOS 配布物をクリーン環境で起動確認済み

Windows を含めて配布再開する条件:

- Windows runner または Windows 実機で `dist:win` 成功
- Windows 実機で起動確認済み

---

## 7. この計画の結論

次にやるべきことは、新機能追加ではなく **P0 是正** である。
特に以下の2点を最優先にする。

- 配布版を自己完結させる
- packaging と通常開発環境を分離して回帰を止める

この2点が終わるまでは、ローカルアプリ版は「内部検証版」として扱うのが妥当。
