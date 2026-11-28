import { isDeepStrictEqual } from "node:util";

import { CalendarDate } from "../../value-objects/calendar-date.js";
import type { CardSetId } from "../../value-objects/card-set-id.js";
import { CardSetLanguage } from "../../value-objects/card-set-language.js";
import { CardSetName } from "../../value-objects/card-set-name.js";
import { CardSetPrefix } from "../../value-objects/card-set-prefix.js";
import { SourceId } from "../../value-objects/source-id.js";
import { ensure, RuleViolation } from "../../value-objects/utils/rule-violation.js";
import type { CardSetCommand, CardSetSnapshot, SyncCardSet } from "./commands.js";
import type { CardSet } from "./entities/card-set.js";
import type { CardSetEvent } from "./events.js";
import type { CardSetOperations } from "./operations.js";

/**
 * カードを収録したセットを扱う集約。
 *
 * execute は何が起きたかを必ず 1 件以上のイベントで返す。
 * application は changesState に当たるイベントがあれば state を repository.save に渡す。
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

  async execute(command: CardSetCommand): Promise<readonly CardSetEvent[]> {
    switch (command.type) {
      case "SyncCardSet":
        return await this.#syncOrReject(command);
    }
  }

  /** 同期し、業務の規則に合わなければ CardSetSyncRejected を返す。照合の前の拒否では cardSetId を null にする。 */
  async #syncOrReject(command: SyncCardSet): Promise<readonly CardSetEvent[]> {
    let matched: Matched;
    try {
      matched = await this.#match(command.snapshot);
    } catch (error) {
      return rejection(error, command, null);
    }
    try {
      return this.#sync(matched);
    } catch (error) {
      return rejection(error, command, matched.existing?.id ?? null);
    }
  }

  /** スナップショットを読み、保存済みのセットと照合する。見つからなければ existing は null。 */
  async #match(snapshot: CardSetSnapshot): Promise<Matched> {
    const parsed = parseSnapshot(snapshot);
    const found = await this.#findExisting(parsed);
    // 略号で見つけたセットの元の sourceId が今回の取得にも残っているなら、略号が重なった別のセット。
    if (found?.byPrefix) {
      ensure(
        !(await this.#ops.isInCurrentFetch(found.cardSet.sourceId)),
        `略号 ${parsed.prefix} のセットは sourceId ${found.cardSet.sourceId} で既にあり、その sourceId も今回の取得に残っている`,
      );
    }
    return { parsed, existing: found?.cardSet ?? null };
  }

  #sync({ parsed, existing }: Matched): readonly CardSetEvent[] {
    const next: CardSet = { id: existing?.id ?? this.#ops.newCardSetId(), ...parsed };
    if (existing === null) {
      this.#state = next;
      return [{ type: "CardSetRegistered", cardSetId: next.id, cardSet: next }];
    }
    if (isDeepStrictEqual(next, existing)) {
      this.#state = existing;
      return [{ type: "CardSetUnchanged", cardSetId: existing.id }];
    }
    this.#state = next;
    return [{ type: "CardSetRevised", cardSetId: next.id, before: existing, after: next }];
  }

  /**
   * sourceId で探し、見つからなければ略号で探す（取得元が id を振り直したとき）。
   * このインスタンスがすでにセットを扱っていれば、DB ではなくそのセットと照合する。
   */
  async #findExisting(parsed: ParsedCardSet): Promise<Found | null> {
    if (this.#state !== null) return matchCurrent(this.#state, parsed);

    const bySourceId = await this.#ops.findBySourceId(parsed.sourceId);
    if (bySourceId !== null) return { cardSet: bySourceId, byPrefix: false };

    const byPrefix = await this.#ops.findByPrefix(parsed.prefix);
    return byPrefix === null ? null : { cardSet: byPrefix, byPrefix: true };
  }
}

type ParsedCardSet = Omit<CardSet, "id">;

type Matched = { readonly parsed: ParsedCardSet; readonly existing: CardSet | null };

type Found = { readonly cardSet: CardSet; readonly byPrefix: boolean };

/** 別のセットに当たるのは、インスタンスを使い回した application の誤りなので、拒否ではなく例外にする。 */
function matchCurrent(current: CardSet, parsed: ParsedCardSet): Found {
  if (current.sourceId === parsed.sourceId) return { cardSet: current, byPrefix: false };
  if (current.prefix !== parsed.prefix) {
    throw new Error(
      `セット ${current.id} を扱うインスタンスに、別のセット（sourceId ${parsed.sourceId}）の同期が送られた`,
    );
  }
  return { cardSet: current, byPrefix: true };
}

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

/** RuleViolation を CardSetSyncRejected に変える。それ以外の例外は業務の結果ではないので、そのまま投げる。 */
function rejection(
  error: unknown,
  command: SyncCardSet,
  cardSetId: CardSetId | null,
): CardSetEvent[] {
  if (!(error instanceof RuleViolation)) throw error;
  return [
    {
      type: "CardSetSyncRejected",
      cardSetId,
      sourceId: command.snapshot.sourceId,
      reason: error.message,
    },
  ];
}
