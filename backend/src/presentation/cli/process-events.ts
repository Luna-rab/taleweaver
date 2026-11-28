// イベントから積んだ仕事を、拾えるものがなくなるまで処理する。
// 終了コードは、失敗した試行があるか例外で止まれば 1、それ以外は 0。後で試し直す仕事があっても 1 にする。

import { processJobs } from "../../application/process-jobs.js";
import { jobsFailed, logger, wire } from "./wiring.js";

const deps = wire();
try {
  const summary = await processJobs(deps.processJobs);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = jobsFailed(summary) ? 1 : 0;
} catch (error) {
  logger.error("仕事の処理が止まった", { error });
  process.exitCode = 1;
} finally {
  await deps.close();
}
