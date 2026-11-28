import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { StoredCardKey } from "../ports/card-repository.js";
import { CardId } from "../value-objects/card-id.js";
import { Slug } from "../value-objects/slug.js";
import { SourceId } from "../value-objects/source-id.js";
import { selectCardsToWithdraw } from "./select-cards-to-withdraw.js";

const key = (sourceId: string, slug: string, withdrawn = false): StoredCardKey => ({
  id: CardId(randomUUID()),
  frontSourceId: SourceId(sourceId),
  frontSlug: Slug(slug),
  withdrawn,
});

describe("selectCardsToWithdraw", () => {
  const kept = key("A", "a");
  const reassigned = key("B-old", "b");
  const gone = key("C", "c");
  const alreadyWithdrawn = key("D", "d", true);
  const stored = [kept, reassigned, gone, alreadyWithdrawn];

  it("取得が途中で失敗したら 1 枚も選ばない", () => {
    expect(selectCardsToWithdraw({ kind: "incomplete" }, stored)).toEqual([]);
  });

  it("sourceId と slug のどちらも取得に無く、まだ取り下げていないカードだけを選ぶ", () => {
    const fetch = {
      kind: "complete" as const,
      frontSourceIds: new Set([SourceId("A"), SourceId("B-new")]),
      frontSlugs: new Set([Slug("a"), Slug("b")]),
    };
    expect(selectCardsToWithdraw(fetch, stored)).toEqual([gone.id]);
  });
});
