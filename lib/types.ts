export type CompetitorItem = {
  title: string;
  link: string;
  bloggerName: string;
  postdate: string;
  description: string;
  charCount?: number | null;
  paragraphCount?: number | null;
  headingCount?: number | null;
  imageCount?: number | null;
  keywordCount?: number | null;
  crawled?: boolean;
  rawText?: string;
  imageUrls?: string[];
  frequentKeywords?: string[];
  contentFeatures?: string[];
  photoFeatures?: string[];
  authorPerspective?: string;
  seoStructure?: string[];
  review?: string;
  confidence?: number;
};

export type SuggestedKeyword = { keyword: string; min: number; max: number; reason?: string; };
export type PhotoPlanItem = { section: string; min: number; max: number; note: string; };

export type CompetitorCommonAnalysis = {
  commonKeywords: string[];
  commonFeatures: string[];
  photoCommonFeatures: string[];
  strengths: string[];
  gaps: string[];
  takeaways: string[];
  differentiators: string[];
  overallReview: string;
  contentStrategy: string;
  suggestedKeywords: SuggestedKeyword[];
  photoTotalMin: number;
  photoTotalMax: number;
  photoPlan: PhotoPlanItem[];
};

export type KeywordAnalysis = {
  keyword: string;
  totalResults: number;
  relatedKeywords: string[];
  competition: "낮음" | "중간" | "높음";
  recommendedLength: string;
  recommendedLengthMin: number;
  recommendedLengthMax: number;
  crawlSuccessCount: number;
  crawlTargetCount: number;
  sourceMode: "manual-ranking" | "api-reference";
  averages: { charCount: number | null; paragraphCount: number | null; headingCount: number | null; imageCount: number | null; keywordCount: number | null; };
  medianCharCount: number | null;
  minCharCount: number | null;
  maxCharCount: number | null;
  competitors: CompetitorItem[];
  commonAnalysis: CompetitorCommonAnalysis;
  strategyPrompt: string;
  insight: string;
};

export type KeywordTarget = { keyword: string; min: number; max: number; };
export type KeywordPlan = { main: KeywordTarget; additional: KeywordTarget[]; requiredPhrases: string[]; };

export type ApiUsage = {
  date: string;
  naver: { used: number; limit: number; remaining: number };
  gemini: { used: number; limit: number; remaining: number };
  openai: { used: number; limit: number; remaining: number };
};
