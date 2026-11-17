# コントリビューション

不具合報告・改善提案は [Issues](https://github.com/matsuvr/vrm2pixel/issues)、変更の提案は Pull Request で受け付けます。大きな仕様変更は先に Issue で相談してください。

## 開発環境

Node.js 24系とnpmを使用します。

```sh
git clone https://github.com/matsuvr/vrm2pixel.git
cd vrm2pixel
npm ci
npm run dev
```

Web UIとCLIの利用にCloudflareアカウントやAPIキーは不要です。CLIの実変換テストにはChromeまたはEdgeが必要です。

変更後に次を実行してください。

```sh
npm test
npm run build
```

描画やCLIを変更した場合は `npm run test:cli` で実画像も確認します。APIの検証手順は [README](README.md) を参照してください。GitHub Actions はLinuxとWindowsでテスト・ビルド、Windowsで実ブラウザを使うCLIテストを実行します。

## 素材・機密情報

- 実在の利用者のVRM、個人用モデル、生成画像をコミットしないでください。テストには同梱のCC0デモを使ってください。
- 外部素材を追加する場合は出典・利用条件を明示し、再配布可能であることを確認してください。
- APIキーや認証情報は `.dev.vars` などのGit管理対象外のファイルに保存します。公開Issueやログにも記載しないでください。
- `dist/`、`node_modules/`、`test-results/`、生成した公開用ライセンスファイルはコミットせず、ソースと `package-lock.json` を更新してください。

## ライセンス

コントリビューションは原則としてこのプロジェクトの [MIT License](LICENSE) で提供されます。既存のCC0対象ファイルを変更する場合は、そのCC0条件を維持してください。第三者のコードや素材は元のライセンスを維持し、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記録してください。
