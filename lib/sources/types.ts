export interface FeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  sourceName: string;
}

export interface TrendingTopic {
  keyword: string;
  approxTraffic?: string;
  relatedArticles: {
    title: string;
    url: string;
    source: string;
  }[];
}
