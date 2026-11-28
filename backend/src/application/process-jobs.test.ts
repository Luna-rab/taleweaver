import { describe, expect, it } from "vitest";

import type { Job, JobFailure, JobQueue } from "./ports/job-queue.js";
import { MAX_ATTEMPTS, processJobs, retryAfterMs } from "./process-jobs.js";

const silent = { info: () => {}, warn: () => {}, error: () => {} };

describe("retryAfterMs", () => {
  it("1 分から倍にして待ち、MAX_ATTEMPTS 回目の失敗であきらめる", () => {
    expect([1, 2, 3, 4].map(retryAfterMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(retryAfterMs(MAX_ATTEMPTS)).toBeNull();
  });
});

describe("processJobs", () => {
  it("拾えるものがなくなるまで処理し、失敗した仕事は試し直すかあきらめるかを記録する", async () => {
    const jobs: Job[] = [
      { id: "ok", kind: "work", payload: { eventId: "e1" }, attempts: 1 },
      { id: "retry", kind: "work", payload: { eventId: "e2" }, attempts: 1 },
      { id: "unknown", kind: "nobody", payload: { eventId: "e3" }, attempts: MAX_ATTEMPTS },
    ];
    const completed: string[] = [];
    const failed: [string, JobFailure][] = [];
    const queue: JobQueue = {
      claim: async (limit) => jobs.splice(0, limit),
      complete: async (job) => void completed.push(job.id),
      fail: async (job, failure) => void failed.push([job.id, failure]),
    };
    const handlers = new Map([
      [
        "work",
        async (job: Job) => {
          if (job.id === "retry") throw new Error("boom", { cause: new Error("ECONNRESET") });
        },
      ],
    ]);

    const summary = await processJobs({ queue, handlers, logger: silent });

    expect(summary).toEqual({ completed: 1, retrying: 1, failed: 1 });
    expect(completed).toEqual(["ok"]);
    expect(Object.fromEntries(failed)).toEqual({
      retry: { error: "Error: boom <- Error: ECONNRESET", retryAfterMs: 60_000 },
      unknown: { error: "Error: 処理のない仕事の種類: nobody", retryAfterMs: null },
    });
  });
});
