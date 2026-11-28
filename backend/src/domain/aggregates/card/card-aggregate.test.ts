import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CardEditionId } from "../../value-objects/card-edition-id.js";
import { CardId } from "../../value-objects/card-id.js";
import { CardSetId } from "../../value-objects/card-set-id.js";
import { FaceSide } from "../../value-objects/face-side.js";
import { ImageId } from "../../value-objects/image-id.js";
import { CardAggregate } from "./card-aggregate.js";
import type {
  CardCommand,
  CardEditionFaceSnapshot,
  CardEditionSnapshot,
  CardSnapshot,
} from "./commands.js";
import { frontEditionFace } from "./entities/card-edition.js";
import { type Card, frontFace } from "./entities/card.js";
import { type CardEvent, changesState } from "./events.js";
import type { CardOperations } from "./operations.js";

const SET_ID = CardSetId(randomUUID());
const SYNCED_AT = new Date("2026-11-28T00:00:00Z");

function edition(
  sourceId: string,
  overrides: Partial<CardEditionSnapshot> = {},
): CardEditionSnapshot {
  return {
    setSourceId: "set-1",
    collectorNumber: "001",
    rarity: 1,
    isDefault: false,
    front: editionFace(sourceId),
    back: null,
    ...overrides,
  };
}

function editionFace(sourceId: string): CardEditionFaceSnapshot {
  return {
    sourceId,
    slug: `${sourceId}-slug`,
    illustrator: "someone",
    collaborators: [],
    flavor: null,
    imageSourcePath: `/cards/images/${sourceId}.jpg`,
    sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function snapshot(overrides: Partial<CardSnapshot> = {}): CardSnapshot {
  return {
    front: {
      sourceId: "AbC123",
      slug: "lorraine-blademaster",
      name: "Lorraine, Blademaster",
      elements: ["NORM"],
      classes: ["WARRIOR"],
      types: ["CHAMPION"],
      subtypes: ["HUMAN"],
      cost: { type: "memory", value: 2 },
      level: 2,
      life: 22,
      power: null,
      durability: null,
      speed: null,
      effect: "**On Enter**: draw a card.",
      effectRaw: "On Enter: draw a card.",
      sourceUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    back: null,
    legality: {},
    rulings: [{ title: null, addedOn: "2025-01-01", description: "A ruling." }],
    references: [{ kind: "SUMMON", targetSlug: "baby-slime" }],
    editions: [edition("ed-1", { isDefault: true })],
    ...overrides,
  };
}

function withFront(base: CardSnapshot, front: Partial<CardSnapshot["front"]>): CardSnapshot {
  return { ...base, front: { ...base.front, ...front } };
}

/** メモリ上の repository。application と同じく、changesState に当たるイベントがあれば保存する。 */
function store(currentFetch: ReadonlySet<string> = new Set()) {
  const cards = new Map<string, Card>();
  const ops: CardOperations = {
    findById: async (id) => cards.get(id) ?? null,
    findByFrontSourceId: async (s) =>
      [...cards.values()].find((c) => frontFace(c).sourceId === s) ?? null,
    findByFrontSlug: async (s) => [...cards.values()].find((c) => frontFace(c).slug === s) ?? null,
    isInCurrentFetch: async (s) => currentFetch.has(s),
    findSetIdBySourceId: async (s) => (s === "set-1" ? SET_ID : null),
    newCardId: () => CardId(randomUUID()),
    newCardEditionId: () => CardEditionId(randomUUID()),
  };
  const run = async (command: CardCommand) => {
    const card = new CardAggregate(ops);
    const events = await card.execute(command);
    if (events.some(changesState) && card.state) cards.set(card.state.id, card.state);
    return { card, events };
  };
  const sync = (s: CardSnapshot) => run({ type: "SyncCard", snapshot: s, syncedAt: SYNCED_AT });
  return { cards, run, sync };
}

const types = (events: readonly CardEvent[]) => events.map((e) => e.type);

describe("SyncCard", () => {
  it("新しいカードは CardRegistered だけを出し、裁定やエディションのイベントは出さない", async () => {
    const { sync } = store();
    const { card, events } = await sync(snapshot());
    expect(types(events)).toEqual(["CardRegistered"]);
    expect(card.state?.editions).toHaveLength(1);
  });

  it("同じスナップショットをもう一度送ると CardUnchanged を出し、状態を変えない", async () => {
    const { sync } = store();
    const first = await sync(snapshot());
    const { card, events } = await sync(snapshot());
    expect(types(events)).toEqual(["CardUnchanged"]);
    expect(events.some(changesState)).toBe(false);
    expect(card.state).toEqual(first.card.state);
  });

  it("面のルールに関わらない値が変わると CardFaceRevised を出す", async () => {
    const { sync } = store();
    await sync(snapshot());
    const { events } = await sync(
      withFront(snapshot(), { slug: "lorraine-blademaster-2", effectRaw: "x" }),
    );
    expect(events).toMatchObject([
      { type: "CardFaceRevised", side: "front", after: { effectRaw: "x" } },
    ]);
  });

  it("コストが変わると CardCharacteristicsChanged を出す", async () => {
    const { sync } = store();
    await sync(snapshot());
    const { events } = await sync(withFront(snapshot(), { cost: { type: "memory", value: 3 } }));
    expect(events).toMatchObject([
      {
        type: "CardCharacteristicsChanged",
        side: "front",
        before: { cost: { value: 2 } },
        after: { cost: { value: 3 } },
      },
    ]);
  });

  it("新しい裁定は CardRulingAdded になり、題に ERRATA を含むものはエラッタとして区別する", async () => {
    const { sync } = store();
    await sync(snapshot());
    const rulings = [
      ...snapshot().rulings,
      { title: "ERRATA, DTR", addedOn: "2026-11-01", description: "Memory cost 2 -> 3" },
    ];
    const { events } = await sync(snapshot({ rulings }));
    expect(events).toMatchObject([
      { type: "CardRulingAdded", isErrata: true, ruling: { title: "ERRATA, DTR" } },
    ]);
  });

  it("裁定が消えると CardRulingRemoved、並びだけが変わると CardRulingsReordered を出す", async () => {
    const { sync } = store();
    const two = [
      { title: null, addedOn: "2025-01-01", description: "A." },
      { title: null, addedOn: "2025-02-01", description: "B." },
    ];
    await sync(snapshot({ rulings: two }));

    const reordered = await sync(snapshot({ rulings: two.toReversed() }));
    expect(types(reordered.events)).toEqual(["CardRulingsReordered"]);

    const removed = await sync(snapshot({ rulings: [two[0]!] }));
    expect(removed.events).toMatchObject([
      { type: "CardRulingRemoved", ruling: { description: "B." } },
    ]);
  });

  it("参照が変わると、増えた参照と消えた参照を CardReferencesChanged に載せる", async () => {
    const { sync } = store();
    await sync(snapshot());
    const { events } = await sync(
      snapshot({ references: [{ kind: "MASTERY", targetSlug: "fractured-memories" }] }),
    );
    expect(events).toMatchObject([
      {
        type: "CardReferencesChanged",
        added: [{ targetSlug: "fractured-memories" }],
        removed: [{ targetSlug: "baby-slime" }],
      },
    ]);
  });

  it("禁止・制限が変わると、変わったフォーマットだけを CardLegalityChanged に載せる", async () => {
    const { sync } = store();
    await sync(snapshot({ legality: { DRAFT: 0 } }));
    const { events } = await sync(snapshot({ legality: { DRAFT: 0, STANDARD: 0 } }));
    expect(events).toMatchObject([
      { type: "CardLegalityChanged", changes: [{ format: "STANDARD", before: null, after: 0 }] },
    ]);
  });

  it("エディションの増減・中身の変化・復帰を、それぞれのイベントで表し、消えた行は残す", async () => {
    const { sync } = store();
    await sync(snapshot());

    const added = await sync(
      snapshot({ editions: [edition("ed-1", { isDefault: true }), edition("ed-2")] }),
    );
    expect(types(added.events)).toEqual(["CardEditionAdded"]);

    const removed = await sync(snapshot({ editions: [edition("ed-2", { isDefault: true })] }));
    expect(types(removed.events).toSorted()).toEqual([
      "CardEditionRevised",
      "CardEditionWithdrawn",
    ]);
    const ed1 = removed.card.state?.editions.find((e) => frontEditionFace(e).sourceId === "ed-1");
    expect(ed1).toMatchObject({ isDefault: false, withdrawnAt: SYNCED_AT });

    const back = await sync(
      snapshot({ editions: [edition("ed-1"), edition("ed-2", { isDefault: true })] }),
    );
    expect(types(back.events)).toEqual(["CardEditionReinstated"]);
    expect(back.card.state?.editions.every((e) => e.withdrawnAt === null)).toBe(true);
  });

  it("取得元が id を振り直しても、slug で同じカードとして照合し、sourceId を書き換える", async () => {
    const { sync } = store();
    const first = await sync(snapshot());
    const { card, events } = await sync(withFront(snapshot(), { sourceId: "NewId99" }));
    expect(events).toMatchObject([{ type: "CardFaceRevised", after: { sourceId: "NewId99" } }]);
    expect(card.state?.id).toBe(first.card.state?.id);
  });

  it("slug で見つかったカードの元の sourceId が今回の取得に残っていれば拒否する", async () => {
    const { cards, sync } = store(new Set(["AbC123"]));
    await sync(snapshot());
    const { events } = await sync(withFront(snapshot(), { sourceId: "NewId99" }));
    // NewId99 は slug が重なった別のカードなので、見つけたカードの id は載せない。
    expect(events).toMatchObject([
      { type: "CardSyncRejected", cardId: null, frontSourceId: "NewId99" },
    ]);
    expect([...cards.values()].map((c) => frontFace(c).sourceId)).toEqual(["AbC123"]);
  });

  it("業務の規則に合わないカードは CardSyncRejected を出し、状態を変えない", async () => {
    const { sync } = store();
    await sync(snapshot());
    const { card, events } = await sync(withFront(snapshot(), { level: null }));
    expect(events).toEqual([
      {
        type: "CardSyncRejected",
        cardId: null,
        frontSourceId: "AbC123",
        reason: "CHAMPION は level を持つ",
      },
    ]);
    expect(events.some(changesState)).toBe(false);
    // 照合の前（スナップショットを読む段階）で拒否したので、保存済みのカードも読んでいない。
    expect(card.state).toBeNull();
  });

  it("総合ルールの一覧にない属性・class・type のカードは CardSyncRejected にする", async () => {
    const { sync } = store();
    for (const [field, value, reason] of [
      ["elements", "AQUA", "総合ルールにない属性: AQUA"],
      ["classes", "BARD", "総合ルールにない class: BARD"],
      ["types", "RELIC", "総合ルールにない type: RELIC"],
    ] as const) {
      const { events } = await sync(withFront(snapshot(), { [field]: [value] }));
      expect(events).toMatchObject([{ type: "CardSyncRejected", reason }]);
    }
  });

  it("照合した後に拒否したときは、CardSyncRejected に cardId を載せ、state は変えない", async () => {
    const { sync } = store();
    const registered = await sync(snapshot());
    // ed-2 の slug は既存の ed-1 と同じで、ed-1 の sourceId も取得に残っている。
    const clash = edition("ed-2");
    const { card, events } = await sync(
      snapshot({
        editions: [
          edition("ed-1", { isDefault: true }),
          { ...clash, front: { ...clash.front, slug: "ed-1-slug" } },
        ],
      }),
    );
    expect(events).toMatchObject([{ type: "CardSyncRejected", cardId: registered.card.state!.id }]);
    // 新しいインスタンスなので、拒否の前の state は null。照合したカードに結び付かない。
    expect(card.state).toBeNull();
  });

  it("両面カードを登録でき、裏面の特性が変わると side: back のイベントを出す", async () => {
    const { sync } = store();
    const base = snapshot();
    const back = { ...base.front, sourceId: "Back1", slug: "back-slug" };
    const twoFaced = (power: number | null): CardSnapshot => ({
      ...base,
      back: { ...back, power },
      editions: [edition("ed-1", { isDefault: true, back: editionFace("ed-1-back") })],
    });
    expect(types((await sync(twoFaced(null))).events)).toEqual(["CardRegistered"]);
    const { events } = await sync(twoFaced(5));
    expect(events).toMatchObject([
      { type: "CardCharacteristicsChanged", side: "back", after: { power: 5 } },
    ]);
  });

  it("エディションの sourceId が変わっても、slug で照合して同じ id を保つ", async () => {
    const { sync } = store();
    const first = await sync(snapshot());
    const renamed = edition("ed-1", { isDefault: true });
    const reassigned = { ...renamed, front: { ...renamed.front, sourceId: "ed-1-new" } };
    const { card, events } = await sync(snapshot({ editions: [reassigned] }));
    expect(types(events)).toEqual(["CardEditionRevised"]);
    expect(card.state?.editions.map((e) => e.id)).toEqual(
      first.card.state?.editions.map((e) => e.id),
    );
  });

  it("repository が参照やエディションを別の順で返しても CardUnchanged になる", async () => {
    const { cards, sync } = store();
    const refs = [
      { kind: "SUMMON", targetSlug: "b" },
      { kind: "MASTERY", targetSlug: "a" },
    ];
    const editions = [edition("ed-1", { isDefault: true }), edition("ed-2")];
    const registered = await sync(snapshot({ references: refs, editions }));
    const stored = registered.card.state!;
    cards.set(stored.id, {
      ...stored,
      references: stored.references.toReversed(),
      editions: stored.editions.toReversed(),
    });
    const { events } = await sync(
      snapshot({ references: refs.toReversed(), editions: editions.toReversed() }),
    );
    expect(types(events)).toEqual(["CardUnchanged"]);
  });

  it("エディションの面の組がカードの面の組とそろわなければ拒否する", async () => {
    const { sync } = store();
    const base = snapshot();
    const twoFaced: CardSnapshot = {
      ...base,
      back: { ...base.front, sourceId: "Back1", slug: "back-slug" },
    };
    const { events } = await sync(twoFaced);
    expect(types(events)).toEqual(["CardSyncRejected"]);
  });

  it("セットが同期されていなければ、拒否ではなく例外を投げる", async () => {
    const { sync } = store();
    await expect(
      sync(snapshot({ editions: [edition("ed-1", { setSourceId: "unknown" })] })),
    ).rejects.toThrow("セットが同期されていない");
  });
});

describe("WithdrawCard", () => {
  it("取り下げると CardWithdrawn、2 回目は CardUnchanged、取得元に戻ると CardReinstated を出す", async () => {
    const { run, sync } = store();
    const registered = await sync(snapshot());
    const cardId = registered.card.state!.id;

    const withdrawn = await run({ type: "WithdrawCard", cardId, withdrawnAt: SYNCED_AT });
    expect(types(withdrawn.events)).toEqual(["CardWithdrawn"]);
    expect(withdrawn.card.state?.withdrawnAt).toEqual(SYNCED_AT);

    const again = await run({ type: "WithdrawCard", cardId, withdrawnAt: SYNCED_AT });
    expect(types(again.events)).toEqual(["CardUnchanged"]);

    const reinstated = await sync(snapshot());
    expect(types(reinstated.events)).toEqual(["CardReinstated"]);
    expect(reinstated.card.state?.withdrawnAt).toBeNull();
  });

  it("存在しないカードを取り下げようとすると、拒否ではなく例外を投げる", async () => {
    const { run } = store();
    await expect(
      run({ type: "WithdrawCard", cardId: CardId(randomUUID()), withdrawnAt: SYNCED_AT }),
    ).rejects.toThrow("カードがない");
  });
});

describe("AttachEditionImage", () => {
  it("画像を結び付けると CardEditionImageAttached を出し、同期しても画像を引き継ぐ", async () => {
    const { run, sync } = store();
    const registered = await sync(snapshot());
    const card = registered.card.state!;
    const editionId = card.editions[0]!.id;
    const imageId = ImageId(randomUUID());
    const attach = () =>
      run({
        type: "AttachEditionImage",
        cardId: card.id,
        editionId,
        side: FaceSide("front"),
        imageId,
      });

    const attached = await attach();
    expect(attached.events).toMatchObject([{ type: "CardEditionImageAttached", imageId }]);
    expect(types((await attach()).events)).toEqual(["CardUnchanged"]);
    await expect(
      run({
        type: "AttachEditionImage",
        cardId: card.id,
        editionId,
        side: FaceSide("front"),
        imageId: ImageId(randomUUID()),
      }),
    ).rejects.toThrow("既に画像");

    const resynced = await sync(snapshot());
    expect(types(resynced.events)).toEqual(["CardUnchanged"]);
    expect(resynced.card.state?.editions[0]?.faces[0]?.imageId).toBe(imageId);
  });

  it("カードにない面に結び付けようとすると、拒否ではなく例外を投げる", async () => {
    const { run, sync } = store();
    const card = (await sync(snapshot())).card.state!;
    await expect(
      run({
        type: "AttachEditionImage",
        cardId: card.id,
        editionId: card.editions[0]!.id,
        side: FaceSide("back"),
        imageId: ImageId(randomUUID()),
      }),
    ).rejects.toThrow("面がない");
  });
});
