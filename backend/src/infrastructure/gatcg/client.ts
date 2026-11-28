import { setTimeout } from "node:timers/promises";

import { pageSchema } from "./schemas.js";

const BASE_URL = "https://api.gatcg.com";
// 取得元は page_size を省くと 30 件ずつ返し、50 より大きい値は 50 に切り詰める。
const PAGE_SIZE = 50;
const ATTEMPTS = 3;
const BACKOFF_MS = 1_000;

export type FetchedCards = {
  /** 取得元が返したカード。形はまだ確かめていない。 */
  readonly cards: readonly unknown[];
  /** 取得元が返した総数。 */
  readonly totalCards: number;
};

/**
 * カード検索の全ページを 1 ページずつ順に取得する。失敗したページは間を空けて取り直し、
 * それでも失敗すれば例外を投げる。
 */
export async function fetchAllCards(fetchFn: typeof fetch = fetch): Promise<FetchedCards> {
  const fetchFrom = async (page: number): Promise<FetchedCards> => {
    const current = await fetchPage(fetchFn, page);
    if (!current.has_more) return { cards: current.data, totalCards: current.total_cards };
    const rest = await fetchFrom(page + 1);
    return { cards: [...current.data, ...rest.cards], totalCards: rest.totalCards };
  };
  return await fetchFrom(1);
}

async function fetchPage(fetchFn: typeof fetch, page: number, attempt = 1) {
  const url = `${BASE_URL}/cards/search?page=${page}&page_size=${PAGE_SIZE}`;
  try {
    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`${url} が ${response.status} を返した`);
    return pageSchema.parse(await response.json());
  } catch (error) {
    if (attempt >= ATTEMPTS) {
      throw new Error(`${url} を ${ATTEMPTS} 回試して取得できなかった`, { cause: error });
    }
    await setTimeout(BACKOFF_MS * attempt);
    return await fetchPage(fetchFn, page, attempt + 1);
  }
}
