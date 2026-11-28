# Taleweaver

Grand Archive TCG の環境を分析する助けになる Web アプリ。特に、複数人で知見を共有する機能に力を入れる。

## できるようにしたいこと

- 調整チームの中で知見を共有する
- アーキタイプとメタを分析する
- 自分の戦績を分析する
- デッキの構築やアイデア出しなど、カードゲームをするうえでの知識を集める

## 開発

カードのデータは api.gatcg.com から取り込む。カードを書き換えるのは同期だけで、API はカードを読むだけ。

devcontainer で開くと、DB・テスト用の DB・画像のストレージ・ルールを引く MCP サーバー（ga-rules）も起動する。

取得元のカードを開発用の DB に取り込むには、`backend` で `npm run db:migrate` の後に `npm run sync:catalog` を実行する。

- 開発の規約: [AGENTS.md](AGENTS.md)、[backend/AGENTS.md](backend/AGENTS.md)
- 取得元のデータ: [backend/docs/gatcg-source.md](backend/docs/gatcg-source.md)
- 集約の設計判断: [Card](backend/docs/card-aggregate.md)、[CardSet](backend/docs/card-set-aggregate.md)、[Image](backend/docs/image-aggregate.md)
