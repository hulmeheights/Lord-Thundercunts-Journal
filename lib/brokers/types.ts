import type { NormalizedFill } from "./roundtrip";

export type BrokerAccountInfo = {
  externalId: string;
  name: string;
  isSim: boolean;
  balance: number | null;
  active: boolean;
};

export type TokenCache = {
  get(): Promise<{ token: string; expiresAt: Date } | null>;
  set(token: string, expiresAt: Date): Promise<void>;
  clear(): Promise<void>;
};

export interface BrokerClient {
  listAccounts(): Promise<BrokerAccountInfo[]>;
  listFills(accounts: BrokerAccountInfo[], since: Date): Promise<NormalizedFill[]>;
}

/** Errors whose message is safe to show the user (never contains secrets). */
export class BrokerError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
