/** Shared, client-safe domain types. */

export type Provider = "topstepx" | "tradovate";
export type TradeSource = Provider | "manual" | "sample";
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
};

export type Capsule = {
  id: string;
  message: string;
  createdAt: string;
  deliverOn: string;
  openedAt: string | null;
};

export type ConnectionInfo = {
  provider: Provider;
  label: string;
  usernameHint: string | null;
  environment: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type BrokerAccount = {
  id: string;
  provider: Provider;
  externalId: string;
  name: string;
  isSim: boolean;
  balance: number | null;
  active: boolean;
  included: boolean;
};
