export interface SessionTemplate {
  id: string;
  title: string;
  description: string;
  initialMarkdown: string;
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    id: "business-proposal",
    title: "事業提案",
    description: "経営会議向けの事業提案資料",
    initialMarkdown: `# 事業提案

## 背景・課題
- 課題1を記述
- 課題2を記述

## 提案内容
提案の概要を記述

## 期待効果
- 効果1
- 効果2

## 実施スケジュール
- フェーズ1: 〇〇
- フェーズ2: 〇〇

## まとめ
`,
  },
  {
    id: "project-kickoff",
    title: "プロジェクト開始",
    description: "キックオフミーティング用の資料",
    initialMarkdown: `# プロジェクト名

## プロジェクト概要
目的・スコープを記述

## ゴール・成功基準
- ゴール1
- ゴール2

## チーム体制
| 役割 | 担当 |
| --- | --- |
| PM | 〇〇 |
| エンジニア | 〇〇 |

## スケジュール
- 〇月〇日: キックオフ
- 〇月〇日: 中間レビュー
- 〇月〇日: リリース

## リスクと対応策
`,
  },
  {
    id: "weekly-report",
    title: "週次報告",
    description: "チーム向け週次進捗報告",
    initialMarkdown: `# 週次報告 〇月〇日週

## 今週の実績
- 完了タスク1
- 完了タスク2

## 来週の予定
- タスク1
- タスク2

## 課題・懸念事項
- 課題があれば記述
`,
  },
  {
    id: "product-launch",
    title: "プロダクト紹介",
    description: "製品・サービスのプレゼン資料",
    initialMarkdown: `# プロダクト名

## 解決する課題
ターゲットが抱える問題を記述

## ソリューション
製品・サービスの概要

## 主な機能
- 機能1: 説明
- 機能2: 説明
- 機能3: 説明

## ユーザーの声
「 」

## 価格・プラン
| プラン | 価格 | 内容 |
| --- | --- | --- |
| 無料 | 0円 | 基本機能 |
| Pro | 〇〇円/月 | フル機能 |

## 今すぐ始める
`,
  },
  {
    id: "research-findings",
    title: "調査・分析レポート",
    description: "リサーチ・調査結果のまとめ",
    initialMarkdown: `# 調査レポート: テーマ名

## 調査概要
- 調査目的:
- 調査期間:
- 調査方法:

## 主要な発見
1. 発見1
2. 発見2
3. 発見3

## データ分析
| 項目 | 数値 | 前年比 |
| --- | --- | --- |
| 〇〇 | 100 | +10% |

## 考察・示唆
- 示唆1
- 示唆2

## 推奨アクション
`,
  },
];
