import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { RankingsClient } from './RankingsClient';
import { fetchRankings } from '@/lib/rankings';
import { detectLocaleFromLanguage, getTranslations } from '@/lib/i18n-core';

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromLanguage((await headers()).get('accept-language'));
  const t = getTranslations(locale);
  return {
    title: t.meta.rankingsTitle,
    description: t.meta.rankingsDescription,
  };
}

async function getRankings() {
  try {
    return await fetchRankings();
  } catch {
    return { rankings: [], total: 0 };
  }
}

export default async function RankingsPage() {
  const { rankings, total } = await getRankings();
  return <RankingsClient rankings={rankings} total={total} />;
}
