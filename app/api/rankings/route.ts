import { NextRequest, NextResponse } from 'next/server';
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

const LEADERBOARD_KEY = 'downloads:leaderboard';
const DEFAULT_LIMIT   = 20;
const MAX_LIMIT       = 100;

function metaKey(member: string): string {
  return `downloads:meta:${member}`;
}

export async function GET(req: NextRequest): Promise<NextResponse<RankingsResponse>> {
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  if (!kvAvailable()) {
    return NextResponse.json({ rankings: [], total: 0 });
  }

  try {
    // Step 1: get top-N members with scores
    const rangeResult = await kvPipeline([
      ['ZREVRANGE', LEADERBOARD_KEY, '0', String(limit - 1), 'WITHSCORES'],
      ['ZCARD', LEADERBOARD_KEY],
    ]);

    const rawRange = rangeResult[0]?.result;
    const total    = typeof rangeResult[1]?.result === 'number' ? rangeResult[1].result : 0;

    if (!Array.isArray(rawRange) || rawRange.length === 0) {
      return NextResponse.json({ rankings: [], total });
    }

    // ZREVRANGE WITHSCORES returns alternating [member, score, ...]
    const members: string[] = [];
    const scores:  number[] = [];
    for (let i = 0; i < rawRange.length; i += 2) {
      members.push(String(rawRange[i]));
      scores.push(Number(rawRange[i + 1]));
    }

    // Step 2: fetch metadata for each member in one pipeline
    const metaResult = await kvPipeline(members.map(m => ['HGETALL', metaKey(m)]));

    const rankings: RankingEntry[] = members.map((m, idx) => {
      const [source, ...idParts] = m.split(':');
      const id   = idParts.join(':');
      const meta = metaResult[idx]?.result;

      let name:    string | null = null;
      let iconUrl: string | null = null;

      if (Array.isArray(meta)) {
        // HGETALL returns flat [field, value, field, value, ...]
        for (let i = 0; i < meta.length; i += 2) {
          if (meta[i] === 'name')    name    = meta[i + 1] || null;
          if (meta[i] === 'iconUrl') iconUrl = meta[i + 1] || null;
        }
      }

      return { rank: idx + 1, member: m, source, id, name, iconUrl, count: scores[idx] };
    });

    return NextResponse.json(
      { rankings, total },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (err) {
    console.error('[rankings] KV error:', err);
    return NextResponse.json({ rankings: [], total: 0 });
  }
}
