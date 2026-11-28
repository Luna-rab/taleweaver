import { isDeepStrictEqual } from "node:util";

import { CalendarDate } from "../../value-objects/calendar-date.js";
import { CardReference } from "../../value-objects/card-reference.js";
import { CollectorNumber } from "../../value-objects/collector-number.js";
import { FaceSide } from "../../value-objects/face-side.js";
import { Legality } from "../../value-objects/legality.js";
import { Rarity } from "../../value-objects/rarity.js";
import { ReferenceKind } from "../../value-objects/reference-kind.js";
import { RulingDescription } from "../../value-objects/ruling-description.js";
import { RulingTitle } from "../../value-objects/ruling-title.js";
import { isErrata, Ruling, sameRuling } from "../../value-objects/ruling.js";
import { Slug } from "../../value-objects/slug.js";
import { SourceId } from "../../value-objects/source-id.js";
import { ensure, RuleViolation } from "../../value-objects/utils/rule-violation.js";
import type {
  CardCommand,
  CardEditionSnapshot,
  CardSnapshot,
  SyncCard,
  WithdrawCard,
} from "./commands.js";
import { parseCardEditionFace } from "./entities/card-edition-face.js";
import { type CardEdition, frontEditionFace } from "./entities/card-edition.js";
import { type CardFace, parseCardFace } from "./entities/card-face.js";
import { type Card, frontFace } from "./entities/card.js";
import type { CardEvent } from "./events.js";
import type { CardOperations } from "./operations.js";

/**
 * ルール上の 1 枚のカードを扱う集約。ルートの Card エンティティから、面・裁定・参照・エディション・
 * エディションの面までを持つ。セットと画像は別の集約で、id でだけ参照する。
 *
 * execute は何が起きたかを必ず 1 件以上のイベントで返す。
 * application は execute のたびに、changesState に当たるイベントがあれば state を repository.save に渡す。
 * state は最後に処理したコマンドの結果なので、保存する前に次のコマンドを送ると前の結果は失われる。
 */
export class CardAggregate {
  readonly #ops: CardOperations;
  #state: Card | null = null;

  constructor(ops: CardOperations) {
    this.#ops = ops;
  }

  /** コマンドを処理した後の状態。拒否したときは保存済みの状態で、保存済みのカードがなければ null。 */
  get state(): Card | null {
    return this.#state;
  }

  /** コマンドを処理し、起きたことをイベントで返す。 */
  async execute(command: CardCommand): Promise<readonly CardEvent[]> {
    switch (command.type) {
      case "SyncCard":
        return await this.#syncOrReject(command);
      case "WithdrawCard":
        return await this.#withdraw(command);
    }
  }

