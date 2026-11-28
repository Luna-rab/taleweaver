import type { CardClass } from "./card-class.js";
import type { CardCost } from "./card-cost.js";
import type { CardName } from "./card-name.js";
import type { CardSpeed } from "./card-speed.js";
import type { CardType } from "./card-type.js";
import type { EffectText } from "./effect-text.js";
import type { Element } from "./element.js";
import type { StatValue } from "./stat-value.js";
import type { Subtype } from "./subtype.js";
import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * 面の特性のうち、ルールに関わるもの。これが変わると CardCharacteristicsChanged を出す。
 * 検索用の PlainEffectText のように、ルールに関わらない値は含めない。
 */
export type CardCharacteristics = Brand<
  {
    readonly name: CardName;
    /** 先頭が代表の属性。空のことがある（取得元に実在する）。 */
    readonly elements: readonly Element[];
    readonly classes: readonly CardClass[];
    readonly types: readonly CardType[];
    readonly subtypes: readonly Subtype[];
    readonly cost: CardCost;
    readonly level: StatValue | null;
    readonly life: StatValue | null;
    readonly power: StatValue | null;
    readonly durability: StatValue | null;
    readonly speed: CardSpeed | null;
    readonly effect: EffectText | null;
  },
  "CardCharacteristics"
>;

// 種別ごとの規則は、総合ルールに明記された向き（「X は Y を持つ」）だけを置く。
// 「Y を持つのは X だけ」の向きは置かない。今のデータで成り立っても、新しい種別のカードが出たときに
// 拒否し続けて更新を止めてしまうため。speed・durability・コストなしもルールが種別を限っていないので置かない。
export const CardCharacteristics = createBrand<CardCharacteristics>((v) => {
  const types = new Set<string>(v.types);
  const has = (...names: string[]) => names.some((n) => types.has(n));

  ensure(v.types.length > 0, "type が 1 つもない");
  // game-terms#Level (base)
  ensure(!has("CHAMPION") || v.level !== null, "CHAMPION は level を持つ");
  // parts-of-a-card-stats#Life:1
  ensure(!has("ALLY", "CHAMPION") || v.life !== null, "ALLY と CHAMPION は life を持つ");
  // parts-of-a-card-stats#Power:1
  ensure(
    !has("ALLY", "WEAPON", "ATTACK") || v.power !== null,
    "ALLY・WEAPON・ATTACK は power を持つ",
  );
  // parts-of-a-card-cost#Cost:1 の例と card-types-supertypes#Regalia
  ensure(
    !has("CHAMPION", "REGALIA") || v.cost.type === "memory",
    "CHAMPION と REGALIA はメモリーコストを持つ",
  );
});
