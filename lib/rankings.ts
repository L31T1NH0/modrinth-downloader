import { kvPipeline, kvAvailable } from '@/lib/kvClient';

export interface RankingEntry {
  rank:    number;
  member:  string;
  source:  string;
  id:      string;
  name:    string | null;
  iconUrl: string | null;
  count:   number;
}

export interface RankingsResponse {
  rankings: RankingEntry[];
  total:    number;
}

export const LEADERBOARD_KEY = 'downloads:leaderboard';
export const DEFAULT_LIMIT   = 20;
export const MAX_LIMIT       = 100;

export function metaKey(member: string): string {
  return `downloads:meta:${member}`;
}

export async function fetchRankings(limit = DEFAULT_LIMIT): Promise<RankingsResponse> {
  if (!kvAvailable()) return { rankings: [], total: 0 };

  const rangeResult = await kvPipeline([
    ['ZREVRANGE', LEADERBOARD_KEY, '0', String(limit - 1), 'WITHSCORES'],
    ['ZCARD', LEADERBOARD_KEY],
  ]);

  const rawRange = rangeResult[0]?.result;
  const total    = typeof rangeResult[1]?.result === 'number' ? rangeResult[1].result : 0;

  if (!Array.isArray(rawRange) || rawRange.length === 0) {
    return { rankings: [], total };
  }

  const members: string[] = [];
  const scores:  number[] = [];
  for (let i = 0; i < rawRange.length; i += 2) {
    members.push(String(rawRange[i]));
    scores.push(Number(rawRange[i + 1]));
  }

  const metaResult = await kvPipeline(members.map(m => ['HGETALL', metaKey(m)]));

  const rankings: RankingEntry[] = members.map((m, idx) => {
    const [source, ...idParts] = m.split(':');
    const id   = idParts.join(':');
    const meta = metaResult[idx]?.result;

    let name:    string | null = null;
    let iconUrl: string | null = null;

    if (Array.isArray(meta)) {
      for (let i = 0; i < meta.length; i += 2) {
        if (meta[i] === 'name')    name    = meta[i + 1] || null;
        if (meta[i] === 'iconUrl') iconUrl = meta[i + 1] || null;
      }
    }

    return { rank: idx + 1, member: m, source, id, name, iconUrl, count: scores[idx] };
  });

  return { rankings, total };
}
