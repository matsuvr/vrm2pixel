# セキュリティ報告

修正は `main` の最新版を対象に行います。

APIキーの漏えい、モデル経由の外部通信、認証回避など、悪用につながる問題は [GitHubの非公開脆弱性報告](https://github.com/matsuvr/vrm2pixel/security/advisories/new) から報告してください。再現手順、影響範囲、対象コミットを含め、実際のキーや個人用VRMは添付しないでください。

誤ってキーを公開した場合は、公開物の削除に加えてCloudflare側の `API_KEY` を直ちに更新してください。

Web UIとCLIはローカルでモデルを処理します。Web APIはCloudflareへモデルを送信します。独自にAPIを公開する場合はシークレットの設定とBrowser Runの利用上限を確認してください。
