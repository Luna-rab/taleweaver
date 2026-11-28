import { and, asc, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";

import {
  cardEditionFaces,
  cardEditions,
  cardFaces,
  cardReferences,
  cardRulings,
  cards,
} from "../../db/schema.js";
import type { CardEditionFace } from "../../domain/aggregates/card/entities/card-edition-face.js";
import type { CardEdition } from "../../domain/aggregates/card/entities/card-edition.js";
import type { CardFace } from "../../domain/aggregates/card/entities/card-face.js";
import type { Card } from "../../domain/aggregates/card/entities/card.js";
import type { CardRepository, StoredCardKey } from "../../domain/ports/card-repository.js";
import { OptimisticLockError } from "../../domain/ports/optimistic-lock-error.js";
import type { CalendarDate } from "../../domain/value-objects/calendar-date.js";
import { CardCharacteristics } from "../../domain/value-objects/card-characteristics.js";
import type { CardClass } from "../../domain/value-objects/card-class.js";
import type { CardCost } from "../../domain/value-objects/card-cost.js";
import type { CardEditionId } from "../../domain/value-objects/card-edition-id.js";
import type { CardId } from "../../domain/value-objects/card-id.js";
import type { CardName } from "../../domain/value-objects/card-name.js";
import type { CardReference } from "../../domain/value-objects/card-reference.js";
import type { CardSetId } from "../../domain/value-objects/card-set-id.js";
import type { CardSpeed } from "../../domain/value-objects/card-speed.js";
import type { CardType } from "../../domain/value-objects/card-type.js";
import type { Collaborator } from "../../domain/value-objects/collaborator.js";
import type { CollectorNumber } from "../../domain/value-objects/collector-number.js";
import type { EffectText } from "../../domain/value-objects/effect-text.js";
import type { Element } from "../../domain/value-objects/element.js";
import type { FlavorText } from "../../domain/value-objects/flavor-text.js";
import type { Illustrator } from "../../domain/value-objects/illustrator.js";
import type { ImageId } from "../../domain/value-objects/image-id.js";
import type { ImageSourcePath } from "../../domain/value-objects/image-source-path.js";
import type { Legality } from "../../domain/value-objects/legality.js";
import type { PlainEffectText } from "../../domain/value-objects/plain-effect-text.js";
import type { Rarity } from "../../domain/value-objects/rarity.js";
import type { ReferenceKind } from "../../domain/value-objects/reference-kind.js";
import type { RulingDescription } from "../../domain/value-objects/ruling-description.js";
import type { RulingTitle } from "../../domain/value-objects/ruling-title.js";
import type { Ruling } from "../../domain/value-objects/ruling.js";
import type { Slug } from "../../domain/value-objects/slug.js";
import type { SourceId } from "../../domain/value-objects/source-id.js";
import type { StatValue } from "../../domain/value-objects/stat-value.js";
import type { Subtype } from "../../domain/value-objects/subtype.js";
import type { Tx } from "./client.js";
import { excluded } from "./excluded.js";

type FaceRow = typeof cardFaces.$inferSelect;
type EditionRow = typeof cardEditions.$inferSelect;
type EditionFaceRow = typeof cardEditionFaces.$inferSelect;

// DB の値は保存する前に集約が確かめているので、読むときは型だけを付ける。CardCharacteristics は
// 項目を組み立ててから型を付けるため、コンストラクタを通す（検証は通る）。
// 読んだ値は集約が isDeepStrictEqual で取得元の値と比べるので、エンティティにないキーを足さない。

export class DrizzleCardRepository implements CardRepository {
  readonly #tx: Tx;

  constructor(tx: Tx) {
    this.#tx = tx;
  }

  async findById(id: CardId): Promise<Card | null> {
    return await this.#load(id);
  }

  async findByFrontSourceId(sourceId: SourceId): Promise<Card | null> {
    return await this.#loadByFront(eq(cardFaces.sourceId, sourceId));
  }

  async findByFrontSlug(slug: Slug): Promise<Card | null> {
    return await this.#loadByFront(eq(cardFaces.slug, slug));
  }

  async listSourceKeys(): Promise<readonly StoredCardKey[]> {
    const rows = await this.#tx
      .select({
        id: cards.id,
        frontSourceId: cardFaces.sourceId,
        frontSlug: cardFaces.slug,
        withdrawnAt: cards.withdrawnAt,
      })
      .from(cards)
      .innerJoin(cardFaces, and(eq(cardFaces.cardId, cards.id), eq(cardFaces.side, "front")));
    return rows.map((r) => ({
      id: r.id as CardId,
      frontSourceId: r.frontSourceId as SourceId,
      frontSlug: r.frontSlug as Slug,
      withdrawn: r.withdrawnAt !== null,
    }));
  }

  async save(card: Card): Promise<void> {
    await this.#saveRoot(card);
    await this.#saveFaces(card);
    await this.#replaceRulings(card);
    await this.#replaceReferences(card);
    await this.#saveEditions(card);
  }

  async #loadByFront(where: SQL): Promise<Card | null> {
    const [row] = await this.#tx
      .select({ cardId: cardFaces.cardId })
      .from(cardFaces)
      .where(and(where, eq(cardFaces.side, "front")));
    return row === undefined ? null : await this.#load(row.cardId as CardId);
  }

  async #load(id: CardId): Promise<Card | null> {
    const [root] = await this.#tx.select().from(cards).where(eq(cards.id, id));
    if (root === undefined) return null;

    const faces = await this.#tx.select().from(cardFaces).where(eq(cardFaces.cardId, id));
    const rulings = await this.#tx
      .select()
      .from(cardRulings)
      .where(eq(cardRulings.cardId, id))
      .orderBy(asc(cardRulings.position));
    const references = await this.#tx
      .select()
      .from(cardReferences)
      .where(eq(cardReferences.fromCardId, id));
    const editions = await this.#tx.select().from(cardEditions).where(eq(cardEditions.cardId, id));
    const editionFaces = await this.#tx
      .select()
      .from(cardEditionFaces)
      .where(
        inArray(
          cardEditionFaces.editionId,
          editions.map((e) => e.id),
        ),
      );

    const front = faces.find((f) => f.side === "front")!;
    const back = faces.find((f) => f.side === "back");
    return {
      id: root.id as CardId,
      version: root.version,
      front: toFace(front),
      back: back === undefined ? null : toFace(back),
      // 制限のないカードは {} で書くが、列は NULL を許すので {} にそろえる。
      legality: (root.legality ?? {}) as Legality,
      rulings: rulings.map(
        (r) =>
          ({
            title: r.title as RulingTitle | null,
            addedOn: r.addedOn as CalendarDate,
            description: r.description as RulingDescription,
          }) as Ruling,
      ),
      references: references.map(
        (r) => ({ kind: r.kind as ReferenceKind, targetSlug: r.toSlug as Slug }) as CardReference,
      ),
      editions: editions.map((e) =>
        toEdition(
          e,
          editionFaces.filter((f) => f.editionId === e.id),
        ),
      ),
      withdrawnAt: root.withdrawnAt,
    };
  }

  /** 版 0 は新しいカードとして追加し、それ以外は読んだときの版のときだけ書き換える。どちらも版を 1 上げる。 */
  async #saveRoot(card: Card): Promise<void> {
    const values = { legality: card.legality, withdrawnAt: card.withdrawnAt };
    if (card.version === 0) {
      await this.#tx.insert(cards).values({ id: card.id, version: 1, ...values });
      return;
    }
    const updated = await this.#tx
      .update(cards)
      .set({ ...values, version: sql`${cards.version} + 1` })
      .where(and(eq(cards.id, card.id), eq(cards.version, card.version)))
      .returning({ id: cards.id });
    if (updated.length === 0) throw new OptimisticLockError("カード", card.id, card.version);
  }

  async #saveFaces(card: Card): Promise<void> {
    const rows = [
      faceRow(card.id, "front", card.front),
      ...(card.back === null ? [] : [faceRow(card.id, "back", card.back)]),
    ];
    await this.#tx
      .insert(cardFaces)
      .values(rows)
      .onConflictDoUpdate({
        target: [cardFaces.cardId, cardFaces.side],
        set: excluded(cardFaces, rows[0]!),
      });
    await this.#tx.delete(cardFaces).where(
      and(
        eq(cardFaces.cardId, card.id),
        notInArray(
          cardFaces.side,
          rows.map((r) => r.side),
        ),
      ),
    );
  }

  async #replaceRulings(card: Card): Promise<void> {
    await this.#tx.delete(cardRulings).where(eq(cardRulings.cardId, card.id));
    if (card.rulings.length === 0) return;
    await this.#tx.insert(cardRulings).values(
      card.rulings.map((r, position) => ({
        cardId: card.id,
        position,
        title: r.title,
        addedOn: r.addedOn,
        description: r.description,
      })),
    );
  }

  async #replaceReferences(card: Card): Promise<void> {
    await this.#tx.delete(cardReferences).where(eq(cardReferences.fromCardId, card.id));
    if (card.references.length === 0) return;
    await this.#tx
      .insert(cardReferences)
      .values(
        card.references.map((r) => ({ fromCardId: card.id, toSlug: r.targetSlug, kind: r.kind })),
      );
  }

  /**
   * エディションを id を鍵に書き換える。取り下げたエディションも card に残るので、行は消さない。
   * 既定のエディションはカードに 1 つまでという部分一意索引があるので、既定が別のエディションに移るときに
   * 一時的に 2 つにならないよう、既定でないエディションを先に書く。
   */
  async #saveEditions(card: Card): Promise<void> {
    const rows = card.editions.map((e) => editionRow(card.id, e));
    for (const group of [rows.filter((r) => !r.isDefault), rows.filter((r) => r.isDefault)]) {
      if (group.length === 0) continue;
      await this.#tx
        .insert(cardEditions)
        .values(group)
        .onConflictDoUpdate({ target: cardEditions.id, set: excluded(cardEditions, group[0]!) });
    }

    const faceRows = card.editions.flatMap((e) => [
      editionFaceRow(e.id, "front", e.front),
      ...(e.back === null ? [] : [editionFaceRow(e.id, "back", e.back)]),
    ]);
    await this.#tx
      .insert(cardEditionFaces)
      .values(faceRows)
      .onConflictDoUpdate({
        target: [cardEditionFaces.editionId, cardEditionFaces.side],
        set: excluded(cardEditionFaces, faceRows[0]!),
      });
    const singleSided = card.editions.filter((e) => e.back === null).map((e) => e.id);
    if (singleSided.length > 0) {
      await this.#tx
        .delete(cardEditionFaces)
        .where(
          and(inArray(cardEditionFaces.editionId, singleSided), eq(cardEditionFaces.side, "back")),
        );
    }
  }
}

