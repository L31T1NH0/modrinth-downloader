import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { detectLocaleFromLanguage, getTranslations, htmlLang } from '@/lib/i18n-core';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jb-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromLanguage((await headers()).get('accept-language'));
  const t = getTranslations(locale);
  return {
    title: 'Dynrinth',
    description: t.meta.homeDescription,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = detectLocaleFromLanguage((await headers()).get('accept-language'));
  return (
    <html lang={htmlLang(locale)} className={`${outfit.variable} ${jbMono.variable}`}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
