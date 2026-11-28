import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CardSetId } from "../../value-objects/card-set-id.js";
import { CardSetAggregate } from "./card-set-aggregate.js";
import type { CardSetSnapshot } from "./commands.js";
import type { CardSet } from "./entities/card-set.js";
import { type CardSetEvent, changesState } from "./events.js";
import type { CardSetOperations } from "./operations.js";

function snapshot(overrides: Partial<CardSetSnapshot> = {}): CardSetSnapshot {
  return {
    sourceId: "muw6lmtzwg",
    prefix: "P24",
    name: "Promotional 2024",
    language: "EN",
    releaseDate: "2024-01-24",
    sourceUpdatedAt: new Date("2025-01-18T17:40:17Z"),
    ...overrides,
  };
}

/** メモリ上の repository。application と同じく、changesState に当たるイベントがあれば保存する。 */
function store(currentFetch: ReadonlySet<string> = new Set()) {
  const sets = new Map<string, CardSet>();
  const ops: CardSetOperations = {
    findBySourceId: async (s) => [...sets.values()].find((c) => c.sourceId === s) ?? null,
    findByPrefix: async (p) => [...sets.values()].find((c) => c.prefix === p) ?? null,
    isInCurrentFetch: async (s) => currentFetch.has(s),
    newCardSetId: () => CardSetId(randomUUID()),
  };
  const sync = async (s: CardSetSnapshot) => {
    const cardSet = new CardSetAggregate(ops);
    const events = await cardSet.execute({ type: "SyncCardSet", snapshot: s });
    if (events.some(changesState) && cardSet.state) sets.set(cardSet.state.id, cardSet.state);
    return { cardSet, events };
  };
  return { sync };
}

const types = (events: readonly CardSetEvent[]) => events.map((e) => e.type);

describe("SyncCardSet", () => {
  it("新しいセットは CardSetRegistered、同じ内容は CardSetUnchanged、変われば CardSetRevised を出す", async () => {
    const { sync } = store();
    expect(types((await sync(snapshot())).events)).toEqual(["CardSetRegistered"]);
    expect(types((await sync(snapshot())).events)).toEqual(["CardSetUnchanged"]);
    const { events } = await sync(snapshot({ releaseDate: "2024-02-01" }));
    expect(events).toMatchObject([
      {
        type: "CardSetRevised",
        before: { releaseDate: "2024-01-24" },
        after: { releaseDate: "2024-02-01" },
      },
    ]);
  });

  it("sourceId が振り直されても、略号で照合して同じ id を保つ", async () => {
    const { sync } = store();
    const registered = await sync(snapshot());
    const { cardSet, events } = await sync(snapshot({ sourceId: "new-id" }));
    expect(types(events)).toEqual(["CardSetRevised"]);
    expect(cardSet.state?.id).toBe(registered.cardSet.state?.id);
  });

  it("略号が重なった別のセットは、照合の段で拒否して cardSetId を null にする", async () => {
    const { sync } = store(new Set(["muw6lmtzwg", "other"]));
    await sync(snapshot());
    const { cardSet, events } = await sync(snapshot({ sourceId: "other" }));
    expect(events).toMatchObject([{ type: "CardSetSyncRejected", cardSetId: null }]);
    expect(cardSet.state).toBeNull();
  });

  it("業務の規則に合わない値は CardSetSyncRejected にする", async () => {
    const { sync } = store();
    const { events } = await sync(snapshot({ releaseDate: "2024-02-30" }));
    expect(types(events)).toEqual(["CardSetSyncRejected"]);
  });
});
