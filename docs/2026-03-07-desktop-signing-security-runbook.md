# 2026-03-07 Doc Forge デスクトップ署名と配布セキュリティ Runbook

## 1. 目的

Step 5 で作成した配布物を、実運用向けに「署名済み」で出荷するための手順を固定する。
対象は `src/doc-forge/app` 配下の Electron 配布フロー。

---

## 2. 生成物

- macOS: `dmg`, `zip`
- Windows: `nsis`, `zip`
- 出力先: `app/dist/`

---

## 3. 前提

- Node.js 20 / npm 10
- `npm ci` 済み
- `electron-builder` 利用可能

---

## 4. 秘密情報の管理方針

- 証明書・パスワードは **ローカル平文ファイルに保存しない**
- ローカル検証以外は CI の Secrets で渡す
- 署名用 Secret は用途ごとに分離する（mac と win を分ける）

---

## 5. 必須環境変数

### macOS署名

- 必須:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
- notarize（どちらか1セット必須）
  - API Key:
    - `APPLE_API_KEY`
    - `APPLE_API_KEY_ID`
    - `APPLE_API_ISSUER`
  - Apple ID:
    - `APPLE_ID`
    - `APPLE_APP_SPECIFIC_PASSWORD`
    - `APPLE_TEAM_ID`

### Windows署名

- 必須:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`

---

## 6. ローカル実行手順

`src/doc-forge/app` で実行する。

```bash
npm run dist:mac:signed
npm run dist:win:signed
```

補足:

- 両コマンドは platform check を実行し、非対応OSでは fail-fast する
- 署名用環境変数の不足時は `scripts/check-signing-env.mjs` で失敗する

---

## 7. CI実行手順（推奨）

ワークフローテンプレート:

- `src/doc-forge/.github/workflows/release-desktop-signed.yml`

想定する Secrets:

- mac:
  - `MAC_CERTIFICATE_P12_BASE64`
  - `MAC_CERTIFICATE_PASSWORD`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
  - `APPLE_API_KEY_P8_BASE64`
- win:
  - `WIN_CERTIFICATE_P12_BASE64`
  - `WIN_CERTIFICATE_PASSWORD`

CI では `APPLE_API_KEY_P8_BASE64` を実行時に一時ファイルへ復号し、`APPLE_API_KEY` として渡す。

---

## 8. リリース判定チェック

- `npm run lint` が成功
- `npm run build:desktop` が成功
- Windows配布では `npm run test:desktop:smoke` が成功
- `dist:mac:signed` または `dist:win:signed` が成功
- 生成物をクリーン環境にインストールして起動できる
- 初回起動で「設定 -> LLMキー設定」導線まで到達できる

---

## 9. 既知の残課題

- macOS/Windows での実機署名検証は証明書投入後に実施が必要
- notarization/SmartScreen の最終挙動はリリース候補ビルドで再確認する
