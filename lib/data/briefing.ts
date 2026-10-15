import "server-only";
import { buildBriefing, PERIODS, resolveWindow, type Period } from "../analytics/briefing";
import { addDays, todayKey } from "../analytics/time";
import { getSettings } from "./settings";
import { listTrades } from "./trades";
import { dueCapsules, listJournalDays } from "./journal";

async function loadData(date?: string | null) {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
  // Enough history for comparisons, ring streaks and the prop simulation.
  const from = addDays(anchor, -150);
  const until = addDays(today, 2);
  const [trades, journals, capsules] = await Promise.all([
    listTrades({ since: new Date(`${from}T00:00:00Z`), until: new Date(`${until}T00:00:00Z`) }),
    listJournalDays(from, until),
    dueCapsules(today),
  ]);
  return { settings, tz, trades, journals, capsules };
}

/** Loads everything a briefing needs and builds its slides. */
export async function loadBriefing(period: Period, date?: string | null) {
  const d = await loadData(date);
  const window = resolveWindow(period, d.tz, d.trades, date);
  return {
    settings: d.settings,
    briefing: buildBriefing({ window, trades: d.trades, journals: d.journals, capsules: d.capsules, settings: d.settings }),
  };
}

/** Lightweight descriptors for the story rings on the Today screen. */
export async function briefingStubs() {
  const d = await loadData();
  return PERIODS.map((period) => {
    const window = resolveWindow(period, d.tz, d.trades, null);
    const b = buildBriefing({ window, trades: d.trades, journals: d.journals, capsules: d.capsules, settings: d.settings });
    const cover = b.slides[0];
    return {
      period,
      id: b.window.id,
      hash: b.hash,
      title: b.window.title,
      label: b.window.label,
      net: cover?.kind === "cover" ? cover.net : 0,
      trades: cover?.kind === "cover" ? cover.trades : 0,
    };
  });
}
