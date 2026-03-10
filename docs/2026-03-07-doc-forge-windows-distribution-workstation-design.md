# 2026-03-07 Doc Forge Windows配布ワークステーション設計書

## 1. 目的

macOS では `dist/` に配布物を生成できる状態まで到達した。
次の目的は、**Windows 向けにも同じ運用品質で配布物を生成し、他者へ共有できる状態を作ること**である。

この文書では、Windows PC 上で Doc Forge の配布物を作成・検証・必要に応じて署名するための標準作業設計を定義する。

---

## 2. 結論

Windows 向け配布の標準経路は次のとおりとする。

1. **日常実装は macOS でも継続してよい**
2. **Windows 配布物の最終ビルドは Windows PC で実行する**
3. **Windows 配布物の最終起動確認も Windows PC で実行する**

理由:

- Doc Forge は `better-sqlite3` という native dependency を含む
- `electron-builder` の公式ドキュメントでも、native dependency を含む場合は target platform 上での build を前提に考えるべきとされている
- Apple Silicon Mac 上では、Windows 生成経路が Wine 依存で不安定になりやすく、実際にローカルでは正式な `dist:win` 完了経路として扱えない

したがって、**Windows 配布だけは Windows を正規ビルド環境にする**。

実装上も `npm run dist:win` / `npm run dist:win:signed` に platform check を組み込み、
非Windows環境では fail-fast する方針とする。

---

## 3. 対象成果物

Windows 向けの共有対象は以下とする。

### unsigned 配布

- `DocForge-<version>-win-x64.exe`
- `DocForge-<version>-win-x64.zip`

### signed 配布

- `DocForge-<version>-win-x64.exe`
- `DocForge-<version>-win-x64.zip`

補足:

- `exe` を標準配布物とする
- `zip` は portable 配布または検証用の補助配布物とする
- `blockmap` や `builder-debug.yml` は利用者に渡さない

---

## 4. 標準アーキテクチャ

Windows でも macOS と同じ構成を使う。

- UI: Next.js
- デスクトップシェル: Electron
- ローカルサーバー起動方式: packaged Electron runtime から standalone server を起動
- データ保存: `app.getPath("userData")` 配下
- 配布生成: `electron-builder`

現在の実装前提:

- packaged app は system `node` を前提にしない
- packaged + standalone では listen host は loopback 固定
- 外部リンクはアプリ内遷移させず、既定ブラウザへ逃がす
- packaging は `.next/standalone` を専用 project dir として実行し、root `node_modules` を汚さない

---

## 5. Windows ワークステーションの標準仕様

### 推奨構成

- OS: Windows 11 Pro / Home 64bit
- CPU: x64
- RAM: 16GB 以上
- 空き容量: 20GB 以上
- 権限: ソフトウェア導入が可能な管理者権限

### 必須ソフトウェア

1. Git
2. Node.js 20 系 LTS
3. npm 10 系
4. Visual Studio Build Tools または Node の native module 用ツール
5. Python 3

### 推奨ソフトウェア

1. PowerShell 7
2. 7-Zip
3. Windows Terminal
4. 署名を行う場合は証明書管理ツールまたは PFX 配布手順

### パス方針

`better-sqlite3` のトラブル回避のため、作業パスは短くシンプルにする。

推奨:

- `C:\work\doc-forge`

避ける:

- スペースを含む深いパス
- 日本語や特殊文字を含むパス

---

## 6. Windows 初期セットアップ手順

### Step 1. 作業ディレクトリ作成

```powershell
mkdir C:\work
cd C:\work
git clone <repo-url> doc-forge
cd doc-forge\src\doc-forge\app
```

### Step 2. Node / npm 確認

```powershell
node -v
npm -v
```

期待値:

- Node.js 20 系
- npm 10 系

### Step 3. native module 用ツール確認

`better-sqlite3` の公式トラブルシュートに従い、Windows では native module 用ツールを入れておく。
Node.js インストール時に `Automatically install the necessary tools` を選んでいない場合は、次も候補にする。

```powershell
& "C:\Program Files\nodejs\install_tools.bat"
```

補足:

- これにより Chocolatey / Visual Studio / Python の導入が走る場合がある
- 既に Visual Studio Build Tools と Python 3 があるなら必須ではない

### Step 4. 依存インストール

```powershell
npm ci
```

### Step 5. lint と build の事前確認

```powershell
npm run lint
npm run build:desktop
```

ここで失敗する場合は、配布生成へ進まない。

---

## 7. Windows 配布物の標準ビルド手順

### unsigned 配布

```powershell
cd C:\work\doc-forge\src\doc-forge\app
npm ci
npm run lint
npm run build:desktop
npm run dist:win
```

補足:

- `dist:win` 実行時に platform check が走る
- 非Windows環境で実行した場合は即時エラーで停止する

期待成果物:

- `dist\DocForge-<version>-win-x64.exe`
- `dist\DocForge-<version>-win-x64.zip`

### signed 配布

署名用の証明書がある場合は、環境変数を設定したうえで以下を実行する。

```powershell
$env:CSC_LINK = "<pfxへのパス or base64 or URL>"
$env:CSC_KEY_PASSWORD = "<password>"
npm run dist:win:signed
```

