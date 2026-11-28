/**
 * イベントの種類ごとに、そのイベントを受けて動く仕事の種類。EventWriter.append がこの表で policy_jobs に積む。
 * 載っていないイベントは何も積まない。
 */
export const subscriptions: ReadonlyMap<string, readonly string[]> = new Map([
  ["CardRegistered", ["attach-edition-images"]],
  ["CardEditionAdded", ["attach-edition-images"]],
]);
