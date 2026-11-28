// 取得元の全カードとセットを DB に取り込む。
// 終了コードは、版が合わずに保存しなかった集約があるか例外で止まれば 1、それ以外は 0。
// 拒否は取得元のデータが規則に合わないだけで、同期は最後まで進むので 0 にする。

import { syncCatalog } from "../../application/sync-catalog.js";
import { logger, syncFailed, wire } from "./wiring.js";

const deps = wire();
try {
  const summary = await syncCatalog(deps.syncCatalog);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = syncFailed(summary) ? 1 : 0;
} catch (error) {
  logger.error("同期が止まった", { error });
  process.exitCode = 1;
} finally {
  await deps.close();
}
