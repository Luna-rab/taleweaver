import { CardSetAggregate } from "../domain/aggregates/card-set/card-set-aggregate.js";
import type { CardSetSnapshot } from "../domain/aggregates/card-set/commands.js";
import { CardAggregate } from "../domain/aggregates/card/card-aggregate.js";
import type { CardCommand, CardSnapshot } from "../domain/aggregates/card/commands.js";
import type { CardOperations } from "../domain/aggregates/card/operations.js";
import type { Decision } from "../domain/aggregates/decision.js";
import type { IdGenerator } from "../domain/ports/id-generator.js";
import { OptimisticLockError } from "../domain/ports/optimistic-lock-error.js";
import { selectCardsToWithdraw } from "../domain/services/select-cards-to-withdraw.js";
import type { CardId } from "../domain/value-objects/card-id.js";
import type { CardSetId } from "../domain/value-objects/card-set-id.js";
import { Slug } from "../domain/value-objects/slug.js";
import { SourceId } from "../domain/value-objects/source-id.js";
import type { CatalogSource } from "./ports/catalog-source.js";
import type { Logger } from "./ports/logger.js";
import type { AggregateRef, Transaction, UnitOfWork } from "./ports/unit-of-work.js";

export type SyncCatalogDeps = {
  readonly source: CatalogSource;
  readonly unitOfWork: UnitOfWork;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly now: () => Date;
};

/** 集約 1 つ分の結果。conflicted は、読んだ後にほかの処理が保存していたので保存しなかった。 */
type Outcome = "registered" | "changed" | "unchanged" | "rejected" | "conflicted" | "withdrawn";

export type OutcomeCounts = Readonly<Record<Outcome, number>>;

export type SyncCatalogSummary = {
  readonly sets: OutcomeCounts;
  readonly cards: OutcomeCounts;
  /** 形が合わずに飛ばしたカード。 */
  readonly skipped: number;
  /** 取り下げを決めたか。sourceId と slug も読めないカードがあると決めない。 */
  readonly withdrawalsDecided: boolean;
};

/**
 * 取得元の全カードとセットを取り込み、取得元から消えたカードを取り下げる。
 * 集約 1 つごとに 1 つのトランザクションで保存する。版が合わない集約は飛ばして次の同期に任せ、
 * それ以外の例外はそのまま投げて同期を止める。
 */
export async function syncCatalog(deps: SyncCatalogDeps): Promise<SyncCatalogSummary> {
  const { source, logger } = deps;
  const syncedAt = deps.now();
  const fetched = await source.fetchAll();
  for (const s of fetched.skipped) {
    logger.warn("形が合わないカードを飛ばした", { sourceId: s.sourceId, issues: s.issues });
  }
  logger.info("取得した", { cards: fetched.cards.length, sets: fetched.sets.length });

  const setSourceIds = new Set<string>(fetched.sets.map((s) => s.sourceId));
  const setResults = await sequential(fetched.sets, (snapshot) =>
    syncSet(deps, snapshot, setSourceIds),
  );
  // カードはエディションごとにセットを引くので、同期し終えたセットを手元に置き、DB を引き直さない。
  const setIds = new Map(
    setResults.flatMap((r) => (r.saved === null ? [] : [[r.saved.sourceId, r.saved.id] as const])),
  );

  const frontSourceIds = new Set(fetched.includedCards.map((c) => SourceId(c.sourceId)));
  const cardResults = await sequential(fetched.cards, (snapshot) =>
    syncCard(deps, snapshot, syncedAt, frontSourceIds, setIds),
  );

  const withdrawResults = fetched.canDecideWithdrawals
    ? await withdrawCards(deps, syncedAt, frontSourceIds, fetched.includedCards)
    : [];
  if (!fetched.canDecideWithdrawals) {
    logger.warn("sourceId と slug も読めないカードがあったので、取り下げを決めなかった");
  }

  return {
    sets: count(setResults.map((r) => r.outcome)),
    cards: count([...cardResults, ...withdrawResults]),
    skipped: fetched.skipped.length,
    withdrawalsDecided: fetched.canDecideWithdrawals,
  };
}

async function syncSet(
  deps: SyncCatalogDeps,
  snapshot: CardSetSnapshot,
  setSourceIds: ReadonlySet<string>,
): Promise<{ outcome: Outcome; saved: { sourceId: string; id: CardSetId } | null }> {
  const label = `セット ${snapshot.sourceId}`;
  const result = await inUnit(deps, label, async (tx) => {
    const aggregate = new CardSetAggregate({
      findBySourceId: (s) => tx.cardSets.findBySourceId(s),
      findByPrefix: (p) => tx.cardSets.findByPrefix(p),
      isInCurrentFetch: async (s) => setSourceIds.has(s),
      newCardSetId: () => deps.ids.newCardSetId(),
    });
    const decision = await aggregate.execute({ type: "SyncCardSet", snapshot });
    const outcome = await apply(deps, tx, label, decision, () => {
      const state = aggregate.state!;
      return { ref: { type: "card_set", id: state.id }, save: () => tx.cardSets.save(state) };
    });
    return { outcome, state: aggregate.state };
  });
  if (result === "conflicted") return { outcome: "conflicted", saved: null };
  const saved =
    result.outcome === "rejected" || result.state === null
      ? null
      : { sourceId: result.state.sourceId, id: result.state.id };
  return { outcome: result.outcome, saved };
}