  /**
   * 同期中に業務の規則に合わない値（RuleViolation）が見つかったら、CardSyncRejected に変える。
   * #sync は state を次の状態に変える前に規則を確かめ終えるので、拒否したとき state は保存済みの状態のまま。
   * RuleViolation 以外（セットが未同期、DB の障害など）は業務の結果ではないので、そのまま投げる。
   */
  async #syncOrReject(command: SyncCard): Promise<readonly CardEvent[]> {
    try {
      return await this.#sync(command);
    } catch (error) {
      if (!(error instanceof RuleViolation)) throw error;
      return [
        {
          type: "CardSyncRejected",
          cardId: this.#state?.id ?? null,
          frontSourceId: command.snapshot.faces.find((f) => f.side === "front")?.sourceId ?? null,
          reason: error.message,
        },
      ];
    }
  }

  /**
   * 取得元のカード 1 枚分から次の状態を組み立て、保存している状態と比べてイベントを決める。
   * 保存していなければ CardRegistered、同じなら CardUnchanged、違えば違う箇所ごとのイベントを返す。
   * 比べる前に両方を normalize し、配列の並び順だけの違いを「変わった」と判定しない。
   */
  async #sync(command: SyncCard): Promise<readonly CardEvent[]> {
    const parsed = parseSnapshot(command.snapshot);
    const found = await this.#findExisting(parsed.faces);
    const existing = found && normalize(found);
    this.#state = existing;

    const editions = await this.#mergeEditions(parsed.editions, existing, command.syncedAt);
    const next = normalize({
      id: existing?.id ?? this.#ops.newCardId(),
      faces: parsed.faces,
      legality: parsed.legality,
      rulings: parsed.rulings,
      references: parsed.references,
      editions: editions.state,
      withdrawnAt: null,
    });

    if (existing === null) {
      this.#state = next;
      return [{ type: "CardRegistered", cardId: next.id, card: next }];
    }
    if (isDeepStrictEqual(next, existing)) return [{ type: "CardUnchanged", cardId: existing.id }];

    const events = [...diffEvents(existing, next), ...editions.events];
    // 状態の変化はどれもイベントで表す約束なので、イベントのない変化はこの集約の誤り。
    if (events.length === 0)
      throw new Error(`カード ${existing.id} の状態が変わったのにイベントがない`);
    this.#state = next;
    return events;
  }

  /**
   * カードに取り下げた時刻を付ける。すでに取り下げていれば CardUnchanged を返す。
   * 取り下げるカードは selectCardsToWithdraw が保存済みのものから選ぶので、見つからないのは手順の誤りとして例外にする。
   */
  async #withdraw(command: WithdrawCard): Promise<readonly CardEvent[]> {
    const found = await this.#ops.findById(command.cardId);
    if (found === null) throw new Error(`取り下げるカードがない: ${command.cardId}`);
    const existing = normalize(found);
    this.#state = existing;
    if (existing.withdrawnAt !== null) return [{ type: "CardUnchanged", cardId: existing.id }];

    this.#state = { ...existing, withdrawnAt: command.withdrawnAt };
    return [{ type: "CardWithdrawn", cardId: existing.id }];
  }

  /**
   * 表の面の sourceId で照合し、見つからなければ slug で照合する（取得元が id を振り直したとき）。
   * slug で見つかったカードの元の sourceId が今回の取得にも残っているなら、振り直しではないので拒否する。
   */
  async #findExisting(faces: readonly CardFace[]): Promise<Card | null> {
    const front = frontFace({ faces });
    const bySourceId = await this.#ops.findByFrontSourceId(front.sourceId);
    if (bySourceId !== null) return bySourceId;

    const bySlug = await this.#ops.findByFrontSlug(front.slug);
    if (bySlug === null) return null;
    const previousSourceId = frontFace(bySlug).sourceId;
    ensure(
      !(await this.#ops.isInCurrentFetch(previousSourceId)),
      `slug ${front.slug} のカードは sourceId ${previousSourceId} で既にあり、その sourceId も今回の取得に残っている`,
    );
    return bySlug;
  }

  /**
   * 取得したエディションを保存しているエディションと照合し、次のエディションの一覧とイベントを返す。
   * 照合はカードと同じく、表の面の sourceId、次に slug の順。照合できたものは id を引き継ぐ。
   * 取得に無かった保存済みのエディションは消さず、取り下げた時刻を付けて既定から外す。
   * 新しいカードのとき（existing が null）は CardRegistered が全体を表すので、エディションのイベントは出さない。
   */
  async #mergeEditions(
    parsed: readonly ParsedEdition[],
    existing: Card | null,
    syncedAt: Date,
  ): Promise<{ state: CardEdition[]; events: CardEvent[] }> {
    const cardId = existing?.id;
    const previous = existing?.editions ?? [];
    const matched = new Set<CardEdition>();
    const incomingSourceIds = new Set(parsed.map((e) => frontEditionFace(e).sourceId));
    const state: CardEdition[] = [];
    const events: CardEvent[] = [];

    for (const edition of parsed) {
      const front = frontEditionFace(edition);
      let match = previous.find((p) => frontEditionFace(p).sourceId === front.sourceId);
      if (match === undefined) {
        match = previous.find((p) => frontEditionFace(p).slug === front.slug);
        if (match !== undefined) {
          const previousSourceId = frontEditionFace(match).sourceId;
          ensure(
            !incomingSourceIds.has(previousSourceId),
            `エディションの slug ${front.slug} は sourceId ${previousSourceId} で既にあり、その sourceId も今回の取得に残っている`,
          );
        }
      }
      ensure(
        match === undefined || !matched.has(match),
        `エディション ${front.sourceId} が既存の 2 つと照合された`,
      );
      if (match !== undefined) matched.add(match);

      const setId = await this.#ops.findSetIdBySourceId(edition.setSourceId);
      // セットはジョブが先に同期する。無いのは手順の誤りなので、拒否ではなく例外にする。
      if (setId === null) throw new Error(`セットが同期されていない: ${edition.setSourceId}`);

      const id = match?.id ?? this.#ops.newCardEditionId();
      const merged: CardEdition = {
        id,
        setId,
        collectorNumber: edition.collectorNumber,
        rarity: edition.rarity,
        isDefault: edition.isDefault,
        withdrawnAt: null,
        faces: edition.faces,
      };
      state.push(merged);
      if (match !== undefined && cardId !== undefined) {
        if (match.withdrawnAt !== null) {
          events.push({ type: "CardEditionReinstated", cardId, editionId: id });
        }
        // 取り下げていた間は既定から外しているので、戻ったときの既定の変化も Revised で表す。
        if (!isDeepStrictEqual({ ...match, withdrawnAt: null }, merged)) {
          events.push({ type: "CardEditionRevised", cardId, before: match, after: merged });
        }
      }
      if (match === undefined && cardId !== undefined) {
        events.push({
          type: "CardEditionAdded",
          cardId,
          editionId: id,
          faces: edition.faces.map((f) => ({
            side: f.side,
            sourceId: f.sourceId,
            imageSourcePath: f.imageSourcePath,
          })),
        });
      }
    }

    for (const edition of previous) {
      if (matched.has(edition)) continue;
      if (edition.withdrawnAt === null && cardId !== undefined) {
        events.push({ type: "CardEditionWithdrawn", cardId, editionId: edition.id });
      }
      state.push({ ...edition, isDefault: false, withdrawnAt: edition.withdrawnAt ?? syncedAt });
    }

    return { state, events };
  }
}

