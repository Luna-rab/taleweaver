import type { CardSetSnapshot } from "../../domain/aggregates/card-set/commands.js";
import type {
  CardEditionFaceSnapshot,
  CardFaceSnapshot,
  CardSnapshot,
} from "../../domain/aggregates/card/commands.js";
import type { GatcgCard, GatcgEditionFace, GatcgFace, GatcgSet } from "./schemas.js";

// 取得元の表記の揺れは、ここで直してから domain に渡す（docs/gatcg-source.md の「表記の揺れ」）。

export function toCardSnapshot(card: GatcgCard): CardSnapshot {
  // 裏面はカードの項目になく、エディションの other_orientations に入っている。
  const back = card.editions.flatMap((e) => e.other_orientations)[0];
  return {
    front: toFace(card),
    back: back === undefined ? null : toFace(back),
    legality: Object.fromEntries(
      Object.entries(card.legality ?? {}).map(([format, { limit }]) => [format, limit]),
    ),
    rulings: card.rule.map((r) => ({
      title: r.title === "" ? null : r.title,
      addedOn: padDate(r.date_added),
      description: r.description,
    })),
    references: card.references.map((r) => ({ kind: r.kind, targetSlug: r.slug })),
    editions: card.editions.map((e) => {
      const backFace = e.other_orientations[0];
      return {
        setSourceId: e.set.id,
        collectorNumber: e.collector_number,
        rarity: e.rarity,
        isDefault: e.is_default,
        front: toEditionFace(e),
        back: backFace === undefined ? null : toEditionFace(backFace.edition),
      };
    }),
  };
}

/** カードのエディションに埋め込まれたセットを集める。同じ id のセットは最初のものを使う。 */
export function collectSets(cards: readonly GatcgCard[]): CardSetSnapshot[] {
  const sets = new Map(cards.flatMap((c) => c.editions.map((e) => [e.set.id, e.set] as const)));
  return [...sets.values()].map(toCardSetSnapshot);
}

function toCardSetSnapshot(set: GatcgSet): CardSetSnapshot {
  return {
    sourceId: set.id,
    prefix: set.prefix,
    name: set.name,
    language: set.language,
    // 時刻つきで返るので日付に直す。
    releaseDate: set.release_date === null ? null : set.release_date.slice(0, 10),
    sourceUpdatedAt: new Date(set.last_update),
  };
}

function toFace(face: GatcgFace): CardFaceSnapshot {
  return {
    sourceId: face.uuid,
    slug: face.slug,
    name: face.name,
    elements: face.elements,
    classes: face.classes,
    types: face.types,
    subtypes: face.subtypes,
    cost:
      face.cost.type === "none"
        ? { type: "none" }
        : {
            type: face.cost.type,
            // X コストは cost.value が "X" で返る（cost_memory などは -1）。
            value: face.cost.value === "X" ? "X" : Number(face.cost.value),
          },
    level: face.level,
    life: face.life,
    power: face.power,
    durability: face.durability,
    speed: face.speed === null ? null : face.speed ? "fast" : "slow",
    effect: face.effect,
    effectRaw: face.effect_raw,
    sourceUpdatedAt: new Date(face.last_update),
  };
}

function toEditionFace(face: GatcgEditionFace): CardEditionFaceSnapshot {
  return {
    sourceId: face.uuid,
    slug: face.slug,
    illustrator: face.illustrator,
    collaborators: face.collaborators,
    flavor: face.flavor,
    imageSourcePath: face.image,
    sourceUpdatedAt: new Date(face.last_update),
  };
}

/** 裁定の日付は 0 で埋めていないことがある（2023-2-6）。形が違えばそのまま渡し、domain に拒否させる。 */
function padDate(date: string): string {
  return date.replace(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    (_, y: string, m: string, d: string) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
  );
}
