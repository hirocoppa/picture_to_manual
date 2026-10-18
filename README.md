# Picture to Manual

iPhoneのSafari向けに、写真からマニュアルPDFを作成する日本語Webアプリです。写真・PDFの処理と保存はブラウザ内で完結します。有料APIやバックエンドは不要です。

## 使い方

1. マニュアル名を入力し、「写真を読み込む」で写真を複数選びます。
2. チェックボックスでPDFに含める写真を選び、左右の矢印で順番を変更します。×で取り消せます。
3. 「PDFを作成」を押します。選択した写真が1枚1ページになります。
4. 「PDFを保存・共有」を押し、iPhoneの共有メニューから「ファイルに保存」を選びます。
5. 同じマニュアルを選んで写真を読み込み、「写真を追加してPDFを更新」を押すと既存ページの後ろに追記されます。以前ダウンロードしたPDFファイルは自動で上書きされないため、更新後のPDFをもう一度保存してください。

A4縦、縦横比維持、切り抜きなし、余白付き。写真は長辺2400pxまで縮小してJPEGに変換します。ブラウザが読み込めない画像形式は警告します。HEICなどの対応は端末・Safariのバージョンに依存します。読み込めない場合はJPEG/PNGに変換してください。1ファイル40MBまでです。

作成済みPDFと未作成の写真・選択状態・順番・名前はIndexedDBに自動保存します。選択解除した写真はPDFに入りません。作成完了時に読み込み一覧はクリアされます。確定済みのページは並べ替え・削除しません。

## 保存について

保存領域不足やブラウザの保存失敗は画面に警告します。PDF保存に失敗した場合は、選択中の写真を残して再試行できます。ブラウザのデータ削除、プライベートブラウズ終了、OSによるデータ整理などにより復元できなくなることがあります。大切なPDFは必ず「ファイル」に書き出してください。別の端末・ブラウザ・サイトURLへの同期はありません。複数タブでの同時編集には対応していません。オフライン起動は未対応です。

## 開発

Node.js 22以上。

```sh
npm ci
npm run dev
```

```sh
npx playwright install --with-deps chromium
npm test
npm run build
```

システムのChromiumを使う場合は `CHROMIUM_PATH=/usr/bin/chromium npm test`。

ブラウザテストは390×844の画面で、写真の選択・並べ替え・再読み込みによる作業復元・PDF作成・追記・既存PDFの画像と描画ストリームの保持・PDFダウンロード・読み込みエラー・保存失敗を検証します。iPhone実機のSafari・共有シートは別途実機確認が必要です。

## GitHub Pages

`.github/workflows/pages.yml` がmainへのpushでテスト・ビルド・Pagesデプロイを実行します。リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にしてください。未設定の場合は設定後にActionsからワークフローを再実行してください。リポジトリの公開範囲やGitHubプランがPagesの無料利用条件を満たす必要があります。

ビルド出力は `dist/` です。相対アセットパスを使うため `/picture_to_manual/` 配下へ配置できます。公開先はGitHub Actionsのデプロイ結果から確認してください。iPhoneのファイル共有にはHTTPSの公開URLを使用してください。

写真をアップロードする通信処理や外部フォントはありません。初回表示時にはホスティング先からアプリ本体を読み込みます。

### Pagesサイトが未初期化の場合

ワークフローの `configure-pages@v5` は `enablement: true` で、未作成のPagesサイトの初期化も試みます。通常の `GITHUB_TOKEN` には初回作成に必要な権限がないため、未初期化のサイトでは以下のいずれかが必要です。

- リポジトリ管理者がSettings → PagesでPagesサイトを有効にする。
- 対象リポジトリへの **Pages: Read and write** を持つfine-grained PATを、リポジトリのActions Secret **PAGES_ENABLEMENT_TOKEN** に登録する。GitHub Appのトークンを使用する場合は **Administration: write** と **Pages: write** が必要です。トークンの値はソースコードやチャットに記載しないでください。

Secretがあれば初期化処理に使用し、なければ標準の `github.token` を使用します。デプロイには `pages: write` と `id-token: write`、チェックアウトには `contents: read` を設定済みです。サイトを初期化した後は専用Secretを削除して標準トークンへ戻せます。

`Get Pages site failed: Not Found` はサイトが未作成の場合だけでなく、トークンからサイトを参照できない場合も発生し得ます。設定後はActionsの「Deploy GitHub Pages」を再実行し、`Deploy` ステップの公開URLと実際のサイト表示を確認してください。