function toFace(row: FaceRow): CardFace {
  const cost: CardCost = (
    row.costType === "none"
      ? { type: "none" }
      : { type: row.costType, value: row.costIsX ? "X" : row.costValue! }
  ) as CardCost;
  const characteristics = CardCharacteristics({
    name: row.name as CardName,
    elements: row.elements as Element[],
    classes: row.classes as CardClass[],
    types: row.types as CardType[],
    subtypes: row.subtypes as Subtype[],
    cost,
    level: row.level as StatValue | null,
    life: row.life as StatValue | null,
    power: row.power as StatValue | null,
    durability: row.durability as StatValue | null,
    speed: row.speed as CardSpeed | null,
    effect: row.effect as EffectText | null,
  });
  return {
    sourceId: row.sourceId as SourceId,
    slug: row.slug as Slug,
    characteristics,
    effectRaw: row.effectRaw as PlainEffectText | null,
    sourceUpdatedAt: row.sourceUpdatedAt,
  };
}

function toEdition(row: EditionRow, faces: readonly EditionFaceRow[]): CardEdition {
  const front = faces.find((f) => f.side === "front")!;
  const back = faces.find((f) => f.side === "back");
  return {
    id: row.id as CardEditionId,
    setId: row.setId as CardSetId,
    collectorNumber: row.collectorNumber as CollectorNumber,
    rarity: row.rarity as Rarity,
    isDefault: row.isDefault,
    withdrawnAt: row.withdrawnAt,
    front: toEditionFace(front),
    back: back === undefined ? null : toEditionFace(back),
  };
}

