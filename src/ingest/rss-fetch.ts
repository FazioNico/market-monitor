import type { FeedCatalogEntry } from "../shared/types";

export interface RssFetchResult {
  feed: FeedCatalogEntry;
  xml: string;
  fetchedAt: string;
  status: number;
}

export interface RssFetchOptions {
  fetchFn?: typeof fetch;
  now?: Date;
  lookbackHours?: number;
}

export async function fetchRssFeed(
  feed: FeedCatalogEntry,
  options: RssFetchOptions = {},
): Promise<RssFetchResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(feed.url, {
    headers: {
      "user-agent": "market-monitor/0.1",
      accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });

  const xml = await response.text();

  return {
    feed,
    xml,
    fetchedAt: (options.now ?? new Date()).toISOString(),
    status: response.status,
  };
}

export async function fetchRssFeeds(
  feeds: FeedCatalogEntry[],
  options: RssFetchOptions = {},
): Promise<RssFetchResult[]> {
  return Promise.all(feeds.map((feed) => fetchRssFeed(feed, options)));
}
