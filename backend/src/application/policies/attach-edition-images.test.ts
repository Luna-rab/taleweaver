import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CardAggregate } from "../../domain/aggregates/card/card-aggregate.js";
import type { CardEditionSnapshot } from "../../domain/aggregates/card/commands.js";
import type { Card } from "../../domain/aggregates/card/entities/card.js";
import type { Image } from "../../domain/aggregates/image/entities/image.js";
import { CardEditionId } from "../../domain/value-objects/card-edition-id.js";
import { CardId } from "../../domain/value-objects/card-id.js";
import { CardSetId } from "../../domain/value-objects/card-set-id.js";
import { ImageId } from "../../domain/value-objects/image-id.js";
import { StorageKey } from "../../domain/value-objects/storage-key.js";
import type { Job } from "../ports/job-queue.js";
import type { SourceImageDownload } from "../ports/source-image-fetcher.js";
import type { Transaction } from "../ports/unit-of-work.js";
import { attachEditionImages } from "./attach-edition-images.js";

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const ids = {
  newCardId: () => CardId(randomUUID()),
  newCardEditionId: () => CardEditionId(randomUUID()),
  newCardSetId: () => CardSetId(randomUUID()),
  newImageId: () => ImageId(randomUUID()),
};

function edition(sourceId: string): CardEditionSnapshot {
  return {
    setSourceId: "set-1",
    collectorNumber: "001",
    rarity: 1,
    isDefault: false,
    front: {
      sourceId,
      slug: `${sourceId}-slug`,
      illustrator: null,
      collaborators: [],
      flavor: null,
      imageSourcePath: `/cards/images/${sourceId}.jpg`,
      sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    back: null,
  };
}

/** エディション ed-1・ed-2・ed-3 を持つカード。ed-2 は取り下げ、ed-3 の面には画像がある。 */
async function card(): Promise<Card> {
  const aggregate = new CardAggregate({
    findById: async () => null,
    findByFrontSourceId: async () => null,
    findByFrontSlug: async () => null,
    isInCurrentFetch: async () => false,
    findSetIdBySourceId: async () => CardSetId(randomUUID()),
    ...ids,
  });
  await aggregate.execute({
    type: "SyncCard",
    syncedAt: new Date("2026-11-28T00:00:00Z"),
    snapshot: {
      front: {
        sourceId: "AbC123",
        slug: "some-card",
        name: "Some Card",
        elements: ["NORM"],
        classes: [],
        types: ["ACTION"],
        subtypes: [],
        cost: { type: "memory", value: 1 },
        level: null,
        life: null,
        power: null,
        durability: null,
        speed: null,
        effect: null,
        effectRaw: null,
        sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      back: null,
      legality: {},
      rulings: [],
      references: [],
      editions: ["ed-1", "ed-2", "ed-3"].map(edition),
    },
  });
  const state = aggregate.state!;
  const bySource = (s: string) => state.editions.find((e) => e.front.sourceId === s)!;
  return {
    ...state,
    version: 1,
    editions: state.editions.map((e) =>
      e === bySource("ed-2")
        ? { ...e, withdrawnAt: new Date("2026-11-01T00:00:00Z") }
        : e === bySource("ed-3")
          ? { ...e, front: { ...e.front, imageId: ImageId(randomUUID()) } }
          : e,
    ),
  };
}

/** メモリ上の DB・取得元・ストレージで、ポリシーを 1 回動かす。 */
async function run(event: (c: Card) => { type: string }, download: SourceImageDownload) {
  const initial = await card();
  const cards = new Map([[initial.id, initial]]);
  const images: Image[] = [];
  const appended: string[] = [];
  const fetched: string[] = [];
  const stored: string[] = [];
  const tx = {
    cards: {
      findById: async (id: string) => cards.get(id as CardId) ?? null,
      save: async (c: Card) => void cards.set(c.id, c),
    },
    images: { save: async (i: Image) => void images.push(i) },
    events: {
      findById: async () => event(initial),
      append: async (_: unknown, events: readonly { type: string }[]) =>
        void appended.push(...events.map((e) => e.type)),
    },
  } as unknown as Transaction;
  const handler = attachEditionImages({
    unitOfWork: { run: (work) => work(tx) },
    fetcher: { fetch: async (path) => (fetched.push(path), download) },
    storage: { put: async (key) => void stored.push(key), delete: async () => {} },
    ids,
    newStorageKey: (id) => StorageKey(`${id}/${randomUUID()}.jpg`),
    logger: silent,
    now: () => new Date(),
  });
  const job: Job = {
    id: "job",
    kind: "attach-edition-images",
    payload: { eventId: "e" },
    attempts: 1,
  };
  await handler(job);
  return { initial, card: cards.get(initial.id)!, images, appended, fetched, stored };
}

const ok: SourceImageDownload = {
  result: {
    kind: "fetched",
    contentType: "image/jpeg",
    width: 500,
    height: 700,
    byteSize: 3,
    etag: null,
  },
  bytes: new Uint8Array([1, 2, 3]),
};

describe("attachEditionImages", () => {
  it("CardRegistered なら、取り下げておらず画像のない面だけを取得して結び付ける", async () => {
    const r = await run((c) => ({ type: "CardRegistered", cardId: c.id }), ok);
    expect(r.fetched).toEqual(["/cards/images/ed-1.jpg"]);
    expect(r.stored).toEqual([r.images[0]!.storageKey]);
    expect(r.appended).toEqual(["ImageRegistered", "CardEditionImageAttached"]);
    const ed1 = r.card.editions.find((e) => e.front.sourceId === "ed-1")!;
    expect(ed1.front.imageId).toBe(r.images[0]!.id);
  });

  it("CardEditionAdded なら、そのエディションだけを見る。画像があれば何もしない", async () => {
    const r = await run(
      (c) => ({
        type: "CardEditionAdded",
        cardId: c.id,
        editionId: c.editions.find((e) => e.front.sourceId === "ed-3")!.id,
      }),
      ok,
    );
    expect(r.fetched).toEqual([]);
    expect(r.card).toBe(r.initial);
  });

  it("取得元が 404 なら、画像も結び付けも保存しない", async () => {
    const r = await run((c) => ({ type: "CardRegistered", cardId: c.id }), {
      result: { kind: "notFound" },
    });
    expect(r.fetched).toEqual(["/cards/images/ed-1.jpg"]);
    expect([r.images, r.stored, r.appended]).toEqual([[], [], []]);
    expect(r.card).toBe(r.initial);
  });
});
