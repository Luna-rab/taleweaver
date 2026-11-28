// sync:catalog と events:process を 1 つのプロセスで続けて動かす。
// 同期が例外で止まっても、それまでに積んだ仕事は処理する。
// 終了コードは、どちらかが失敗を報告するか例外で止まれば 1、それ以外は 0。

import { processJobs } from "../../application/process-jobs.js";
import { syncCatalog } from "../../application/sync-catalog.js";
import { jobsFailed, logger, syncFailed, wire } from "./wiring.js";

const deps = wire();
try {
  const syncOk = await syncCatalog(deps.syncCatalog).then(
    (summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return !syncFailed(summary);
    },
    (error: unknown) => {
      logger.error("同期が止まった", { error });
      return false;
    },
  );
  const summary = await processJobs(deps.processJobs);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = syncOk && !jobsFailed(summary) ? 0 : 1;
} catch (error) {
  logger.error("仕事の処理が止まった", { error });
  process.exitCode = 1;
} finally {
  await deps.close();
}
