/** policy_jobs から拾った仕事。 */
export type Job = {
  readonly id: string;
  readonly kind: string;
  /** イベントから積んだ仕事は、イベントの id だけを持つ。中身はイベントから読む。 */
  readonly payload: { readonly eventId: string };
  /** 今回の試行を含めた試行の回数。拾った時点で 1 増えている。 */
  readonly attempts: number;
};

/** 失敗した仕事をいつ試し直すか。null なら試し直さない。 */
export type JobFailure = {
  readonly error: string;
  readonly retryAfterMs: number | null;
};

/**
 * 積まれた仕事の置き場所。拾った仕事は一定の時間ほかから拾えなくなり、その間に complete も fail も
 * 呼ばれなければ（プロセスが落ちたなど）また拾える。
 */
export interface JobQueue {
  /** 実行してよい仕事を limit 件まで拾う。なければ空の配列を返す。 */
  claim(limit: number): Promise<readonly Job[]>;
  /** 終わった仕事を消す。 */
  complete(job: Job): Promise<void>;
  /** 失敗を記録する。retryAfterMs が null なら、二度と拾わない。 */
  fail(job: Job, failure: JobFailure): Promise<void>;
}
