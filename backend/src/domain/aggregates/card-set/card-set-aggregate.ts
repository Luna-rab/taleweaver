import { isDeepStrictEqual } from "node:util";

import { CalendarDate } from "../../value-objects/calendar-date.js";
import { CardSetLanguage } from "../../value-objects/card-set-language.js";
import { CardSetName } from "../../value-objects/card-set-name.js";
import { CardSetPrefix } from "../../value-objects/card-set-prefix.js";
import { SourceId } from "../../value-objects/source-id.js";
import { ensure } from "../../value-objects/utils/rule-violation.js";
import { type Decision, decide } from "../decision.js";
import type { CardSetCommand, CardSetSnapshot, SyncCardSet } from "./commands.js";
import type { CardSet } from "./entities/card-set.js";
import type { CardSetEvent } from "./events.js";
import type { CardSetOperations } from "./operations.js";

/**
 * カードを収録したセットを扱う集約。
 *
 * 1 つのインスタンスは 1 つのセットだけを扱う。どのセットかは最初のコマンドの照合で決まり、
 * 後のコマンドは DB ではなく state と照合する。別のセットに当たれば例外を投げる。
 */
export class CardSetAggregate {
  readonly #ops: CardSetOperations;
  #state: CardSet | null = null;

  constructor(ops: CardSetOperations) {
    this.#ops = ops;
  }

  /** このインスタンスが扱うセットの、最後のコマンドを処理した後の状態。拒否したときは前の状態のまま。 */
  get state(): CardSet | null {
    return this.#state;
  }

  async execute(command: CardSetCommand): Promise<Decision<CardSetEvent>> {
    switch (command.type) {
      case "SyncCardSet":
        return await decide(() => this.#sync(command));
    }
  }

  async #sync(command: SyncCardSet): Promise<readonly CardSetEvent[]> {
    const parsed = parseSnapshot(command.snapshot);
    const existing = await this.#findExisting(parsed);
    const next: CardSet = { id: existing?.id ?? this.#ops.newCardSetId(), ...parsed };
    if (existing === null) {
      this.#state = next;
      return [{ type: "CardSetRegistered", cardSetId: next.id, cardSet: next }];
    }
    if (isDeepStrictEqual(next, existing)) {
      this.#state = existing;
      return [];
    }
    this.#state = next;
    return [{ type: "CardSetRevised", cardSetId: next.id, before: existing, after: next }];
  }

  /**
   * sourceId で探し、見つからなければ略号で探す（取得元が id を振り直したとき）。略号で見つけたセットの
   * 元の sourceId が今回の取得に残っていれば拒否する。このインスタンスがすでにセットを扱っていれば、DB ではなくそのセットと照合する。
   */
  async #findExisting(parsed: ParsedCardSet): Promise<CardSet | null> {
    const current = this.#state;
    if (current !== null) {
      if (current.sourceId === parsed.sourceId) return current;
      // 別のセットに当たるのは、インスタンスを使い回した application の誤りなので、拒否ではなく例外にする。
      if (current.prefix !== parsed.prefix) {
        throw new Error(
          `セット ${current.id} を扱うインスタンスに、別のセット（sourceId ${parsed.sourceId}）の同期が送られた`,
        );
      }
      await this.#ensureSourceIdReassigned(parsed.prefix, current.sourceId);
      return current;
    }

    const bySourceId = await this.#ops.findBySourceId(parsed.sourceId);
    if (bySourceId !== null) return bySourceId;

    const byPrefix = await this.#ops.findByPrefix(parsed.prefix);
    if (byPrefix !== null) await this.#ensureSourceIdReassigned(parsed.prefix, byPrefix.sourceId);
    return byPrefix;
  }

  /** 略号で見つけたセットの元の sourceId が今回の取得にも残っているなら、略号が重なった別のセットなので拒否する。 */
  async #ensureSourceIdReassigned(
    prefix: CardSetPrefix,
    previousSourceId: SourceId,
  ): Promise<void> {
    ensure(
      !(await this.#ops.isInCurrentFetch(previousSourceId)),
      `略号 ${prefix} のセットは sourceId ${previousSourceId} で既にあり、その sourceId も今回の取得に残っている`,
    );
  }
}

type ParsedCardSet = Omit<CardSet, "id">;

/** 取得元のセット 1 つ分を value object に変える。規則に合わなければ RuleViolation を投げる。 */
function parseSnapshot(snapshot: CardSetSnapshot): ParsedCardSet {
  return {
    sourceId: SourceId(snapshot.sourceId),
    prefix: CardSetPrefix(snapshot.prefix),
    name: CardSetName(snapshot.name),
    language: CardSetLanguage(snapshot.language),
    releaseDate: snapshot.releaseDate === null ? null : CalendarDate(snapshot.releaseDate),
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
  };
}
