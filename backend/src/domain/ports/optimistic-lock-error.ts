/**
 * repository の save が、読んだときの版と保存済みの版が合わないので保存しなかった。
 * 読んだ後に、ほかの処理が同じ集約を保存している。
 */
export class OptimisticLockError extends Error {
  override name = "OptimisticLockError";

  constructor(aggregateType: string, id: string, version: number) {
    super(`${aggregateType} ${id} は版 ${version} から変わっていたので保存しなかった`);
  }
}
