# Picture to Manual

iPhone Safari向けの、写真の文字を読み取り、無料の端末内AIで要約してPDFにする日本語Webアプリです。GitHub Pagesで公開でき、バックエンドや有料API、APIキーは使いません。

## 使い方

1. マニュアル名を入力し、「写真を読み込む」で複数の写真を選びます。
2. チェックボックスで対象を選び、矢印で順番を変更します。
3. 「写真の文字を読み取る」を押し、日本語・英語の読み取り結果を確認・修正します。
4. 「無料のAIで要約する」を押します。要約を確認し、必要に応じて直接編集します。
5. 「PDFを作成」で要約をA4縦のPDFに整えます。長文はページを分けます。日本語フォントを埋め込み、文字の検索・コピーもできます。未対応の文字は□になります。
6. 「PDFを保存・共有」からiPhoneの「ファイルに保存」などを選びます。
7. 写真を追加して同じ操作を行い、「内容を追加してPDFを更新」を押すと、既存ページを残して末尾に新しい要約を追加します。以前ダウンロードしたファイルは自動で上書きされないので、更新後にもう一度保存してください。

「写真をそのままPDF」に切り替えると、従来の写真1枚1ページのPDFも作れます。A4縦、縦横比維持、切り抜きなし。確定済みのページの編集・削除・再要約は行いません。

写真・選択順・文字認識結果・編集した要約・作成済みPDFは、このブラウザのIndexedDBに保存されます。写真の対象や順番を変更する際は、読み取り済みの文字・要約をクリアする前に確認します。写真は長辺2400pxまで縮小してJPEGに変換します。1枚40MBまで。HEICなどの対応は端末・Safariのバージョンに依存するため、読み込めない場合はJPEG/PNGに変換してください。

## AI・文字認識と無料利用

- 文字認識：Tesseract.js、日本語・英語モデル。必要なファイルはアプリと同じサイトで配信します。
- 要約：Transformers.js + Qwen2.5-0.5B-Instruct（8bit量子化、固定リビジョン）。推論はWeb Worker内のWebAssemblyで実行します。ルールによる重要文抽出を「AI要約」と表示しているものではありません。
- AIモデルは初回にHugging Faceから約512MB＋設定・トークナイザを取得し、ブラウザのキャッシュを利用します。モデルの取得先には通常のアクセス情報が送られますが、写真・読み取り文章・要約は送信しません。API料金はありませんが通信料金は別です。Wi-Fiでの利用をおすすめします。
- iPhoneの機種・空きメモリ・Safariのバージョン・ストレージ制限によってはAIモデルを動かせません。初回取得や要約には数分かかることがあります。処理中は中止できます。AIが動かない場合でも、要約欄へ手入力してPDFを作成できます。
- 一度に12,000文字まで。長文は約1,600文字ずつ分割して各部分を要約し、順に連結します。分割をまたぐ統合要約はしません。
- 文字認識と小型AIの要約には、読み間違い、情報の抜け、事実と異なる記述があり得ます。特に数値・手順・注意点は写真と照合して修正してからPDFにしてください。

## 保存について

容量不足や保存失敗は画面で警告し、作業中の内容はメモリ上に残します。PDFと作業状態の更新は同一トランザクションで保存します。ブラウザのデータ削除、プライベートブラウズ終了、OSによるデータ整理などにより復元できなくなることがあります。大切なPDFは必ず「ファイル」に書き出してください。別の端末・ブラウザ・URLへの同期はありません。複数タブ同時編集・オフライン起動には対応していません。

## 開発・検証

Node.js 22以上。GPU用Nodeバイナリは不要なので、`.npmrc` にONNX RuntimeのCUDAインストールを省く公式オプションを指定しています。将来のnpmが独自設定を受け付けない場合は `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci` を使用してください。

```sh
npm ci
npm run dev
```

`postinstall`・`dev`・`build` でOCRとAIランタイムの配信ファイルを `public/ocr/`・`public/ai/` に準備します。これらは生成物でGitには含めません。

```sh
npx playwright install --with-deps chromium
npm test
npm run build
```

システムのChromiumを使う場合は `CHROMIUM_PATH=/usr/bin/chromium npm test`。テストは本番ビルドを起動します。通常テストは写真選択・並べ替え・復元・日本語PDFの複数ページ作成と追記・既存ページの画像／描画ストリーム保持・ダウンロード・英語／日本語の実OCR・保存失敗とAI取得エラーを検証します。

約512MBのモデル取得を伴う実AI推論テストは、通常の回帰テストでは明示的にスキップします。

```sh
RUN_AI_SMOKE=1 npm test -- test/ai.spec.js
```

GitHub Actionsの **Validate on-device AI** からも手動実行できます。このテストは実モデルから日本語の要約を生成し、PDFを作成します。Chromiumでの検証はiPhone実機Safariでの性能や共有シートの確認を代替しません。

## GitHub Pages

`.github/workflows/pages.yml` がmainへのpushでテスト・ビルド・デプロイを実行します。Settings → Pages → Source を **GitHub Actions** に設定してください。出力は `dist/` で、相対パスにより `/picture_to_manual/` 配下へ配置できます。

未初期化のサイトには `configure-pages@v5` の `enablement: true` を指定しています。初回作成には通常の `GITHUB_TOKEN` 以外の権限が必要です。管理者がPagesを有効にするか、対象リポジトリの **Pages: Read and write** を持つPATをActions Secret **PAGES_ENABLEMENT_TOKEN** に登録してください。GitHub Appトークンは **Administration: write** と **Pages: write** が必要です。Secretがなければ標準トークンを使用します。初期化後は専用Secretを削除できます。デプロイには `pages: write`・`id-token: write`、チェックアウトには `contents: read` を設定済みです。

公開URL： https://hirocoppa.github.io/picture_to_manual/

## ライセンス

日本語PDF用のNoto Sans JPフォントはSIL Open Font Licenseで同梱しています（`public/fonts/LICENSE.txt`）。出典・加工内容は同ディレクトリのREADMEを参照してください。OCR関連のライセンスは生成配信ファイルにコピーします。ONNX RuntimeのMITライセンスは `public/ONNXRUNTIME-LICENSE.txt` にあります。Qwen2.5-0.5B-InstructはApache-2.0で、モデルはHugging Faceから取得します。
