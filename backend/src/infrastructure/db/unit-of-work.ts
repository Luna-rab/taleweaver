import { subscriptions } from "../../application/policies/subscriptions.js";
import type {
  AggregateRef,
  EventWriter,
  Transaction,
  UnitOfWork,
} from "../../application/ports/unit-of-work.js";
import { domainEvents, policyJobs } from "../../db/schema.js";
import type { UuidV7IdGenerator } from "../id-generator.js";
import { DrizzleCardRepository } from "./card-repository.js";
import { DrizzleCardSetRepository } from "./card-set-repository.js";
import type { Database, Tx } from "./client.js";
import { DrizzleImageRepository } from "./image-repository.js";

export class DrizzleUnitOfWork implements UnitOfWork {
  readonly #db: Database;
  readonly #ids: UuidV7IdGenerator;

  constructor(db: Database, ids: UuidV7IdGenerator) {
    this.#db = db;
    this.#ids = ids;
  }

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return await this.#db.transaction(async (tx) =>
      work({
        cards: new DrizzleCardRepository(tx),
        cardSets: new DrizzleCardSetRepository(tx),
        images: new DrizzleImageRepository(tx),
        events: new DrizzleEventWriter(tx, this.#ids),
      }),
    );
  }
}

class DrizzleEventWriter implements EventWriter {
  readonly #tx: Tx;
  readonly #ids: UuidV7IdGenerator;

  constructor(tx: Tx, ids: UuidV7IdGenerator) {
    this.#tx = tx;
    this.#ids = ids;
  }

  async append(
    aggregate: AggregateRef,
    events: readonly { readonly type: string }[],
    occurredAt: Date,
  ): Promise<void> {
    const rows = events.map((event) => ({
      id: this.#ids.newRowId(),
      aggregateType: aggregate.type,
      aggregateId: aggregate.id,
      type: event.type,
      payload: event,
      occurredAt,
    }));
    await this.#tx.insert(domainEvents).values(rows);

    const jobs = rows.flatMap((row) =>
      (subscriptions.get(row.type) ?? []).map((kind) => ({
        id: this.#ids.newRowId(),
        kind,
        payload: { eventId: row.id },
      })),
    );
    if (jobs.length > 0) await this.#tx.insert(policyJobs).values(jobs);
  }
}
