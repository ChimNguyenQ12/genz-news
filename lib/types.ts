export type CategorySlug =
  | "the-gioi"
  | "cong-nghe"
  | "giai-tri"
  | "doi-song"
  | "kinh-doanh"
  | "the-thao";

export interface Category {
  slug: CategorySlug;
  name: string;
  color: string; // tailwind color token e.g. "blue"
}

export interface SourceRef {
  name: string;
  url: string;
}

export interface Article {
  slug: string;
  title: string;
  dek: string; // subheadline / one-line summary
  category: CategorySlug;
  tags: string[];
  coverGradient: [string, string]; // placeholder gradient instead of scraped images
  author: string;
  publishedAt: string; // ISO date
  readingTimeMin: number;
  featured?: boolean;
  trending?: boolean;
  body: string[]; // paragraphs, originally-written summary/rewrite
  sources: SourceRef[]; // attribution to foreign outlets
}
