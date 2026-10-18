# Picture to Manual

iPhone Safari向けに、写真を選ぶだけで文字認識・AI要約・PDF作成まで自動で行うWebアプリです。バックエンド、有料API、APIキーは不要です。

公開URL： https://hirocoppa.github.io/picture_to_manual/

## 使い方

1. 必要ならPDFの名前を入力し、「写真を選んでPDFを作る」から写真を複数選びます。
2. 文字認識 → AI要約 → PDF作成・端末内保存まで自動で進みます。読み取り確認や作成ボタンの操作は不要です。
3. 完成したら「PDFを保存・共有」を押し、iPhoneの「ファイルに保存」などを選びます。

作成済みPDFを選んで写真を追加すると、以前のページを残し、要約を末尾に追加します。以前ダウンロードしたPDFファイルは自動で上書きされないため、更新後にもう一度書き出してください。「新しいPDF」で別のマニュアルを作れます。「写真をそのままPDF」のモードはありません。

A4縦のテキストPDFです。長文はページを分け、日本語フォントを埋め込みます。文字の検索・コピーも可能です。未対応の文字は□になります。確定済みのページの編集・削除・再要約はしません。

## 縦書きの認識

- 日本語の縦書き専用モデル `jpn_vert` と縦書き用の紙面解析設定を使用します。縦書きを横向きの文章として読ませる方式ではありません。
- 各写真について縦書きと横書き（日本語・英語）を読み取り、認識結果の信頼度と文字量を比較して採用します。
- 画像の長辺は最大3200px、PNGで保存し、小さい文字へのJPEG再圧縮の影響を避けます。小さな傾きの補正を有効にし、認識が弱い場合はコントラスト補正と再読み取りを行います。
- 認識できない・信頼度が低すぎる写真が1枚でもあれば、勝手にその写真を除外したPDFは作らず、写真番号を示して停止します。以前のPDFは変更しません。「写真を選び直す」で問題のある組を置き換えるか、「もう一度作成する」で再試行できます。

縦書きのテスト画像では、右の列から左の列への読み順と重要な文章を検証しています。これはユーザーの実写真やiPhone実機の検証を代替しません。文字の小ささ・ぼけ・紙面の曲がり・強い傾き・手書き・複雑な段組みでは誤認識が残り得ます。自動処理なので、完成した要約やPDFの重要な数値・注意点は元の写真と照合してください。OCRの信頼度は正しさを保証しません。

写真1枚40MBまで。HEICなどの対応はSafariのバージョンに依存するため、読み込めない場合はJPEG/PNGに変換してください。

## 無料の端末内AI

Tesseract.jsで文字認識し、Transformers.jsとQwen2.5-0.5B-Instruct（8bit量子化・固定リビジョン）で要約します。推論はWeb Worker内のWebAssemblyで実行します。写真・読み取った文章・要約は外部へ送信しません。

AIモデルは初回にHugging Faceから約512MB＋設定・トークナイザを取得し、ブラウザのキャッシュを利用します。取得先には通常のアクセス情報が送られます。API料金はありませんが通信料金は別です。Wi-Fiでの利用をおすすめします。

iPhoneの機種・空きメモリ・Safariのバージョンによっては動作しません。初回の取得や要約には数分かかることがあります。「中止する」で中断し、「もう一度作成する」で再開できます。長文は約1600文字ずつ分割して要約し、順に連結します。分割をまたぐ統合要約はしません。小型AIによる情報の抜けや事実と異なる要約があり得ます。

## 保存と復元

写真・文字認識結果・要約・作成済みPDFは、このブラウザのIndexedDBに保存します。処理途中で閉じた場合は、再度開くと保存済みの工程から自動で再開します。明示的に中止した作業やエラーになった作業は、再開ボタンを押すまで止めたままにします。保存失敗時は警告し、メモリ上の作業内容を残します。PDF更新と作業状態のクリアは同じトランザクションで行い、途中の失敗でも以前のPDFを守ります。

ブラウザデータの削除、プライベートブラウズ終了、OSによるデータ整理などにより復元できなくなることがあります。大切なPDFは必ず「ファイル」に保存してください。別の端末・ブラウザ・URLへの同期、複数タブの同時編集、オフライン起動には対応していません。

## 開発・検証

Node.js 22以上。ブラウザ向けアプリなので、`.npmrc` でONNX RuntimeのGPU用Nodeバイナリの導入を省いています。将来のnpmで独自設定が使えない場合は `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci` を使用してください。

```sh
npm ci
npm run dev
```

`postinstall`・`dev`・`build` は、OCRモデル・Worker・WASMとAIランタイムを `public/ocr/`・`public/ai/` に準備します。これらの生成物はGitに含めません。

```sh
npx playwright install --with-deps chromium
npm test
npm run build
```

システムのChromiumを使う場合は `CHROMIUM_PATH=/usr/bin/chromium npm test`。通常のテストは本番ビルドをポート5174で起動します。実際の縦書き・横書きOCRを使い、自動処理、読む順序、追記時の既存PDF保持、復元、読み取り失敗、保存トランザクションの失敗、中止を検証します。通常テスト内のAI成功応答はスタブです。

実モデルの取得と推論は専用テストで実行します。写真から実OCR → 実AI要約 → PDF作成まで追加操作なしで検証します。

```sh
RUN_AI_SMOKE=1 npm test -- test/ai.spec.js
```

GitHub Actionsの **Validate on-device AI** からも手動実行できます。Chromiumでの検証はiPhone実機のSafari・性能・共有シートを代替しません。

## GitHub Pages

`.github/workflows/pages.yml` はmainへのpushでテスト・ビルド・デプロイを実行します。Settings → Pages → Source は **GitHub Actions** を指定してください。出力は `dist/`、アセットは相対パスです。

未初期化サイト用に `configure-pages@v5` の `enablement: true` を設定しています。初回作成には管理者によるPages有効化、または対象リポジトリの **Pages: Read and write** を持つPATをActions Secret **PAGES_ENABLEMENT_TOKEN** に登録する必要があります。GitHub Appトークンは **Administration: write** と **Pages: write** が必要です。Secretがなければ標準のGitHubトークンを使います。初期化後は専用Secretを削除できます。

## ライセンス

日本語PDF用Noto Sans JPはSIL Open Font Licenseです（`public/fonts/LICENSE.txt`）。出典・加工内容は同ディレクトリのREADMEを参照してください。OCR関連ライセンスは生成配信ファイルにコピーします。ONNX RuntimeのMITライセンスは `public/ONNXRUNTIME-LICENSE.txt` にあります。Qwen2.5-0.5B-InstructはApache-2.0で、モデルはHugging Faceから取得します。
