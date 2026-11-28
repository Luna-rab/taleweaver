import { attachEditionImages } from "../../application/policies/attach-edition-images.js";
import type { Logger } from "../../application/ports/logger.js";
import type { ProcessJobsDeps, ProcessJobsSummary } from "../../application/process-jobs.js";
import type { SyncCatalogDeps, SyncCatalogSummary } from "../../application/sync-catalog.js";
import { loadConfig } from "../../infrastructure/config.js";
import { connect } from "../../infrastructure/db/client.js";
import { DrizzleJobQueue } from "../../infrastructure/db/job-queue.js";
import { DrizzleUnitOfWork } from "../../infrastructure/db/unit-of-work.js";
import { GatcgCatalogSource } from "../../infrastructure/gatcg/catalog-source.js";
import { fetchAllCards } from "../../infrastructure/gatcg/client.js";
import { GatcgSourceImageFetcher } from "../../infrastructure/gatcg/source-image-fetcher.js";
import { UuidV7IdGenerator } from "../../infrastructure/id-generator.js";
import { S3ImageStorage } from "../../infrastructure/storage/s3-image-storage.js";
import { newStorageKey } from "../../infrastructure/storage/storage-key.js";

export const logger: Logger = {
  info: (message, details) => console.log(message, details ?? ""),
  warn: (message, details) => console.warn(message, details ?? ""),
  error: (message, details) => console.error(message, details ?? ""),
};

const now = () => new Date();

/** CLI が使う実装を組み立てる。使い終えたら close を呼び、DB の接続を閉じる。 */
export function wire(): {
  syncCatalog: SyncCatalogDeps;
  processJobs: ProcessJobsDeps;
  close: () => Promise<void>;
} {
  const config = loadConfig();
  const { db, close } = connect(config.DATABASE_URL);
  const ids = new UuidV7IdGenerator();
  const unitOfWork = new DrizzleUnitOfWork(db, ids);
  const handlers = new Map([
    [
      "attach-edition-images",
      attachEditionImages({
        unitOfWork,
        fetcher: new GatcgSourceImageFetcher(config.GATCG_BASE_URL),
        storage: new S3ImageStorage(config),
        ids,
        newStorageKey,
        logger,
        now,
      }),
    ],
  ]);
  return {
    syncCatalog: {
      source: new GatcgCatalogSource(() => fetchAllCards(config.GATCG_BASE_URL)),
      unitOfWork,
      ids,
      logger,
      now,
    },
    processJobs: { queue: new DrizzleJobQueue(db), handlers, logger },
    close,
  };
}

/** 版が合わずに保存しなかった集約があれば true。拒否は取得元のデータが規則に合わないだけなので含めない。 */
export function syncFailed(summary: SyncCatalogSummary): boolean {
  return summary.sets.conflicted + summary.cards.conflicted > 0;
}

/** 失敗した試行があれば true。後で試し直す仕事も含める。 */
export function jobsFailed(summary: ProcessJobsSummary): boolean {
  return summary.retrying + summary.failed > 0;
}
