import type { ReferenceKind } from "./reference-kind.js";
import type { Slug } from "./slug.js";
import { type Brand, createBrand } from "./utils/brand.js";

/**
 * あるカードが生成・参照する別のカード（召喚するトークンなど）。
 * 参照先は未発売だったり取得元になかったりするので、カードの id に解決せず slug のまま持つ。
 * 読む側が slug でカードを引き、見つからなければ未収録として扱う。
 */
export type CardReference = Brand<
  {
    readonly kind: ReferenceKind;
    readonly targetSlug: Slug;
  },
  "CardReference"
>;

export const CardReference = createBrand<CardReference>();

/** 種類と参照先の slug が同じなら同じ参照とみなす（DB の主キーと同じ組）。 */
export function sameReference(a: CardReference, b: CardReference): boolean {
  return a.kind === b.kind && a.targetSlug === b.targetSlug;
}

/**
 * sameReference と同じ組を 1 つの文字列にした鍵。Map で重複を除くときと、決まった順に並べるときに使う。
 * 区切りに、どちらにも現れない \u0000 を使う。"A-B" + "C" と "A" + "B-C" を同じ鍵にしないため。
 */
export function referenceKey(r: CardReference): string {
  return `${r.kind}\u0000${r.targetSlug}`;
}