function toEditionFace(row: EditionFaceRow): CardEditionFace {
  return {
    sourceId: row.sourceId as SourceId,
    slug: row.slug as Slug,
    illustrator: row.illustrator as Illustrator | null,
    collaborators: row.collaborators as Collaborator[],
    flavor: row.flavor as FlavorText | null,
    imageSourcePath: row.imageSourcePath as ImageSourcePath,
    imageId: row.imageId as ImageId | null,
    sourceUpdatedAt: row.sourceUpdatedAt,
  };
}

function faceRow(cardId: CardId, side: "front" | "back", face: CardFace) {
  const c = face.characteristics;
  return {
    cardId,
    side,
    sourceId: face.sourceId,
    slug: face.slug,
    name: c.name,
    elements: [...c.elements],
    classes: [...c.classes],
    types: [...c.types],
    subtypes: [...c.subtypes],
    costType: c.cost.type,
    costValue: c.cost.type === "none" || c.cost.value === "X" ? null : c.cost.value,
    costIsX: c.cost.type !== "none" && c.cost.value === "X",
    level: c.level,
    life: c.life,
    power: c.power,
    durability: c.durability,
    speed: c.speed,
    effect: c.effect,
    effectRaw: face.effectRaw,
    sourceUpdatedAt: face.sourceUpdatedAt,
  } satisfies typeof cardFaces.$inferInsert;
}

function editionRow(cardId: CardId, edition: CardEdition) {
  return {
    id: edition.id,
    cardId,
    setId: edition.setId,
    collectorNumber: edition.collectorNumber,
    rarity: edition.rarity,
    isDefault: edition.isDefault,
    withdrawnAt: edition.withdrawnAt,
  } satisfies typeof cardEditions.$inferInsert;
}

function editionFaceRow(editionId: CardEditionId, side: "front" | "back", face: CardEditionFace) {
  return {
    editionId,
    side,
    sourceId: face.sourceId,
    slug: face.slug,
    illustrator: face.illustrator,
    collaborators: [...face.collaborators],
    flavor: face.flavor,
    imageSourcePath: face.imageSourcePath,
    imageId: face.imageId,
    sourceUpdatedAt: face.sourceUpdatedAt,
  } satisfies typeof cardEditionFaces.$inferInsert;
}
