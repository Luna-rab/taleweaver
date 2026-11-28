import type { Job, JobQueue } from "./ports/job-queue.js";
import type { Logger } from "./ports/logger.js";

/** 仕事の種類ごとの処理。例外を投げれば失敗として扱い、間を空けて試し直す。何度試しても同じ結果になるように書く。 */
export type JobHandler = (job: Job) => Promise<void>;

export type ProcessJobsDeps = {
  readonly queue: JobQueue;
  readonly handlers: ReadonlyMap<string, JobHandler>;
  readonly logger: Logger;
};

/** retrying は失敗して後で試し直す仕事、failed は試し直すのをあきらめた仕事の数。 */
export type ProcessJobsSummary = {
  readonly completed: number;
  readonly retrying: number;
  readonly failed: number;
};

type Outcome = keyof ProcessJobsSummary;

const CONCURRENCY = 4;
export const MAX_ATTEMPTS = 5;
const FIRST_BACKOFF_MS = 60_000;

/** attempts 回目の試行が失敗した後、何ミリ秒後に試し直すか。MAX_ATTEMPTS 回に達したら null で、あきらめる。 */
export function retryAfterMs(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return FIRST_BACKOFF_MS * 2 ** (attempts - 1);
}

/**
 * 拾える仕事がなくなるまで、CONCURRENCY 件ずつ並べて処理する。
 * 失敗して後に回した仕事が、終わるまでの間に拾える時刻になれば、この実行の中で試し直す。
 */
export async function processJobs(deps: ProcessJobsDeps): Promise<ProcessJobsSummary> {
  // 拾った時点で押さえる時間が始まるので、すぐ始める分だけを 1 件ずつ拾う。
  const worker = async (): Promise<readonly Outcome[]> => {
    const [job] = await deps.queue.claim(1);
    if (job === undefined) return [];
    const outcome = await runJob(deps, job);
    return [outcome, ...(await worker())];
  };
  const outcomes = (await Promise.all(Array.from({ length: CONCURRENCY }, worker))).flat();
  const of = (o: Outcome) => outcomes.filter((x) => x === o).length;
  return { completed: of("completed"), retrying: of("retrying"), failed: of("failed") };
}

async function runJob(deps: ProcessJobsDeps, job: Job): Promise<Outcome> {
  const { queue, handlers, logger } = deps;
  try {
    const handler = handlers.get(job.kind);
    if (handler === undefined) throw new Error(`処理のない仕事の種類: ${job.kind}`);
    await handler(job);
  } catch (error) {
    const message = describeError(error);
    const delay = retryAfterMs(job.attempts);
    await queue.fail(job, { error: message, retryAfterMs: delay });
    const details = { jobId: job.id, kind: job.kind, attempts: job.attempts, error: message };
    if (delay === null) {
      logger.error("仕事を試し直すのをあきらめた", details);
      return "failed";
    }
    logger.warn("仕事が失敗したので後で試し直す", { ...details, retryAfterMs: delay });
    return "retrying";
  }
  // 処理の最後のトランザクションとは別に消す。消す前に落ちても、処理が何度試しても同じ結果になるので構わない。
  await queue.complete(job);
  return "completed";
}

/** 組み込みの fetch の失敗は "fetch failed" としか言わないので、cause もたどって載せる。 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? "" : ` <- ${describeError(error.cause)}`;
  return `${error.name}: ${error.message}${cause}`;
}
