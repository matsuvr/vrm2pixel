# Third-party notices

ブラウザに配信するバンドルには次のOSSを使用します。バージョンはこのプロジェクトの`package-lock.json`とインストール済みパッケージを基に記載しています。

| パッケージ                                             | バージョン | ライセンス | 用途                           |
| ------------------------------------------------------ | ---------- | ---------- | ------------------------------ |
| [three](https://github.com/mrdoob/three.js)            | 0.187.0    | MIT        | 3D描画・glTF読込               |
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) | 3.5.5      | MIT        | VRM 0.x / 1.0・Humanoid・MToon |
| [fflate](https://github.com/101arrowz/fflate)          | 0.8.3      | MIT        | ZIP作成                        |

`@pixiv/three-vrm`に含まれる関連`@pixiv/three-vrm-*`パッケージもpixiv Inc.のMIT Licenseで提供されています。Three.jsのアドオンもThree.jsのライセンスに従います。

## 開発・ビルド用

Windows CLIでは、ローカルのChrome／Edgeの起動と操作に[puppeteer-core](https://github.com/puppeteer/puppeteer) **25.18.0（Apache-2.0）**を使用します。`puppeteer-core`はブラウザ本体を同梱・ダウンロードしません。ライセンス本文は [`licenses/Apache-2.0.txt`](https://github.com/matsuvr/vrm2pixel/blob/main/licenses/Apache-2.0.txt) を参照してください。Workerは`@cloudflare/puppeteer` **2.0.0（Apache-2.0）**を使用します。これらのパッケージはWeb UIのブラウザ配信バンドルには含まれません。

| パッケージ                                                         | バージョン | ライセンス        |
| ------------------------------------------------------------------ | ---------- | ----------------- |
| [typescript](https://github.com/microsoft/TypeScript)              | 5.9.3      | Apache-2.0        |
| [vite](https://github.com/vitejs/vite)                             | 8.3.8      | MIT               |
| [wrangler](https://github.com/cloudflare/workers-sdk)              | 4.164.0    | MIT OR Apache-2.0 |
| [tsx](https://github.com/privatenumber/tsx)                        | 4.23.15    | MIT               |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped)  | 24.19.2    | MIT               |
| [@types/three](https://github.com/DefinitelyTyped/DefinitelyTyped) | 0.183.1    | MIT               |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas)          | 1.1.1      | MIT               |

間接依存関係の正確な一覧は`package-lock.json`を参照してください。`npm run build`は本番依存パッケージのライセンス・NOTICE本文を集め、配信先の [`THIRD_PARTY_LICENSES.txt`](https://vrm2pixel.catkawaii.com/THIRD_PARTY_LICENSES.txt) を生成します。npm配布物に本文がないパッケージは [`licenses/README.md`](https://github.com/matsuvr/vrm2pixel/blob/main/licenses/README.md) に記録した上流の本文を使用します。ソースリポジトリに`node_modules/`やビルド成果物は含めません。

## オリジナルのデモ

`public/demo.vrm`、`tests/fixtures/demo-vrm0.vrm`、`scripts/create-demo.mjs`はこのプロジェクト向けのオリジナルです。外部のモデル・テクスチャ・キャラクター素材を使用しておらず、[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)で提供します。これらを含むビルド済み`dist/demo.vrm`も同じ条件です。

## バンドルに含まれるライセンス本文

### three

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### @pixiv/three-vrm

```text
Copyright (c) 2019-2026 pixiv Inc.

MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### fflate

```text
MIT License

Copyright (c) 2026 Arjun Barrett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
