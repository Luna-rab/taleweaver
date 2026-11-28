# backend の規約

ドメインの知識は `docs/` にある。

- [取得元（api.gatcg.com）のデータ](docs/gatcg-source.md)
- [Card 集約の設計](docs/card-aggregate.md)
- [CardSet 集約の設計](docs/card-set-aggregate.md)
- [Image 集約の設計](docs/image-aggregate.md)

## 層

infrastructure / application / domain / presentation の 4 層に分ける。domain はほかの層に依存しない。

| 層             | 置くもの                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain         | `value-objects/`・`aggregates/`・`ports/`（repository などの interface）・`services/`（集約に属さない処理）                                           |
| application    | 同期ジョブなど、集約を動かして保存する手順・`ports/`（unit of work など application が使う interface）・`policies/`（どのイベントでどの仕事を積むか） |
| infrastructure | 取得元の API クライアント、DB の repository と unit of work（domain と application の `ports/` の実装）                                               |
| presentation   | hono の API、CLI（`cli/`）                                                                                                                            |

相対パスの import には `.js` を付ける（`module: NodeNext`）。

## value object

- `value-objects/` に 1 ファイル 1 つ置き、`utils/brand.ts` の `Brand` と `createBrand` で作る。
- 置くのは、ドメインの言葉で名前の付いた値で、全部の値が同じなら同じとみなせるもの。規則があれば `createBrand` に渡す関数で確かめる。
- ドメインの意味を持つ文字列（illustrator・flavor・subtype など）は、確かめる規則がなくても value object にする（`createBrand<X>()` を引数なしで呼ぶ）。
- 関数の引数や戻り値の形として作っただけの型は、value object にせず、その関数のファイルに置く。
- value object を読むだけの副作用のない関数（例: `sameRuling`）は、その value object のファイルに置いてよい。

## エンティティと集約

- エンティティは `aggregates/<集約>/entities/` に 1 ファイル 1 つ置く。ルートのエンティティは集約の名前（例: `Card`）にし、集約の class は `<名前>Aggregate`（例: `CardAggregate`）にする。
- 集約は、判断に要る操作をコンストラクタで受け取り、`execute(command)` で `Decision`（`aggregates/decision.ts`）を返す。
- accepted の events には状態を変えたイベントだけを入れ、空なら変更なし。業務の規則に合わなければ rejected を返す。イベントは状態を変えた事実を表すので、変更なしや拒否をイベントにしない。
- 状態の変化はどれもイベントで表し、購読する処理がまだないイベントも出す。イベントのない変化が起きたら、集約の誤りとして例外を投げる。
- 状態は集約の class が持つ。application は、accepted の events が空でなければ `repository.save(aggregate.state)` を呼ぶ。集約は読み込んだときの状態を持たず、repository は upsert する。
- ルートのエンティティは楽観ロックの `version` を持つ。集約は読んだ値を引き継ぐだけで、repository の save が読んだときの版と比べて 1 上げ、合わなければ例外を投げる。
- 主キーは保存の前に `IdGenerator` で決め、イベントに載せる。DB の既定値（`uuidv7()`）と同じく UUID v7 を使う。

## 検証と失敗の扱い

| 起きたこと                                                      | どこで確かめるか                      | 扱い                                                               |
| --------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| 外から来た値の形（型・必須項目）が合わない                      | presentation と infrastructure の zod | そのデータを飛ばして報告する                                       |
| 業務の規則に合わない                                            | value object と集約                   | `RuleViolation` を投げ、集約が rejected を返す。残りの処理は続ける |
| 手順の誤り（前提のデータがない、集約の使い方の誤り）、DB の障害 | —                                     | `Error` のまま投げる。業務の結果ではないため                       |

業務の規則は zod に書かない。2 か所に書くとずれるため。取得元の表記の揺れは infrastructure で直してから domain に渡す。