/**
 * カード本体（エディション以外）の前後を比べ、違う箇所ごとのイベントを返す。
 * 面は表と裏それぞれで、ルールに関わる特性（CardCharacteristicsChanged）とそれ以外（CardFaceRevised）に分ける。
 * 裁定は題・日付・本文の 3 つで同じものを探し、増えた・消えた・並びだけ変わったを区別する。
 */
function diffEvents(before: Card, after: Card): CardEvent[] {
  const cardId = after.id;
  const events: CardEvent[] = [];

  if (before.withdrawnAt !== null) events.push({ type: "CardReinstated", cardId });

  for (const side of [FaceSide("front"), FaceSide("back")]) {
    const b = before.faces.find((f) => f.side === side) ?? null;
    const a = after.faces.find((f) => f.side === side) ?? null;
    if (!isDeepStrictEqual(a?.characteristics ?? null, b?.characteristics ?? null)) {
      events.push({
        type: "CardCharacteristicsChanged",
        cardId,
        side,
        before: b?.characteristics ?? null,
        after: a?.characteristics ?? null,
      });
    }
    // 面が増えた・減ったときは CardCharacteristicsChanged が表すので、両方にある面だけを比べる。
    if (
      a !== null &&
      b !== null &&
      !isDeepStrictEqual({ ...a, characteristics: null }, { ...b, characteristics: null })
    ) {
      events.push({ type: "CardFaceRevised", cardId, side, before: b, after: a });
    }
  }

  const added = after.rulings.filter((r) => !before.rulings.some((b) => sameRuling(b, r)));
  const removed = before.rulings.filter((r) => !after.rulings.some((a) => sameRuling(a, r)));
  for (const ruling of added) {
    events.push({ type: "CardRulingAdded", cardId, ruling, isErrata: isErrata(ruling) });
  }
  for (const ruling of removed) events.push({ type: "CardRulingRemoved", cardId, ruling });
  if (
    added.length === 0 &&
    removed.length === 0 &&
    !isDeepStrictEqual(before.rulings, after.rulings)
  ) {
    events.push({ type: "CardRulingsReordered", cardId, rulings: after.rulings });
  }

  const referencesAdded = after.references.filter(
    (r) => !before.references.some((b) => sameReference(b, r)),
  );
  const referencesRemoved = before.references.filter(
    (r) => !after.references.some((a) => sameReference(a, r)),
  );
  if (referencesAdded.length > 0 || referencesRemoved.length > 0) {
    events.push({
      type: "CardReferencesChanged",
      cardId,
      added: referencesAdded,
      removed: referencesRemoved,
    });
  }

  const changes = diffLegality(before.legality, after.legality);
  if (changes.length > 0) events.push({ type: "CardLegalityChanged", cardId, changes });

  return events;
}

/** CardLegalityChanged に載せる、1 フォーマット分の上限の変化。 */
export type LegalityChange = {
  readonly format: string;
  /** null は制限なし。 */
  readonly before: number | null;
  readonly after: number | null;
};

