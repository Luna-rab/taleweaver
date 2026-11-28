import type { StoredCardKey } from "../ports/card-repository.js";
import type { CardId } from "../value-objects/card-id.js";
import type { Slug } from "../value-objects/slug.js";
import type { SourceId } from "../value-objects/source-id.js";

export type FetchOutcome =
  /** 取得元の全ページを取り終えた。 */
  | {
      readonly kind: "complete";
      readonly frontSourceIds: ReadonlySet<SourceId>;
      readonly frontSlugs: ReadonlySet<Slug>;
    }
  | { readonly kind: "incomplete" };

/**
 * 取得元から消えたカードを選ぶ。
 *
 * 取得が途中で失敗したときは 1 枚も選ばない。取れなかった残りを「消えた」と判断すると、大量のカードを取り下げてしまう。
 * sourceId と slug のどちらかが取得に残っていれば選ばない。取得元が id を振り直しただけのカードを取り下げないため
 * （SyncCard は slug でも照合する）。
 */
export function selectCardsToWithdraw(
  fetch: FetchOutcome,
  stored: readonly StoredCardKey[],
): CardId[] {
  if (fetch.kind === "incomplete") return [];
  return stored
    .filter(
      (card) =>
        !card.withdrawn &&
        !fetch.frontSourceIds.has(card.frontSourceId) &&
        !fetch.frontSlugs.has(card.frontSlug),
    )
    .map((card) => card.id);
}
