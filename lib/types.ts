/** Shared, client-safe domain types. */

/** Platform family a connection talks to. */
export type Provider = "projectx" | "tradovate";
/** A connection id (e.g. "topstepx", "projectx-lucid"), or "manual" | "sample" | "import". */
export type TradeSource = string;
export type Direction = "long" | "short";

export type Trade = {
  id: string;
  source: TradeSource;
  accountId: string | null;
  symbol: string;
  root: string;
  direction: Direction;
  qty: number;
  maxPosition: number | null;
  entryTime: string; // ISO
  exitTime: string; // ISO
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  pointValue: number;
  fillCount: number;
  setup: string | null;
  tags: string[];
  mistakes: string[];
  emotion: string | null;
  rating: number | null;
  notes: string | null;
  plannedRisk: number | null;
  followedPlan: boolean | null;
  chartUrl: string | null;
};

export type Readiness = {
  sleep: number; // 1-5
  energy: number;
  focus: number;
  mood: number;
};

export type DayTask = { id: string; label: string; done: boolean };

export type JournalDay = {
  day: string; // YYYY-MM-DD
  checklist: Record<string, boolean>;
  tasks: DayTask[];
  readiness: Readiness | null;
  intention: string | null;
  plan: string | null;
  review: string | null;
  wins: string | null;
  lessons: string | null;
  moodAfter: number | null;
  rulesKept: Record<string, boolean>;
  isSample: boolean;
};

export type RitualItem = { id: string; label: string; group: "pre" | "post" | "life" };

export type TradingRules = {
  maxTradesPerDay: number | null;
  maxDailyLoss: number | null;
  stopAfterConsecutiveLosses: number | null;
  maxContracts: number | null;
  maxLossPerTrade: number | null;
  cooldownMinutesAfterLoss: number | null;
  sessionStart: string | null; // "HH:MM" in profile timezone
  sessionEnd: string | null;
  defaultRisk: number | null;
  custom: { id: string; label: string }[];
};

export type PropSettings = {
  enabled: boolean;
  firm: string;
  preset: "50K" | "100K" | "150K" | "custom";
  phase: "combine" | "funded";
  startBalance: number;
  profitTarget: number | null;
  maxLossLimit: number;
  dailyLossLimit: number | null;
  consistencyPct: number | null;
  maxContracts: number | null;
  startDate: string; // YYYY-MM-DD
  accountIds: string[]; // empty = all
};

export type Settings = {
  profile: { name: string; timezone: string };
  rules: TradingRules;
  prop: PropSettings;
  ritual: RitualItem[];
  vocab: { setups: string[]; mistakes: string[]; emotions: string[] };
  security: { passkeyOnly: boolean };
  ai: { enabled: boolean };
  observer: {
    name: string | null;
    pronoun: "they" | "he" | "she";
    /** The one order the Observer checks against every session, or null. */
    pinned: ObstacleKey | null;
    /** The day (YYYY-MM-DD) the order was pinned. */
    pinnedAt: string | null;
    /** The numbers the pinned order was written with, so its sentence and its check never drift apart. */
    pinnedParams: OrderParams | null;
  };
};

/** A pattern the Observer can find in the trades — and the order written against it. */
export type ObstacleKey =
  | "overtrading"
  | "revenge"
  | "holding-losers"
  | "cutting-winners"
  | "rule-breaks"
  | "bad-hours"
  | "sizing-up"
  | "unprepared"
  | "mistakes"
  | "fees";

/** The numbers an Observer order is written and checked with. */
export type OrderParams = {
  /** Trades a day (overtrading, fees). */
  limit?: number;
  /** Minutes: the cool-down after a loss (revenge) or the bail-out time (holding losers). */
  minutes?: number;
  /** Local hour 0–23 to stay out of (bad hours). */
  hour?: number;
  /** Contracts allowed straight after a loss (sizing up). */
  qty?: number;
  /** A rule or mistake label (rule breaks, mistakes). */
  label?: string;
};

export type Capsule = {
  id: string;
  message: string;
  createdAt: string;
  deliverOn: string;
  openedAt: string | null;
};

export type ConnectionInfo = {
  id: string;
  provider: Provider;
  firm: string | null;
  label: string;
  usernameHint: string | null;
  environment: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type BrokerAccount = {
  id: string;
  /** Connection id this account belongs to ("import" accounts use "import"). */
  connectionId: string;
  externalId: string;
  name: string;
  isSim: boolean;
  balance: number | null;
  active: boolean;
  included: boolean;
};