補足:

- `dist:win:signed` も同様に platform check を実行する

運用方針:

- 内部共有だけなら unsigned でも可
- 外部共有や業務利用を想定するなら signed を標準にする

---

## 8. Windows 配布物の受け入れ基準

以下をすべて満たしたとき、Windows 配布物を「mac 配布と同等の完成度」とみなす。

### Build 完了条件

1. `npm run lint` 成功
2. `npm run build:desktop` 成功
3. `npm run dist:win` または `npm run dist:win:signed` 成功
4. `npm run test:desktop:smoke` 成功
5. `dist\` に `exe` と `zip` が生成される

### 起動確認条件

1. `exe` からインストールできる
2. アプリが起動する
3. 新規セッションを作成できる
4. ドキュメントを編集できる
5. アプリ再起動後もセッションと内容が残る
6. 外部リンクをクリックすると既定ブラウザで開く
7. アプリ本体が外部サイトへ遷移しない
8. listen 先が loopback のみである

### 最低限の手動確認手順

1. インストール
2. 起動
3. セッション作成
4. テキスト入力
5. 再起動
6. 残存確認
7. Markdown に `https://example.com` を書いてクリック

### 推奨する自動 smoke 手順

```powershell
cd C:\work\doc-forge\src\doc-forge\app
npm run dist:win
$env:LLM_PROVIDER = "mock"
npm run test:desktop:smoke
```

補足:

- `test:desktop:smoke` は `dist\win-unpacked\` を使って起動確認を行う
- 初回起動ガイドはテスト用環境変数で無効化して実行される

---

## 9. 推奨する検証構成

### 最小構成

- Windows PC 1台で build と起動確認を行う

### 推奨構成

- Build 用 Windows PC 1台
- クリーン検証用 Windows VM または別 Windows PC 1台

理由:

- build 済みマシンでは Node / npm / 開発ツールが入っているため、利用者環境との差が大きい
- 最終的には「Node が入っていない一般 Windows」で起動確認した方がよい

検証優先順:

1. build workstation 上で `dist:win`
2. build workstation 上でインストール確認
3. クリーン環境で再インストール確認

---

## 10. 署名方針

### unsigned でよいケース

- 開発チーム内の限定共有
- 少人数の検証配布
- SmartScreen 警告を許容できる

### signed を使うべきケース

- 顧客や他部署へ配布する
- ダウンロード後の警告を減らしたい
- 配布物の真正性を明確にしたい

### 証明書の選択方針

- 通常の Code Signing Certificate:
  - 導入しやすい
  - 自動化しやすい
  - 初期は SmartScreen 警告が残ることがある
- EV Code Signing Certificate:
  - 信頼は高い
  - ただし USB トークン前提で CI 自動化しにくい
  - ローカル Windows ワークステーションでの手動署名向き

Doc Forge の現段階では、まずは

1. unsigned で Windows ビルドを安定化
2. 次に通常の Code Signing Certificate を検討

の順でよい。

---

## 11. 実運用フロー

### フローA: 内部共有

1. Windows PC で `npm run dist:win`
2. `dist\DocForge-<version>-win-x64.exe` を配布
3. 受け手には SmartScreen 警告が出る可能性を事前共有

### フローB: 外部共有

1. Windows PC で `npm run dist:win:signed`
2. `exe` と `zip` を成果物保管
3. クリーン Windows で再確認
4. その後に配布

---

## 12. トラブルシュート方針

### ケース1: `better-sqlite3` が install / rebuild で失敗する

対応:

1. `node -v` が対応バージョンか確認
2. native tools が入っているか確認
3. `node_modules` を削除して `npm ci` を再実行
4. 必要なら `install_tools.bat` を実行

### ケース2: `dist:win` は通るが起動しない

確認:

1. `dist\win-unpacked\` で直接起動できるか
2. `%APPDATA%` または userData 配下のログを確認
3. セキュリティソフトでブロックされていないか確認

### ケース3: SmartScreen 警告が出る

これは unsigned、または通常証明書で reputation が十分でない場合に起き得る。
機能不良ではなく、配布信頼性の問題として扱う。

---

## 13. この設計での役割分担

### mac 側でやること

- 機能実装
- lint / build / mac 配布確認
- README / docs 更新

### Windows 側でやること

- `dist:win` 実行
- Windows 実機でのインストール確認
- Windows 固有警告の確認
- 必要に応じた署名実施

---

## 14. Definition of Done

この設計書に基づく Windows 配布対応は、以下で完了とする。

1. Windows PC で `npm run dist:win` が再現可能
2. `exe` と `zip` が生成される
3. インストールして起動できる
4. セッション保存と再起動復元が通る
5. 外部リンク制御と loopback 制約が確認できる
6. 署名なし配布か署名あり配布かの運用判断が済んでいる

---

## 15. 参考

- electron-builder Multi Platform Build: https://www.electron.build/multi-platform-build.html
- electron-builder Code Signing Setup: https://www.electron.build/code-signing.html
- electron-builder Windows Code Signing: https://www.electron.build/code-signing-win.html
- better-sqlite3 Troubleshooting: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md
