# VRM Pixel Studio

[![CI](https://github.com/matsuvr/vrm2pixel/actions/workflows/ci.yml/badge.svg)](https://github.com/matsuvr/vrm2pixel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Webアプリ](https://vrm2pixel.catkawaii.com) · [ソースコード](https://github.com/matsuvr/vrm2pixel) · [不具合報告](https://github.com/matsuvr/vrm2pixel/issues)

VRMを読み込んで**64×64px・8方向・歩きと走りそれぞれ3ポーズ、合計48コマ**のスプライトを作成するWebアプリ・Web API・Windows CLIです。3つとも`src/engine.ts`の同じ変換エンジンを使います。Cloudflare Workersで画面とAPIを配信し、APIの描画にはCloudflare Browser Runを使います。

画面から利用する場合はモデルの読み込みからPNG・ZIPの作成まですべて利用者のブラウザ内で行います。APIを利用する場合はVRMをCloudflareへ送信し、同じ描画と減色の処理でPNGを生成します。APIは単一のAPIキーで認証します。CLIはPC内のChrome／Edgeをヘッドレスで起動し、モデルを外部へ送信せずにPNGを生成します。

## 起動

Node.js **22.12以降**とnpmが必要です。開発とCIにはNode.js 24系を使用します。WindowsのPowerShellでも同じコマンドを使えます。

```sh
git clone https://github.com/matsuvr/vrm2pixel.git
cd vrm2pixel
npm ci
npm run dev
```

ターミナルに表示されたURLを開いてください。最初にオリジナルのデモモデル「Mint」が読み込まれ、48コマが生成されます。ブラウザはWebGL2が利用できるChrome・Edge・Firefox・Safariのいずれかを使用してください。

本番用ビルドをローカルで確認する場合は、次を実行します。`dist/`はGitに含めず、ソースから生成します。

```sh
npm run build
npm run preview
```

`dist/index.html`は上記のローカルサーバー経由で開いてください。直接ダブルクリックして起動する方法は非対応です。ES Modulesとデモモデルの読み込みにはHTTPが必要です。

## Windows CLI

Node.js **22.12以降**と、WebGL 2を利用できるChromeを推奨します。Windowsの標準的なインストール先からChromeを優先して自動検出し、なければMicrosoft Edgeを探します。Edgeは環境によってヘッドレス起動が直ちに終了することがあるため、その場合はChromeをインストールして`--browser`で指定してください。初回はプロジェクトフォルダーで依存関係のインストールとビルドを行います。

```powershell
npm ci
npm run build
.\vrm-pixel.cmd "C:\models\avatar.vrm"
```

VRMと同じフォルダーに`avatar-spritesheet.png`を保存し、標準出力に保存先の絶対パスを1行返します。画像はWeb UIの初期設定・Web APIと同じ**384×512px・背景透過・48コマ・不透明15色**です。日本語・空白を含むパスにも対応します。引数の相対パスはコマンドを実行したフォルダーから解決します。

保存先を指定する場合:

```powershell
.\vrm-pixel.cmd "C:\models\avatar.vrm" --output "C:\sprites\avatar.png"
```

保存先の親フォルダーは自動作成します。既存のPNGがある場合はエラーで終了します。置き換える場合は`--force`を追加します。

```powershell
.\vrm-pixel.cmd "C:\models\avatar.vrm" -o "C:\sprites\avatar.png" --force
```

`npm run cli -- "C:\models\avatar.vrm"`または`node .\cli\index.mjs "C:\models\avatar.vrm"`でも起動できます。別のフォルダーからはランチャーの絶対パスを指定します。

```powershell
& "C:\projects\vrm2pixel\vrm-pixel.cmd" "C:\models\avatar.vrm"
```

| オプション | 内容 |
| --- | --- |
| `-o, --output <file.png>` | 保存先。省略時は入力VRMの隣の`<モデル名>-spritesheet.png` |
| `-f, --force` | 既存PNGを上書き |
| `--browser <exe>` | Chrome／Edgeの実行ファイルのパスを指定 |
| `--timeout <秒>` | ブラウザ起動後の変換制限時間。初期値120秒、1〜3600秒 |
| `-h, --help` | ヘルプ |
| `-v, --version` | アプリのバージョン |

自動検出できない場合は`--browser "C:\path\to\chrome.exe"`または環境変数`VRM_PIXEL_BROWSER_PATH`でブラウザを指定します。Chrome／Edgeは専用の一時プロファイルと非表示のウィンドウで起動し、処理完了・エラー・タイムアウトで終了します。普段使うブラウザのプロファイルは使用しません。

CLIの入力はVRM 0.x／1.0のバイナリ形式、25MiB以下です。テクスチャはVRM内に埋め込んでください。APIと同じ描画ページをローカルのビルド済みファイルから読み込み、モデルからの外部URLへのアクセスを遮断します。HTTPサーバーの起動やAPIキーは不要で、依存関係とブラウザの準備後はオフラインで変換できます。終了コードは成功時`0`、失敗時`1`で、エラーは標準エラー出力に表示します。CLIの出力は全コマPNGです。個別PNG・歩き／走りPNG・ZIPと設定の調整はWeb UIから利用できます。

### 共通エンジンの更新

変換処理は`src/engine.ts`がまとめ、その内部の`renderer.ts`・`pose.ts`・`framing.ts`・`pixel.ts`で描画とピクセル化を行います。UIはこのエンジンを直接呼び、APIとCLIは`render.html` → `src/api-render.ts`経由で同じエンジンを呼びます。既定値は`src/types.ts`で一元管理しています。

エンジンを修正したら`npm run build`で3つが使う`dist/`をまとめて更新してください。UIと描画ページはビルド時に同じエンジンのJavaScriptチャンクを参照し、CLI独自の変換処理は持ちません。公開中のWeb UI／APIにも反映する場合は、その後`npm run deploy:built`で更新した`dist/`とWorkerをデプロイします。Node.js上のCLIを単一の`.exe`にまとめる方式ではありません。

## Cloudflare Workersにデプロイ

### 自分のアカウントへデプロイ

`wrangler.jsonc`はアカウントID・カスタムドメインを含まない共通設定です。`name`を自分のWorker名に変更し、次を実行します。Web UIとCLIだけをローカルで使う場合、Cloudflareの設定は不要です。

```sh
npm ci
npx wrangler login
npx wrangler secret put API_KEY
npm run build
npx wrangler deploy
```

`API_KEY`には暗号学的乱数で生成した秘密の文字列を設定してください。例えば次のコマンドで64文字のキーを生成できます。生成した値は秘密として管理し、チャットやIssueに貼らないでください。

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

ローカルAPIを使う場合は `.dev.vars.example` を `.dev.vars` にコピーして同じキーを設定します。`.dev.vars`はGit管理対象外です。APIキーはサーバー側だけに設定し、`VITE_`変数や公開ソースへ含めないでください。未設定の場合、Web UIは利用できますがAPIは503を返します。

設定の中心は次の部分です。

```json
{
  "name": "vrm-pixel-studio",
  "main": "worker/index.ts",
  "compatibility_date": "2026-11-17",
  "compatibility_flags": ["nodejs_compat"],
  "browser": { "binding": "BROWSER" },
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": ["/api", "/api/*"]
  }
}
```

Workerは`/api`と`/api/*`の認証・変換を処理します。画面と描画用JavaScriptはStatic Assetsから配信します。Workers用のローカル配信を確認するには`npm run worker:dev`を使います。ローカルのAPIキーは`.dev.vars`の`API_KEY`から読み込みます。

CloudflareでのStatic Assetsの設定は[公式ドキュメント](https://developers.cloudflare.com/workers/static-assets/)に沿っています。独自ドメインを使う場合は、自分のCloudflareアカウントで管理するドメインを設定してください。

### このリポジトリの本番自動デプロイ

`matsuvr/vrm2pixel` の `main` は [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) で既存Worker `vrm-pixel-studio` に接続しています。`main`にプッシュするとテスト・型チェック・ライセンス生成・ビルドが実行され、成功した場合に [vrm2pixel.catkawaii.com](https://vrm2pixel.catkawaii.com) のWeb UIとAPIが更新されます。

| 設定 | 値 |
| --- | --- |
| 本番ブランチ | `main` |
| Node.js | 24系 |
| ルートディレクトリ | `/` |
| ビルドコマンド | `npm test && npm run build` |
| デプロイコマンド | `npm run deploy:built` |
| 本番Wrangler設定 | `wrangler.production.jsonc` |

CloudflareのWorker設定「Builds」で結果とログを確認できます。ランタイムの `API_KEY` は既存のWorker Secretを使用し、GitHubやビルド変数には保存しません。プレビューブランチからの本番更新は行いません。GitHub ActionsはPRと`main`で別途テスト・ビルドを実行します。

管理者が手動で本番を更新する場合は `npm run deploy`、ビルド済みの場合は `npm run deploy:built` を使います。これらは本番ドメイン用の設定を使用します。フォーク先は上記「自分のアカウントへデプロイ」のコマンドを使ってください。

## Web API

`POST https://vrm2pixel.catkawaii.com/api/render`にVRMを渡すと、背景透過の`spritesheet.png`を返します。レスポンスは`image/png`、寸法は384×512pxです。画面の初期設定と同じ64×64px・48コマ・不透明15色で生成し、行と列の順序も画面の書き出しに合わせています。

認証には`Authorization: Bearer <API_KEY>`ヘッダーを使います。キーの照合はSHA-256で長さをそろえてから定時間比較します。キーが未設定なら503、不一致なら401を返します。キー管理はWorkerの`API_KEY`シークレット1つで運用します。キーの発行・管理画面やデータベースは実装対象外です。

PowerShellでの呼び出し例を示します。自分のAPIに設定したキーを`.dev.vars`から読み込みます。公開サイトのAPIキーは配布していません。独自デプロイではURLも自分の公開先に変更してください。

```powershell
$apiKey = (Get-Content .dev.vars | Where-Object { $_ -like 'API_KEY=*' }) -replace '^API_KEY=', ''
curl.exe --fail-with-body --max-time 180 "https://vrm2pixel.catkawaii.com/api/render" -H "Authorization: Bearer $apiKey" -F "file=@C:/models/avatar.vrm" --output spritesheet.png
```

リクエスト形式は次の2種類です。

| 形式 | 指定 |
| --- | --- |
| `multipart/form-data` | `file`フィールドにVRMファイルを1つ指定 |
| `application/octet-stream` | リクエスト本文にVRMのバイナリを指定 |

バイナリ形式では`model/gltf-binary`と`model/vrm`も受け付けます。ファイル上限は25MiBです。VRM 0.x／1.0のGLB形式に対応し、テクスチャはVRM内に埋め込んでください。描画用ブラウザから外部URLへの通信は遮断します。アップロードしたモデルの処理はメモリ内で完結します。リクエストごとにブラウザを起動し、完了・失敗・タイムアウトの際に閉じます。ブラウザ起動後の処理は120秒でタイムアウトします。

APIエラーは`{"error":{"code":"invalid_vrm","message":"..."}}`形式のJSONです。

| ステータス | 内容 |
| --- | --- |
| 400 | ファイル欠落、multipart不正、GLBヘッダー不正 |
| 401 | APIキー欠落・不一致 |
| 404 | 未定義のAPIパス |
| 405 | POST以外のメソッド |
| 413 | 容量超過 |
| 415 | 非対応のContent-Type |
| 422 | VRMの骨格・テクスチャなどの描画エラー |
| 503 | キー未設定、ブラウザ起動失敗、利用上限などによる一時的な利用不能 |
| 504 | 変換処理のタイムアウト |

ローテーションする場合はCloudflareダッシュボードの対象Workerで`API_KEY`シークレットを書き換えてデプロイします。CLIを使う場合は`npx wrangler secret put API_KEY`で更新できます。変更は直ちに反映され、以後は新しいキーを使います。ローカルの`.dev.vars`と呼び出し元のキーも手動で更新してください。キーをフロントエンドのコードやURLへ埋め込むことは禁止です。

Browser Runの[利用料金](https://developers.cloudflare.com/browser-run/pricing/)と[利用上限](https://developers.cloudflare.com/browser-run/limits/)はCloudflareのアカウントプランに従います。

## 使い方

1. 「VRMを読み込む」をクリックするか、読み込み欄に`.vrm`をドロップします。VRM 0.x・1.0に対応しています。
2. 自動生成された48コマを確認します。方向ボタンや歩き／走り、再生・停止、3ポーズの静止表示を切り替えられます。
3. 色数・輪郭・ディザ・コントラスト・鮮やかさは画像にすぐに反映されます。
4. 頭の大きさや歩幅、カメラなどを調整した場合は「48コマを生成」を押して反映します。
5. 全コマPNG、歩きPNG、走りPNG、またはすべてを含むZIPを保存します。

シート上のコマをクリックすると、その方向や動作、ポーズがプレビューに表示されます。市松模様やプレビュー背景、グリッド、ラベルは画像への書き出し対象外です。生成中は同じボタンで処理を中止できます。

### 設定

| 設定           | 初期値・単位     | 効果                                                         |
| -------------- | ---------------- | ------------------------------------------------------------ |
| パレット       | 不透明15色＋透明 | 全48コマで共通です。31色・63色にも変更できます。輪郭色を含む色数です。 |
| 輪郭線         | ON、1px          | 不透明領域の外側に輪郭を追加します。                         |
| ディザ         | OFF              | 控えめな規則的ディザで中間色を表現します。                   |
| コントラスト   | 108%             | 減色前の明暗差を調整します。                                 |
| 鮮やかさ       | 112%             | 減色前の彩度を調整します。                                   |
| 頭の大きさ     | 1.25倍           | 1.0〜1.8倍。小さい画像でも顔が見やすくなるように変形します。 |
| 歩幅・腕の振り | 100%             | 50〜140%。歩行・走行の関節角度を調整します。                 |
| 見下ろす角度   | 8°               | 0〜30°。0°は水平から見た構図です。                           |
| 画像内の大きさ | 100%             | 自動フィットしたサイズを65〜125%に調整します。               |
| 上下位置       | 0px              | −4〜＋4px。正の値で画像内のモデルが下へ移動します。          |
| 正面の補正     | 0°               | 必要に応じて0°・90°・180°・270°から補正します。              |
| 再生速度       | 1倍              | プレビューの速度を調整します。PNGやメタデータには標準再生時間を使用します。  |

VRM 0.xと1.0の正面規約の違いは自動で補正します。「正面の補正」はモデルごとの向きに合わせるための調整です。

## 書き出される画像

すべてのコマは**64×64pxのRGBA PNG**です。背景のアルファは0、モデルと輪郭のアルファは255です。色はRGBの各成分を5bit相当の段階に丸め、48コマ全体から共通パレットを作ります。

| ファイル          | 寸法      | 配置                |
| ----------------- | --------- | ------------------- |
| `spritesheet.png` | 384×512px | 6列×8行、全48コマ   |
| `walk.png`        | 192×512px  | 3列×8行、歩き24コマ |
| `run.png`         | 192×512px  | 3列×8行、走り24コマ |
| `frames/`内のPNG  | 各64×64px | 48枚の個別画像      |

### 行の順序

| 行番号（0始まり） | 向き       | ID           |
| ----------------- | ---------- | ------------ |
| 0                 | ↓ 下・正面 | `down`       |
| 1                 | ↙ 左下    | `down-left`  |
| 2                 | ← 左       | `left`       |
| 3                 | ↖ 左上    | `up-left`    |
| 4                 | ↑ 上・背面 | `up`         |
| 5                 | ↗ 右上    | `up-right`   |
| 6                 | → 右       | `right`      |
| 7                 | ↘ 右下    | `down-right` |

### 列の順序

| 列番号（0始まり） | 動作 | ポーズ     |
| ----------------- | ---- | ---------- |
| 0                 | 歩き | 標準       |
| 1                 | 歩き | 右足を前へ |
| 2                 | 歩き | 左足を前へ |
| 3                 | 走り | 標準       |
| 4                 | 走り | 右足を前へ |
| 5                 | 走り | 左足を前へ |

`walk.png`と`run.png`の列は、それぞれ標準・右足・左足の3列です。**右足・左足はキャラクター本人の解剖学的な左右**を指します。

### 画像ZIPの内容

「すべてZIPで保存」を選択すると、モデル名を基にした`<モデル名>-sprites.zip`が保存されます。ZIP内には次の計53ファイルが含まれます。

- `spritesheet.png`、`walk.png`、`run.png`の3枚。
- `frames/<walk|run>/<direction>/00-neutral.png`、`01-right.png`、`02-left.png`。8方向・2動作の合計48枚。
- `metadata.json`。
- 日本語の`README.txt`。

`metadata.json`には全コマのシート座標、個別ファイル名、不透明領域、共通ピボット、方向、パレット、変換に使った設定、推奨アニメーションを記録します。構図を変更した後は再生成すると書き出しが有効になり、画像とメタデータの設定が一致します。

## ゲーム内での再生

ポーズの列インデックスを**`1 → 0 → 2 → 0`**の順にループさせます。標準の1枚を2回参照するため、必要な画像は1方向につき3枚のままです。

- 歩き: 各150ms、1周600ms。
- 走り: 各90ms、1周360ms。

カメラの投影とスケールは48コマで共通です。地面の原点を画像内の`x=32, y=60＋上下位置`へ対応させ、全コマのピボットとして使用します。コマごとの不透明領域でトリミングして配置すると位置が揺れるため、64×64pxのキャンバスと共通ピボットを維持してください。拡大表示のフィルターには最近傍補間を使用します。

## 変換方式と調整の目安

Humanoidボーンへ手続き的に歩き・走りのポーズを設定し、256×256pxで描画した画像を64×64pxへ縮小・減色します。歩きと走りは歩幅、膝、肘、胴体などの角度が異なります。これは3Dモデルから自動生成するドット絵です。AI画像生成や手描きのピクセル修正は対象外です。

長い髪、帽子、羽根、武器などは全方向の画像範囲に影響します。小さく映る場合は「画像内の大きさ」を上げ、端に触れる場合は下げて調整してください。スカートなどで足が隠れるモデルは、歩幅・見下ろす角度・色数を調整すると動きが分かりやすくなる場合があります。一般的なHumanoid構造から大きく外れるモデルでは関節の動きが意図と異なることがあります。

髪などの揺れ物は各静止画の生成前にリセットし、生成順による変化を防ぎます。衣装の布シミュレーションや外部のVRMA・BVHなどのモーション読み込みは非対応です。モデル固有の衣装には貫通が残ることがあります。

## 開発と検証

自動テストではVRM 0.x／1.0の読み込みと骨格の向き、歩き・走りのポーズ、頭の拡大、ピクセル処理、PNG・ZIPの構成、APIの入力検証、CLIの引数とエラー処理を確認します。PNGとZIPは実際に生成して再解凍・画像デコードし、全48枚とシート上の対応するセルが画素単位で一致することを確認します。

実ブラウザの統合テストでは、Chrome（WebGL 2）でVRM 0.x／1.0を読み込み、Web UIとCLIの出力を画素単位で比較します。書き出す画像の寸法、48枚とシートの画素の一致、PNG・ZIP・メタデータの整合性も自動テストで検証します。

```sh
npm run check
npm test
npm run build
npm run test:cli
npx wrangler deploy --dry-run
```

`npm run test:cli`はビルド後、実際のローカルChrome／EdgeでVRM 0.x／1.0をCLIから変換します。48コマの内容、透過、色数、日本語・空白を含むパス、保存先の指定、上書き防止、不正なモデルの失敗を確認します。さらに実際のWeb UIで同じモデルを生成し、CLIのPNGと全画素を比較します。検証画像は`test-results/cli-*/`に保存します。

APIの実際の動作は`npm run worker:dev`を起動してから、別のターミナルで`npm run test:api`を実行して確認できます。認証拒否や入力エラー、画面の配信、VRM 0.x／1.0からのPNG生成を確認し、画像を`test-results/`へ保存します。`API_TEST_URL`環境変数で公開先を指定すると同じ検証を公開APIに対して実行します。

| コマンド               | 内容                                              |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Vite開発サーバー                                  |
| `npm run cli -- <VRMパス>` | ローカルでVRMを全コマPNGへ変換（要ビルド） |
| `npm run check`        | TypeScript型チェック                              |
| `npm test`             | ピクセル処理・メタデータ・VRMフィクスチャのテスト |
| `npm run test:api`     | 起動済みAPIの認証・入力検証・実際のPNG生成を検証 |
| `npm run test:cli`     | CLIの実変換・エラー処理とWeb UIの画像一致を検証 |
| `npm run types:worker` | Wranglerの環境・ランタイム型を再生成             |
| `npm run licenses:build` | 配信用のアプリ・デモ・依存関係ライセンスを生成 |
| `npm run build`        | 型チェックして`dist/`を生成                       |
| `npm run preview`      | 現在の`dist/`をローカル配信                       |
| `npm run worker:dev`   | ビルド後、Wranglerのローカル配信で確認            |
| `npm run deploy`       | ビルド後、Cloudflare Workersにデプロイ            |
| `npm run deploy:built` | 現在の`dist/`をそのままデプロイ                   |
| `npm run demo:build`   | オリジナルのVRM 1.0／0.0デモを再生成              |

### ファイル構成

| パス                           | 役割                                                 |
| ------------------------------ | ---------------------------------------------------- |
| `index.html`、`src/style.css`  | 日本語UIとレスポンシブ表示                           |
| `src/main.ts`                  | ファイル読み込み、設定、プレビュー、生成・保存の制御 |
| `src/engine.ts`                | Web UI・Web API・CLI共通の変換エンジンの入口 |
| `vrm-pixel.cmd`、`cli/index.mjs` | Windows CLIの起動、VRM読込、PNG保存 |
| `cli/render.mjs`               | ローカルChrome／Edgeの検出・起動、共通描画ページの実行 |
| `cli/options.mjs`              | CLI引数と出力先の解決 |
| `worker/index.ts`              | APIキー認証、描画ブラウザの制御、PNGレスポンス        |
| `worker/api.ts`                | ファイル容量・形式の検証、APIエラー                  |
| `render.html`、`src/api-render.ts` | API・CLIのヘッドレスブラウザの共通描画入口 |
| `src/renderer.ts`              | VRM読込、ポーズ、正面補正、共通カメラでの描画        |
| `src/pose.ts`                  | 歩き・走りの関節ポーズ                               |
| `src/pixel.ts`                 | 64px化、共通RGB555パレット、輪郭、ディザ、シート合成 |
| `src/export.ts`                | PNG、ZIP、メタデータの書き出し                       |
| `src/types.ts`                 | 8方向・3ポーズ・設定・画像の共通定義                 |
| `public/demo.vrm`              | 同梱デモ「Mint」のVRM 1.0版                          |
| `tests/fixtures/demo-vrm0.vrm` | 同じデモのVRM 0.0版。向きと互換性の確認用            |
| `scripts/create-demo.mjs`      | 外部素材不要のデモ生成スクリプト               |
| `wrangler.jsonc`               | Worker、Static Assets、Browser Runの設定             |
| `wrangler.production.jsonc`    | 本番ドメインを追加する設定                            |
| `dist/`                        | ビルド済み配信用ファイル                             |

デモのVRM 0.0版は専用に頂点、ボーン、逆バインド行列を生成し、正面を−Zに合わせています。1.0版からはメタデータに加えてモデルの構造も変更しています。顔と非対称の髪飾りにより、前後・左右を目視で確認できます。テストフィクスチャの詳細は`tests/fixtures/README.md`を参照してください。

## ライセンス・参考資料

アプリ本体は [MIT License](LICENSE) です。オリジナルのデモモデル2点と`create-demo.mjs`は **[CC0 1.0](licenses/CC0-1.0.txt)** です。デモに外部のモデル・テクスチャ素材は使用していません。読み込むVRMと、そのモデルから書き出した画像の利用条件は元のモデルの条件に従います。

参加方法は [CONTRIBUTING.md](CONTRIBUTING.md)、脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。npmパッケージとしては公開していません。リポジトリを取得して利用します。

使用ライブラリとライセンスは`THIRD_PARTY_NOTICES.md`にまとめています。主な公式資料:

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/puppeteer/)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [three-vrm: VRMHumanoid](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html)
- [three-vrm: VRMUtils](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMUtils.html)
- [Three.js](https://threejs.org/)
- [fflate](https://github.com/101arrowz/fflate)
- [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
