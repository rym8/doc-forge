# 2026-03-07 Doc Forge Windowsアプリ化 実装計画

## 1. 目的

`src/doc-forge/app` のデスクトップ実装を、macOS偏重の検証状態から
**Windows配布を安定運用できる状態**へ引き上げる。

本計画は「Windows版アプリ化の途中ステータス」を前提に、未完了項目を実装順に固定する。

---

## 2. 2026-03-07 時点の現状

### 実装済み

- `npm run dist:win` / `npm run dist:win:signed` が `package.json` に定義済み
- `electron/main.mjs` で packaged 時は `process.execPath + ELECTRON_RUN_AS_NODE` を利用
- packaged + standalone の host は loopback 固定
- 外部リンクは BrowserWindow 内遷移させず既定ブラウザへ委譲
- 署名用ワークフロー `src/doc-forge/.github/workflows/release-desktop-signed.yml` が存在
- Windows配布設計書/署名Runbook が docs に存在

### 未完了または固定不足

- Windows実機での受け入れ確認結果が未記録
- desktop packaged smoke test が未整備（現状E2Eは `npm run dev` 前提）
- `dist:win` の実行環境制約（Windows正規経路）がコード上で強制されていない
- PR段階で Windows unsigned 配布を自動検証するCIゲートがない
- 配布判定（Go/No-Go）が docs 間で分散しており、運用手順が一本化されていない

---

## 3. ゴール（Definition of Done）

以下を全て満たした時点で、Windowsアプリ化を完了とする。

1. Windows環境で `npm run dist:win` が再現性を持って成功する
2. `dist/DocForge-<version>-win-x64.exe` と `zip` を生成できる
3. クリーンWindows環境でインストール・初回起動・再起動復元が通る
4. PRまたは定期実行で Windows向け build/smoke が自動チェックされる
5. 署名あり/なし双方の運用手順が一本化され、担当者が迷わない

---

## 4. 実装フェーズ

### Phase 1: 正規ビルド経路の固定（P0）

### Task 1-1. `dist:win` の platform guard を追加

- 目的: Apple Silicon Mac など非正規経路での曖昧な失敗を即時停止する
- 実装:
  - `app/scripts/check-build-platform.mjs`（新規）を追加
  - `dist:win` / `dist:win:signed` 実行前に guard を必須化
  - 許可環境を少なくとも `win32` に限定（必要なら CI 例外フラグを追加）
- 完了条件:
  - 非Windowsで `dist:win` を実行すると即時に理由付きで失敗する

### Task 1-2. Windows実行手順を1本化

- 目的: 手順分岐を減らし、作業者差分を抑える
- 実装:
  - `src/doc-forge/setup-doc-forge.ps1` / `start-doc-forge.ps1` と `app/README.md` を同期
  - Windows build 専用コマンド列を `README` と `docs` で統一
- 完了条件:
  - 初回セットアップから `dist:win` までの手順が1通りに固定される

### Phase 2: Windows受け入れ検証の実装（P0）

### Task 2-1. packaged smoke test を追加

- 目的: 「buildは通るが起動しない」を早期検出する
- 実装:
  - `app/tests/smoke/` に desktop 向け最小シナリオを追加
  - 対象: 起動、セッション作成、保存、再起動後復元、外部リンク制御
  - ログ採取先（`app.getPath("userData")/logs/desktop.log`）を失敗時に出力
- 完了条件:
  - Windows実機/CIで smoke が再現可能に実行できる

### Task 2-2. クリーン環境検証チェックリストを運用化

- 目的: 開発機依存の見落としをなくす
- 実装:
  - 「Node未導入想定」の検証観点を明文化
  - `dist/win-unpacked` 直起動確認、インストーラ確認、永続化確認をチェック項目化
- 完了条件:
  - 各リリース候補で同一チェックリストの実施記録が残る

### Phase 3: CIゲート構築（P1）

### Task 3-1. Windows unsigned build workflow を追加

- 目的: PR時点で Windows配布破壊を検知する
- 実装:
  - `src/doc-forge/.github/workflows/windows-desktop-check.yml`（新規）
  - 実行: `npm ci` -> `npm run lint` -> `npm run build:desktop` -> `npm run dist:win`
  - 生成物（`exe`,`zip`,`builder-debug.yml` 等）を artifact として保存
- 完了条件:
  - main向けPRで Windows build 結果が常時確認できる

### Task 3-2. signed workflow との責務分離

- 目的: 「配布可能性確認」と「署名リリース」を分離する
- 実装:
  - 既存 `release-desktop-signed.yml` はタグ/手動起動専用に維持
  - 新規 unsigned workflow は PR品質ゲートとして運用
- 完了条件:
  - CIの失敗原因が build 問題か署名問題か明確に分かれる

### Phase 4: リリース運用固定（P1）

### Task 4-1. Windows配布Runbook統合

- 目的: docs分散を解消し、実運用を一本化する
- 実装:
  - 既存2文書（配布設計書・署名Runbook）と本計画を相互参照で整理
  - リリース担当向けに「最短手順」「失敗時分岐」「再実行条件」を明記
- 完了条件:
  - 新任担当でも docs だけで Windows配布を完遂できる

### Task 4-2. Go/No-Go 判定テンプレートを追加

- 目的: 主観判断を減らす
- 実装:
  - build結果、smoke結果、署名有無、既知課題の4項目で判定テンプレートを追加
- 完了条件:
  - リリース可否がテンプレートでトレース可能

---

## 5. 推奨実行順

1. Phase 1（platform guard + 手順固定）
2. Phase 2（受け入れ検証を先に成立）
3. Phase 3（CIゲート化）
4. Phase 4（運用固定）

理由:
まず「作れる環境」を固定し、次に「起動品質」を保証し、その後に自動化する方が後戻りが少ない。

---

## 6. 検証計画

### 自動検証

- `npm run lint`
- `npm run build:desktop`
- `npm run dist:win`（Windows runner）
- 追加した desktop smoke test

### 手動検証（Windows実機）

1. `exe` インストール
2. 初回起動（メニュー操作含む）
3. セッション作成・編集
4. 再起動後のデータ復元
5. 外部リンク遷移の安全動作
6. ログ確認（`desktop.log`）

---

## 7. リスクと対応

- native module build 失敗（`better-sqlite3`）
  - 対応: Node 20 / npm 10 固定、Build Tools と Python の前提チェックをスクリプト化
- SmartScreen 警告
  - 対応: 内部配布は事前周知、外部配布は signed を標準化
- docs と実装の乖離
  - 対応: workflow更新時に README / Runbook を同PRで更新する運用ルールを追加

---

## 8. この計画の到達イメージ

本計画完了後は、Windowsアプリ化が「担当者依存の作業」ではなく、
**再現可能な build + 検証 + 配布フロー**として運用できる状態になる。
