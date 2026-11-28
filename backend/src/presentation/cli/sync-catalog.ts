// 取得元の全カードとセットを DB に取り込む。
// 終了コードは、版が合わずに保存しなかった集約があるか例外で止まれば 1、それ以外は 0。
// 拒否は取得元のデータが規則に合わないだけで、同期は最後まで進むので 0 にする。

import type { Logger } from "../../application/ports/logger.js";
import { syncCatalog } from "../../application/sync-catalog.js";
import { loadConfig } from "../../infrastructure/config.js";
import { connect } from "../../infrastructure/db/client.js";
import { DrizzleUnitOfWork } from "../../infrastructure/db/unit-of-work.js";
import { GatcgCatalogSource } from "../../infrastructure/gatcg/catalog-source.js";
import { UuidV7IdGenerator } from "../../infrastructure/id-generator.js";

const logger: Logger = {
  info: (message, details) => console.log(message, details ?? ""),
  warn: (message, details) => console.warn(message, details ?? ""),
  error: (message, details) => console.error(message, details ?? ""),
};

const { db, close } = connect(loadConfig().DATABASE_URL);
const ids = new UuidV7IdGenerator();
try {
  const summary = await syncCatalog({
    source: new GatcgCatalogSource(),
    unitOfWork: new DrizzleUnitOfWork(db, ids),
    ids,
    logger,
    now: () => new Date(),
  });
  console.log(JSON.stringify(summary, null, 2));
  const conflicted = summary.sets.conflicted + summary.cards.conflicted;
  process.exitCode = conflicted > 0 ? 1 : 0;
} catch (error) {
  logger.error("同期が止まった", { error });
  process.exitCode = 1;
} finally {
  await close();
}
