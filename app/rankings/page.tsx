import type { Metadata } from 'next';
import { RankingsClient } from './RankingsClient';
import type { RankingsResponse } from '@/app/api/rankings/route';

export const metadata: Metadata = {
  title: 'Rankings – Dynrinth',
  description: 'Most downloaded Minecraft mods through Dynrinth',
};

async function getRankings(): Promise<RankingsResponse> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const res  = await fetch(`${base}/api/rankings`, { next: { revalidate: 60 } });
    if (!res.ok) return { rankings: [], total: 0 };
    return res.json();
  } catch {
    return { rankings: [], total: 0 };
  }
}

export default async function RankingsPage() {
  const { rankings, total } = await getRankings();
  return <RankingsClient rankings={rankings} total={total} />;
}
