import type { CardSetSnapshot } from "../../domain/aggregates/card-set/commands.js";
import type { CardSnapshot } from "../../domain/aggregates/card/commands.js";

/** 取得元のカードとセット。 */
export interface CatalogSource {
  /** 全ページを取得する。途中で失敗するか、取れた枚数が取得元の総数と合わなければ例外を投げる。 */
  fetchAll(): Promise<CatalogFetch>;
}

export type CatalogFetch = {
  readonly cards: readonly CardSnapshot[];
  readonly sets: readonly CardSetSnapshot[];
  /**
   * 今回の取得に含まれたカードの表の面。形が合わずに飛ばしたカードも含める。
   * 飛ばしたカードを「取得元から消えた」と判断して取り下げないため。
   */
  readonly includedCards: readonly { readonly sourceId: string; readonly slug: string }[];
  /** 形が合わずに飛ばしたカード。 */
  readonly skipped: readonly { readonly sourceId: string; readonly issues: string }[];
  /** sourceId と slug も読めないカードがあれば false。どのカードが含まれたか分からないので、取り下げを決めない。 */
  readonly canDecideWithdrawals: boolean;
};
