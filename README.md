# 営業先分析アプリ

往診対応の病院・クリニックを対象に、潜在顧客のリサーチ・スコアリング・アウトリーチ管理を行う社内ツール。

## 技術構成

- Next.js (App Router) + TypeScript + Tailwind CSS
- NextAuth.js (Auth.js) — Google OAuthログイン
- Google Sheets API / Gmail API / Google Drive API — データの正はGoogleスプレッドシート
- Anthropic API (`claude-opus-5`) — Web検索によるリード発掘・構造化出力によるスコアリング・メール文面生成
  - **`ANTHROPIC_API_KEY` は任意。** 未設定の場合は自動的に「手動でリード追加」フォーム＋固定テンプレートメールで動作する（追加のAPI利用料は発生しない）。キーを追加すると次のデプロイからAI機能に自動で切り替わる

## セットアップ

初回セットアップ（GCPプロジェクト作成〜OAuth設定）は [SETUP.md](./SETUP.md) を参照してください。

```bash
npm install
cp .env.local.example .env.local  # 値を入力
npm run dev
```

## 機能（MVP）

- Googleログイン（社内ドメイン制限）
- ログイン時にスプレッドシートを自動作成し、リード情報の正として利用
- 地域を指定したリードリサーチ（Web検索 + Claudeによる抽出・スコアリング）。`ANTHROPIC_API_KEY`未設定時は手動追加フォームに切り替わる
- ダッシュボード（KPI・一覧・フィルタ、架電・メール送信の実施状況を一覧表示）
- リード詳細（スコア内訳・ステータス管理・架電記録・メモ）
- メール下書き自動生成（未設定時は固定テンプレート）→ Gmail下書き作成 → 確認の上で1件ずつ送信

## 今後の検討事項

- スプレッドシートの列を手動編集した場合の整合性チェック
- 送信済みメールへの返信検知（Gmail APIでの自動ステータス更新）
- 複数担当者での役割分担・権限管理
- 本番デプロイ（Vercel等）時のリダイレクトURI追加
