# セットアップ手順

このアプリは Google スプレッドシート・Gmail・Anthropic API と連携して動作します。
初回セットアップとして、以下の手順で認証情報を発行してください。

## 1. Google Cloud Platform でプロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/) を開く（社内のGoogleアカウントでログイン）
2. 画面上部のプロジェクト選択メニューから「新しいプロジェクト」をクリック
3. プロジェクト名を入力（例: `sales-lead-app`）して「作成」

## 2. 必要なAPIを有効化

作成したプロジェクトを選択した状態で、以下の3つのAPIをそれぞれ有効化します。

1. 左メニューの「APIとサービス」→「ライブラリ」を開く
2. 検索欄で以下を検索し、それぞれ「有効にする」をクリック
   - **Google Sheets API**
   - **Gmail API**
   - **Google Drive API**

## 3. OAuth同意画面の設定

1. 「APIとサービス」→「OAuth同意画面」を開く
2. ユーザータイプは、Google Workspace組織のアカウントであれば「内部」を選択（社外ユーザーは使わないため）。個人Gmail等の場合は「外部」を選び、テストユーザーとして自分のアカウントを追加する
3. アプリ名（例:「営業先分析ダッシュボード」）、サポートメール、デベロッパーの連絡先メールを入力して保存
4. 「スコープ」の画面で「スコープを追加または削除」から以下を追加:
   - `.../auth/spreadsheets`
   - `.../auth/drive.file`
   - `.../auth/gmail.compose`
5. 「外部」を選んだ場合は、「テストユーザー」にログインに使うGoogleアカウントを追加しておく（本番公開申請をしない限り、テストユーザー以外はログインできません）

## 4. OAuthクライアントIDの発行

1. 「APIとサービス」→「認証情報」を開く
2. 「認証情報を作成」→「OAuthクライアントID」を選択
3. アプリケーションの種類は「ウェブアプリケーション」を選択
4. 名前を入力（例: `sales-lead-app-web`）
5. 「承認済みのリダイレクトURI」に以下を追加:
   - ローカル開発用: `http://localhost:3000/api/auth/callback/google`
   - 本番環境を用意した場合は、その本番URLも追加（例: `https://your-domain.example.com/api/auth/callback/google`）
6. 「作成」をクリックすると、**クライアントID** と **クライアントシークレット** が表示されるのでコピーしておく

## 5. 環境変数の設定

```bash
cp .env.local.example .env.local
```

`.env.local` を開き、以下を入力する。

```
GOOGLE_CLIENT_ID=（手順4でコピーしたクライアントID）
GOOGLE_CLIENT_SECRET=（手順4でコピーしたクライアントシークレット）
NEXTAUTH_SECRET=（下記コマンドで生成した文字列）
ALLOWED_GOOGLE_DOMAIN=oncall-japan.com
ANTHROPIC_API_KEY=（手順6で発行したAPIキー）
```

`NEXTAUTH_SECRET` はターミナルで以下を実行して生成します。

```bash
openssl rand -base64 32
```

## 6. Anthropic APIキーの発行

1. [Anthropic Console](https://console.anthropic.com/) にログイン（アカウントがなければ作成）
2. 「API Keys」ページで新しいキーを発行
3. `.env.local` の `ANTHROPIC_API_KEY` に貼り付ける

※ リサーチ・スコアリング・メール文面生成のたびにAPI利用料が発生します（従量課金）。

## 7. 起動して確認

```bash
npm install
npm run dev
```

`http://localhost:3000` を開き、「Googleでログイン」から社内アカウントでログインします。

- ログイン後、初回アクセス時に Google ドライブへ「営業先分析_リード」という名前のスプレッドシートが自動作成されます
- ダッシュボードの「リサーチ開始」から地域を指定して実行すると、Web検索で往診対応の病院・クリニック候補を探し、スコアリングしてシートに追記します
- リード詳細画面から「メール下書き作成」を押すと、Gmailの下書きフォルダに文面が保存されます（メールアドレスが取得できているリードのみ）
- 内容を確認し、「送信する」を押した場合のみ、その1件が実際に送信されます（一括送信は行いません）

## トラブルシューティング

- **ログインできない / 403エラーになる**: OAuth同意画面が「外部」設定の場合、テストユーザーに追加していないアカウントはログインできません。手順3を確認してください。
- **スプレッドシートが作成されない**: Google Sheets API / Google Drive API が有効化されているか確認してください（手順2）。
- **メール下書きが作成されない**: 対象のリードにメールアドレスが取得できていない場合、Gmail下書きは作成されずシートに文面のみ保存されます。
