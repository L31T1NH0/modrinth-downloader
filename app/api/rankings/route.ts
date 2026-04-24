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

async function queryLeaderboard(key: string, fetchLimit: number) {
  const rangeResult = await kvPipeline([
    ['ZREVRANGE', key, '0', String(fetchLimit - 1), 'WITHSCORES'],
    ['ZCARD', key],
  ]);

  const rawRange = rangeResult[0]?.result;
  const total    = typeof rangeResult[1]?.result === 'number' ? rangeResult[1].result : 0;

  const members: string[] = [];
  const scores:  number[] = [];

  if (Array.isArray(rawRange)) {
    for (let i = 0; i < rawRange.length; i += 2) {
      members.push(String(rawRange[i]));
      scores.push(Number(rawRange[i + 1]));
    }
  }

  return { members, scores, total };
}

export async function GET(req: NextRequest): Promise<NextResponse<RankingsResponse>> {
  const limitParam       = req.nextUrl.searchParams.get('limit');
  const contentTypeParam = req.nextUrl.searchParams.get('contentType');
  const versionParam     = req.nextUrl.searchParams.get('version');
  const sourceParam      = req.nextUrl.searchParams.get('source');

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  if (!kvAvailable()) {
    return NextResponse.json({ rankings: [], total: 0 });
  }

  try {
    // Select leaderboard based on specificity: contentType+version > contentType > global
    let leaderboardKey = LEADERBOARD_KEY;
    if (contentTypeParam && versionParam) {
      leaderboardKey = `downloads:leaderboard:${contentTypeParam}:${versionParam}`;
    } else if (contentTypeParam) {
      leaderboardKey = `downloads:leaderboard:${contentTypeParam}`;
    }

    // Fetch more when source-filtering to have enough after filtering
    const fetchLimit = sourceParam ? MAX_LIMIT : limit;
    const { members, scores, total } = await queryLeaderboard(leaderboardKey, fetchLimit);

    if (members.length === 0) {
      return NextResponse.json({ rankings: [], total });
    }

    // Fetch metadata for each member in one pipeline
    const metaResult = await kvPipeline(members.map(m => ['HGETALL', metaKey(m)]));

    let rankings: RankingEntry[] = members.map((m, idx) => {
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

    // Filter by source and re-rank if needed
    if (sourceParam) {
      rankings = rankings
        .filter(r => r.source === sourceParam)
        .slice(0, limit)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }

    return NextResponse.json(
      { rankings, total },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (err) {
    console.error('[rankings] KV error:', err);
    return NextResponse.json({ rankings: [], total: 0 });
  }
}
