// スナップショットは検証前の値を持つ。業務の規則は集約が value object を作るときに確かめる。
// 取得元はセットを返す API を持たず、エディションに埋め込んで返す。infrastructure が全ページから集めて渡す。

export type CardSetSnapshot = {
  readonly sourceId: string;
  readonly prefix: string;
  readonly name: string;
  readonly language: string;
  /** YYYY-MM-DD。取得元は時刻つきで返すので、infrastructure が日付に直す。 */
  readonly releaseDate: string | null;
  readonly sourceUpdatedAt: Date;
};

/** 取得元のセット 1 つ分に合わせる。カードより先に送る。 */
export type SyncCardSet = {
  readonly type: "SyncCardSet";
  readonly snapshot: CardSetSnapshot;
};

export type CardSetCommand = SyncCardSet;
