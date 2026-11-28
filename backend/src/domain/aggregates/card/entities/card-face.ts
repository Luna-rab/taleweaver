import { CardCharacteristics } from "../../../value-objects/card-characteristics.js";
import { CardClass } from "../../../value-objects/card-class.js";
import { CardCost } from "../../../value-objects/card-cost.js";
import { CardName } from "../../../value-objects/card-name.js";
import { CardSpeed } from "../../../value-objects/card-speed.js";
import { CardType } from "../../../value-objects/card-type.js";
import { EffectText } from "../../../value-objects/effect-text.js";
import { Element } from "../../../value-objects/element.js";
import type { FaceSide } from "../../../value-objects/face-side.js";
import { PlainEffectText } from "../../../value-objects/plain-effect-text.js";
import { Slug } from "../../../value-objects/slug.js";
import { SourceId } from "../../../value-objects/source-id.js";
import { StatValue } from "../../../value-objects/stat-value.js";
import { Subtype } from "../../../value-objects/subtype.js";
import type { CardFaceSnapshot } from "../commands.js";

/**
 * カードの面。カードの中では side（表か裏か）で区別し、sourceId や特性が変わっても同じ面として追う。
 * 照合には表の面の sourceId と slug を使う。
 */
export type CardFace = {
  readonly side: FaceSide;
  readonly sourceId: SourceId;
  readonly slug: Slug;
  readonly characteristics: CardCharacteristics;
  readonly effectRaw: PlainEffectText | null;
  readonly sourceUpdatedAt: Date;
};

/** 業務の規則に合わない値があれば RuleViolation を投げる。 */
export function parseCardFace(face: CardFaceSnapshot, side: FaceSide): CardFace {
  return {
    side,
    sourceId: SourceId(face.sourceId),
    slug: Slug(face.slug),
    characteristics: CardCharacteristics({
      name: CardName(face.name),
      elements: face.elements.map((e) => Element(e)),
      classes: face.classes.map((c) => CardClass(c)),
      types: face.types.map((t) => CardType(t)),
      subtypes: face.subtypes.map((s) => Subtype(s)),
      cost: CardCost(face.cost),
      level: stat(face.level),
      life: stat(face.life),
      power: stat(face.power),
      durability: stat(face.durability),
      speed: face.speed === null ? null : CardSpeed(face.speed),
      effect: face.effect === null ? null : EffectText(face.effect),
    }),
    effectRaw: face.effectRaw === null ? null : PlainEffectText(face.effectRaw),
    sourceUpdatedAt: face.sourceUpdatedAt,
  };
}

function stat(value: number | null): StatValue | null {
  return value === null ? null : StatValue(value);
}
