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
