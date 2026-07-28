import { type RankingType, type RegionScope } from "@/lib/wca";

export const RANKINGS_CACHE_REFRESH_MS = 60_000;
export const RANKINGS_CACHE_CAPACITY_333 = 512;
export const RANKINGS_CACHE_CAPACITY_DEFAULT = 128;

export type RankingsPageKey = {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  startRank: number;
};

type CacheEntry<T> = { value: T; permanent: boolean };

function keyFor({ type, scope, regionId, startRank }: RankingsPageKey) {
  return `${type}:${scope}:${regionId}:${startRank}`;
}

function isPermanentPage(key: RankingsPageKey) {
  return key.scope === "world" && key.startRank === 1;
}

/** Process-local LRU pools. First world pages are pinned so warm navigation stays fast. */
export class RankingsPageCache<T> {
  private readonly pools = new Map<string, Map<string, CacheEntry<T>>>();
  private readonly pending = new Map<string, Promise<T>>();

  private pool(eventId: string) {
    let pool = this.pools.get(eventId);
    if (!pool) {
      pool = new Map();
      this.pools.set(eventId, pool);
    }
    return pool;
  }

  clear() {
    this.pools.clear();
    this.pending.clear();
  }

  entryCount(eventId: string) {
    return this.pools.get(eventId)?.size ?? 0;
  }

  has(key: RankingsPageKey) {
    return this.pools.get(key.eventId)?.has(keyFor(key)) ?? false;
  }

  async get(key: RankingsPageKey, load: () => Promise<T>) {
    return (await this.getWithStatus(key, load)).value;
  }

  async getWithStatus(key: RankingsPageKey, load: () => Promise<T>) {
    const normalized = { ...key, startRank: Math.max(1, Math.floor(key.startRank)) };
    const cacheKey = `${normalized.eventId}:${keyFor(normalized)}`;
    const pool = this.pool(normalized.eventId);
    const cached = pool.get(keyFor(normalized));
    if (cached) {
      if (!cached.permanent) {
        pool.delete(keyFor(normalized));
        pool.set(keyFor(normalized), cached);
      }
      return { value: cached.value, outcome: "hit" as const };
    }
    const inFlight = this.pending.get(cacheKey);
    if (inFlight) return { value: await inFlight, outcome: "coalesced" as const };

    const request = load().then((value) => {
      this.put(normalized, value);
      return value;
    });
    this.pending.set(cacheKey, request);
    try {
      return { value: await request, outcome: "miss" as const };
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  private put(key: RankingsPageKey, value: T) {
    const pool = this.pool(key.eventId);
    const pageKey = keyFor(key);
    pool.delete(pageKey);
    pool.set(pageKey, { value, permanent: isPermanentPage(key) });
    const capacity = key.eventId === "333"
      ? RANKINGS_CACHE_CAPACITY_333
      : RANKINGS_CACHE_CAPACITY_DEFAULT;
    while (pool.size > capacity) {
      const oldest = [...pool.entries()].find(([, entry]) => !entry.permanent);
      if (!oldest) return;
      pool.delete(oldest[0]);
    }
  }
}

export const rankingsPageCache = new RankingsPageCache<unknown>();

export function normalPageKey(input: RankingsPageKey) {
  return { ...input, startRank: Math.max(1, Math.floor(input.startRank)) };
}
