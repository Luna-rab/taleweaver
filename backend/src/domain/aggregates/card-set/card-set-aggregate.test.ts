import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CardSetId } from "../../value-objects/card-set-id.js";
import type { Decision } from "../decision.js";
import { CardSetAggregate } from "./card-set-aggregate.js";
import type { CardSetSnapshot } from "./commands.js";
import type { CardSet } from "./entities/card-set.js";
import type { CardSetEvent } from "./events.js";
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

/** メモリ上の repository。application と同じく、accepted の events が空でなければ保存する。 */
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
    const decision = await cardSet.execute({ type: "SyncCardSet", snapshot: s });
    if (decision.kind === "accepted" && decision.events.length > 0 && cardSet.state) {
      sets.set(cardSet.state.id, cardSet.state);
    }
    return { cardSet, decision };
  };
  return { sets, sync };
}

/** accepted の events を返す。rejected なら reason を載せて失敗させる。 */
function eventsOf(decision: Decision<CardSetEvent>): readonly CardSetEvent[] {
  if (decision.kind === "rejected") throw new Error(`rejected: ${decision.reason}`);
  return decision.events;
}

const types = (decision: Decision<CardSetEvent>) => eventsOf(decision).map((e) => e.type);

describe("SyncCardSet", () => {
  it("新しいセットは CardSetRegistered、同じ内容はイベントなし、変われば CardSetRevised を出す", async () => {
    const { sync } = store();
    expect(types((await sync(snapshot())).decision)).toEqual(["CardSetRegistered"]);
    expect((await sync(snapshot())).decision).toEqual({ kind: "accepted", events: [] });
    const { decision } = await sync(snapshot({ releaseDate: "2024-02-01" }));
    expect(eventsOf(decision)).toMatchObject([
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
    const { cardSet, decision } = await sync(snapshot({ sourceId: "new-id" }));
    expect(types(decision)).toEqual(["CardSetRevised"]);
    expect(cardSet.state?.id).toBe(registered.cardSet.state?.id);
  });

  it("略号が重なった別のセットは拒否し、見つけたセットに結び付けず、保存済みのセットも変えない", async () => {
    const { sets, sync } = store(new Set(["muw6lmtzwg", "other"]));
    await sync(snapshot());
    const saved = structuredClone([...sets.values()]);
    const { cardSet, decision } = await sync(snapshot({ sourceId: "other" }));
    expect(decision).toEqual({
      kind: "rejected",
      reason: expect.stringContaining("略号 P24 のセットは sourceId muw6lmtzwg で既にあり"),
    });
    expect(cardSet.state).toBeNull();
    expect([...sets.values()]).toEqual(saved);
  });

  it("業務の規則に合わない値は rejected にする", async () => {
    const { sync } = store();
    const { decision } = await sync(snapshot({ releaseDate: "2024-02-30" }));
    expect(decision).toEqual({
      kind: "rejected",
      reason: expect.stringContaining("日付が YYYY-MM-DD ではない"),
    });
  });
});