async function syncCard(
  deps: SyncCatalogDeps,
  snapshot: CardSnapshot,
  syncedAt: Date,
  frontSourceIds: ReadonlySet<SourceId>,
  setIds: ReadonlyMap<string, CardSetId>,
): Promise<Outcome> {
  return await runCardCommand(
    deps,
    `カード ${snapshot.front.sourceId}`,
    { type: "SyncCard", snapshot, syncedAt },
    frontSourceIds,
    setIds,
  );
}

/** 取得元から消えたカードを選び、1 枚ずつ取り下げる。 */
async function withdrawCards(
  deps: SyncCatalogDeps,
  withdrawnAt: Date,
  frontSourceIds: ReadonlySet<SourceId>,
  includedCards: readonly { readonly slug: string }[],
): Promise<Outcome[]> {
  const stored = await deps.unitOfWork.run((tx) => tx.cards.listSourceKeys());
  const cardIds = selectCardsToWithdraw(
    {
      kind: "complete",
      frontSourceIds,
      frontSlugs: new Set(includedCards.map((c) => Slug(c.slug))),
    },
    stored,
  );
  return await sequential(cardIds, (cardId: CardId) =>
    runCardCommand(
      deps,
      `カード ${cardId}`,
      { type: "WithdrawCard", cardId, withdrawnAt },
      frontSourceIds,
      new Map(),
    ),
  );
}

async function runCardCommand(
  deps: SyncCatalogDeps,
  label: string,
  command: CardCommand,
  frontSourceIds: ReadonlySet<SourceId>,
  setIds: ReadonlyMap<string, CardSetId>,
): Promise<Outcome> {
  return await inUnit(deps, label, async (tx) => {
    const ops: CardOperations = {
      findById: (id) => tx.cards.findById(id),
      findByFrontSourceId: (s) => tx.cards.findByFrontSourceId(s),
      findByFrontSlug: (s) => tx.cards.findByFrontSlug(s),
      isInCurrentFetch: async (s) => frontSourceIds.has(s),
      // 同期で拒否されたセットは手元にないが、前の同期で保存したものは DB にある。
      findSetIdBySourceId: async (s) => setIds.get(s) ?? (await tx.cardSets.findIdBySourceId(s)),
      newCardId: () => deps.ids.newCardId(),
      newCardEditionId: () => deps.ids.newCardEditionId(),
    };
    const aggregate = new CardAggregate(ops);
    const decision = await aggregate.execute(command);
    return await apply(deps, tx, label, decision, () => {
      const state = aggregate.state!;
      return { ref: { type: "card", id: state.id }, save: () => tx.cards.save(state) };
    });
  });
}

/**
 * 集約の判断を保存する。拒否なら理由を残して保存せず、イベントがあれば状態とイベントを書く。
 * target は accepted でイベントがあるときだけ呼ぶ。そのとき集約の state は必ずある。
 */
async function apply(
  deps: SyncCatalogDeps,
  tx: Transaction,
  label: string,
  decision: Decision<{ readonly type: string }>,
  target: () => { ref: AggregateRef; save: () => Promise<void> },
): Promise<Outcome> {
  if (decision.kind === "rejected") {
    deps.logger.warn(`${label} を拒否した`, { reason: decision.reason });
    return "rejected";
  }
  if (decision.events.length === 0) return "unchanged";
  const { ref, save } = target();
  await save();
  await tx.events.append(ref, decision.events, deps.now());
  const types = decision.events.map((e) => e.type);
  if (types.some((t) => t.endsWith("Registered"))) return "registered";
  if (types.includes("CardWithdrawn")) return "withdrawn";
  return "changed";
}

/** 1 つのトランザクションで work を動かす。版が合わなければ記録して "conflicted" を返し、次の同期に任せる。 */
async function inUnit<T>(
  deps: SyncCatalogDeps,
  label: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T | "conflicted"> {
  try {
    return await deps.unitOfWork.run(work);
  } catch (error) {
    if (!(error instanceof OptimisticLockError)) throw error;
    deps.logger.warn(`${label} は版が合わないので保存しなかった`, { error: error.message });
    return "conflicted";
  }
}

/** items を 1 つずつ、前の f が終わってから f に通す。 */
async function sequential<T, R>(items: readonly T[], f: (item: T) => Promise<R>): Promise<R[]> {
  return await items.reduce<Promise<R[]>>(
    async (done, item) => [...(await done), await f(item)],
    Promise.resolve([]),
  );
}

function count(outcomes: readonly Outcome[]): OutcomeCounts {
  const of = (o: Outcome) => outcomes.filter((x) => x === o).length;
  return {
    registered: of("registered"),
    changed: of("changed"),
    unchanged: of("unchanged"),
    rejected: of("rejected"),
    conflicted: of("conflicted"),
    withdrawn: of("withdrawn"),
  };
}
