import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { shopDir, shopFile } from "./shop-data-path.js";

const MAX_ENTRIES = 200;

function analyticsPath() {
  return shopFile("analytics.json");
}

function loadStore() {
  const ANALYTICS_PATH = analyticsPath();
  if (!existsSync(ANALYTICS_PATH)) {
    return { entries: [] };
  }
  return JSON.parse(readFileSync(ANALYTICS_PATH, "utf8"));
}

function saveStore(store) {
  const ANALYTICS_PATH = analyticsPath();
  mkdirSync(shopDir(), { recursive: true });
  writeFileSync(ANALYTICS_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function positionMap(ids) {
  return new Map(ids.map((id, i) => [id, i]));
}

export function recordSortAnalytics({
  handle,
  title,
  beforeIds,
  afterIds,
  moves = 0,
  strategy,
  withinTierSort,
  dryRun = false,
}) {
  const beforePos = positionMap(beforeIds);
  const afterPos = positionMap(afterIds);

  const changes = [];
  for (const id of beforeIds) {
    const from = beforePos.get(id);
    const to = afterPos.get(id);
    if (to === undefined) {
      changes.push({ id, from, to: null, delta: null, hidden: true });
    } else if (from !== to) {
      changes.push({ id, from, to, delta: from - to });
    }
  }

  const movedUp = changes.filter((c) => c.delta > 0).length;
  const movedDown = changes.filter((c) => c.delta < 0).length;
  const hidden = changes.filter((c) => c.hidden).length;

  const entry = {
    id: Date.now(),
    handle,
    title,
    dryRun,
    moves,
    strategy,
    withinTierSort: withinTierSort ?? null,
    movedUp,
    movedDown,
    hidden,
    topBefore: beforeIds.slice(0, 10),
    topAfter: afterIds.slice(0, 10),
    recordedAt: new Date().toISOString(),
  };

  const store = loadStore();
  store.entries.unshift(entry);
  store.entries = store.entries.slice(0, MAX_ENTRIES);
  saveStore(store);

  return entry;
}

export function listAnalytics(handle = "") {
  const store = loadStore();
  if (!handle) return store.entries;
  return store.entries.filter((e) => e.handle === handle);
}

export function getCollectionInsights(handle) {
  const entries = listAnalytics(handle).filter((e) => !e.dryRun);
  if (!entries.length) {
    return { handle, runs: 0, lastRun: null, avgMoves: 0, recent: [] };
  }

  const avgMoves =
    entries.reduce((sum, e) => sum + (e.moves ?? 0), 0) / entries.length;

  return {
    handle,
    runs: entries.length,
    lastRun: entries[0].recordedAt,
    avgMoves: Math.round(avgMoves * 10) / 10,
    lastTopAfter: entries[0].topAfter,
    recent: entries.slice(0, 5).map((e) => ({
      recordedAt: e.recordedAt,
      moves: e.moves,
      movedUp: e.movedUp,
      movedDown: e.movedDown,
      hidden: e.hidden,
      strategy: e.strategy,
    })),
  };
}