/** 上限が変わったフォーマットを、名前の順に返す。 */
function diffLegality(before: Legality, after: Legality): LegalityChange[] {
  const formats = [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted();
  return formats
    .map((format) => ({ format, before: before[format] ?? null, after: after[format] ?? null }))
    .filter((c) => c.before !== c.after);
}

/** 種類と参照先の slug が同じなら同じ参照とみなす（DB の主キーと同じ組）。 */
function sameReference(x: CardReference, y: CardReference): boolean {
  return x.kind === y.kind && x.targetSlug === y.targetSlug;
}

type ParsedEdition = Omit<CardEdition, "id" | "setId" | "withdrawnAt"> & {
  readonly setSourceId: SourceId;
};

/**
 * 取得元のカード 1 枚分を value object とエンティティに変え、カードとエディションをまたぐ規則を確かめる。
 * 規則に合わなければ RuleViolation を投げる（#syncOrReject が CardSyncRejected に変える）。
 */
function parseSnapshot(snapshot: CardSnapshot) {
  const faces = sortBySide(snapshot.faces.map(parseCardFace));
  const sides = faces.map((f) => f.side);
  ensure(sides[0] === "front", "表の面がない");
  ensure(new Set(sides).size === sides.length, "同じ側の面が 2 つある");

  ensure(snapshot.editions.length > 0, "エディションが 1 つもない");
  const editions = snapshot.editions.map(parseEdition);
  for (const edition of editions) {
    ensure(
      isDeepStrictEqual(
        edition.faces.map((f) => f.side),
        sides,
      ),
      `エディション ${frontEditionFace(edition).sourceId} の面の組がカードの面の組とそろわない`,
    );
  }
  ensure(editions.filter((e) => e.isDefault).length <= 1, "既定のエディションが 2 つ以上ある");
  const editionFaceIds = editions.flatMap((e) => e.faces.map((f) => f.sourceId));
  ensure(
    new Set(editionFaceIds).size === editionFaceIds.length,
    "エディションの面の sourceId が重複している",
  );

  return {
    faces,
    legality: Legality(snapshot.legality),
    rulings: snapshot.rulings.map((r) =>
      Ruling({
        title: r.title === null ? null : RulingTitle(r.title),
        addedOn: CalendarDate(r.addedOn),
        description: RulingDescription(r.description),
      }),
    ),
    references: snapshot.references.map((r) =>
      CardReference({ kind: ReferenceKind(r.kind), targetSlug: Slug(r.targetSlug) }),
    ),
    editions,
  };
}

/**
 * 取得元のエディション 1 つ分を value object に変える。
 * id とセットの id は既存のエディションと照合してから決まるので、ここではまだエンティティにしない。
 */
function parseEdition(edition: CardEditionSnapshot): ParsedEdition {
  return {
    setSourceId: SourceId(edition.setSourceId),
    collectorNumber: CollectorNumber(edition.collectorNumber),
    rarity: Rarity(edition.rarity),
    isDefault: edition.isDefault,
    faces: sortBySide(edition.faces.map(parseCardEditionFace)),
  };
}

/**
 * 順序に意味のない配列を決まった順に並べる。「変更なし」の判定を、repository が返す並び順や
 * 取得元の並び順に左右させないため。裁定は並び順に意味がある（DB は position で持つ）ので並べ替えない。
 * 参照は (kind, targetSlug) が主キーなので、重複を除く。
 */
function normalize(state: Card): Card {
  // kind と slug の区切りに、どちらにも現れない \u0000 を使う。"A-B" + "C" と "A" + "B-C" を同じ鍵にしないため。
  const references = new Map(state.references.map((r) => [`${r.kind}\u0000${r.targetSlug}`, r]));
  return {
    ...state,
    faces: sortBySide([...state.faces]),
    references: [...references.entries()].toSorted(([a], [b]) => compare(a, b)).map(([, r]) => r),
    editions: state.editions
      .map((e) => ({ ...e, faces: sortBySide([...e.faces]) }))
      .toSorted((a, b) => compare(frontEditionFace(a).sourceId, frontEditionFace(b).sourceId)),
  };
}

function sortBySide<T extends { readonly side: FaceSide }>(faces: T[]): T[] {
  return faces.toSorted((a, b) => (a.side === b.side ? 0 : a.side === "front" ? -1 : 1));
}

/**
 * 文字コードの順で比べる。localeCompare は実行環境のロケールで順が変わり、
 * 環境が変わると同じデータでも「並びが変わった」と判定してしまうので使わない。
 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
