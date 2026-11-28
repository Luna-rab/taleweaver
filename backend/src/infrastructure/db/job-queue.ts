import { eq, sql } from "drizzle-orm";

import type { Job, JobFailure, JobQueue } from "../../application/ports/job-queue.js";
import { policyJobs } from "../../db/schema.js";
import type { Database } from "./client.js";

// 拾った仕事は、この間ほかから拾えない。取得元への HTTP の間にトランザクションを開いたままにしないため、
// 行のロックではなく run_after を先へ送って押さえる。プロセスが落ちても、この時間が過ぎればまた拾える。
// 画像の取得の打ち切り（infrastructure/gatcg/source-image-fetcher.ts）は、この時間に収まるように決めている。
const LEASE = sql`interval '5 minutes'`;

export class DrizzleJobQueue implements JobQueue {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async claim(limit: number): Promise<readonly Job[]> {
    // 複数のプロセスが同時に拾っても同じ仕事を取らないよう、SKIP LOCKED でほかが押さえている行を飛ばす。
    const { rows } = await this.#db.execute<{
      id: string;
      kind: string;
      payload: { eventId: string };
      attempts: number;
    }>(sql`
      UPDATE ${policyJobs}
      SET attempts = attempts + 1, run_after = now() + ${LEASE}
      WHERE id IN (
        SELECT id FROM ${policyJobs}
        WHERE failed_at IS NULL AND run_after <= now()
        ORDER BY run_after
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, payload, attempts
    `);
    // payload は EventStore.append が積んだものなので、形を確かめずに使う。
    return rows;
  }

  async complete(job: Job): Promise<void> {
    await this.#db.delete(policyJobs).where(eq(policyJobs.id, job.id));
  }

  async fail(job: Job, failure: JobFailure): Promise<void> {
    // 時刻は DB の now() で決め、拾うときの比較と同じ時計にそろえる。
    const set =
      failure.retryAfterMs === null
        ? { lastError: failure.error, failedAt: sql`now()` }
        : {
            lastError: failure.error,
            runAfter: sql`now() + make_interval(secs => ${failure.retryAfterMs / 1000})`,
          };
    await this.#db.update(policyJobs).set(set).where(eq(policyJobs.id, job.id));
  }
}
