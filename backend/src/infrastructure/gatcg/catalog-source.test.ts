import { describe, expect, it } from "vitest";

import { parseCards } from "./catalog-source.js";

const set = {
  id: "set-1",
  prefix: "DOA 1st",
  name: "Dawn of Ashes",
  language: "EN",
  release_date: "2024-01-24T00:00:00",
  last_update: "2025-01-18T17:40:17.152+00:00",
};

function face(uuid: string, overrides: Record<string, unknown> = {}) {
  return {
    uuid,
    slug: `${uuid}-slug`,
    name: "Some Card",
    elements: ["FIRE"],
    classes: ["MAGE"],
    types: ["ACTION"],
    subtypes: ["SPELL"],
    cost: { type: "reserve", value: "X" },
    level: null,
    life: null,
    power: null,
    durability: null,
    speed: true,
    effect: "effect",
    effect_raw: "effect",
    last_update: "2026-08-22T02:35:43.346Z",
    ...overrides,
  };
}

function editionFace(uuid: string) {
  return {
    uuid,
    slug: `${uuid}-slug`,
    illustrator: "someone",
    collaborators: [],
    flavor: null,
    image: `/cards/images/${uuid}.jpg`,
    last_update: "2026-10-29T12:19:53.549+00:00",
  };
}

function card(uuid: string, overrides: Record<string, unknown> = {}) {
  return {
    ...face(uuid),
    legality: null,
    rule: [{ title: "", date_added: "2023-2-6", description: "A ruling." }],
    references: [{ kind: "GENERATE", slug: "crystal-mastery", direction: "TO" }],
    editions: [
      {
        ...editionFace(`${uuid}-ed`),
        collector_number: "001",
        rarity: 1,
        is_default: true,
        set,
        other_orientations: [
          { ...face(`${uuid}-back`, { speed: null }), edition: editionFace(`${uuid}-ed-back`) },
        ],
      },
    ],
    ...overrides,
  };
}

describe("parseCards", () => {
  it("取得元の表記の揺れを直し、裏面をエディションの other_orientations から読む", () => {
    const fetched = parseCards({ cards: [card("a")], totalCards: 1 });
    const [snapshot] = fetched.cards;
    expect(snapshot).toMatchObject({
      front: { sourceId: "a", cost: { type: "reserve", value: "X" }, speed: "fast" },
      back: { sourceId: "a-back", speed: null },
      legality: {},
      rulings: [{ title: null, addedOn: "2023-02-06" }],
      references: [{ kind: "GENERATE", targetSlug: "crystal-mastery" }],
      editions: [
        { setSourceId: "set-1", front: { sourceId: "a-ed" }, back: { sourceId: "a-ed-back" } },
      ],
    });
    expect(fetched.sets).toEqual([
      {
        sourceId: "set-1",
        prefix: "DOA 1st",
        name: "Dawn of Ashes",
        language: "EN",
        releaseDate: "2024-01-24",
        sourceUpdatedAt: new Date("2025-01-18T17:40:17.152Z"),
      },
    ]);
  });

  it("形が合わないカードは飛ばすが、取得に含まれたものとして数える", () => {
    const fetched = parseCards({ cards: [card("a"), card("b", { rule: null })], totalCards: 2 });
    expect(fetched.cards.map((c) => c.front.sourceId)).toEqual(["a"]);
    expect(fetched.skipped).toEqual([{ sourceId: "b", issues: expect.stringContaining("rule") }]);
    expect(fetched.includedCards).toEqual([
      { sourceId: "a", slug: "a-slug" },
      { sourceId: "b", slug: "b-slug" },
    ]);
    expect(fetched.canDecideWithdrawals).toBe(true);
  });

  it("id と slug も読めないカードがあれば、取り下げを決めないようにする", () => {
    const fetched = parseCards({ cards: [card("a"), { name: "no id" }], totalCards: 2 });
    expect(fetched.cards).toHaveLength(1);
    expect(fetched.canDecideWithdrawals).toBe(false);
  });

  it("同じカードが 2 つのページに出ても 1 枚に数え、総数と合わなければ例外を投げる", () => {
    expect(parseCards({ cards: [card("a"), card("a")], totalCards: 1 }).cards).toHaveLength(1);
    expect(() => parseCards({ cards: [card("a"), card("a")], totalCards: 2 })).toThrow(
      "取得元の総数",
    );
  });
});
