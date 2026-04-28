import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import {
  ArrowDownTrayIcon,
  CodeBracketIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  CommandLineIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';
import { Press_Start_2P } from 'next/font/google';
import ChatMock from './ChatMock';
import ScrollHint from './ScrollHint';
import { Wordmark } from '@/components/Wordmark';
import { detectLocaleFromLanguage, getTranslations } from '@/lib/i18n-core';

const pixelFont = Press_Start_2P({ weight: '400', subsets: ['latin'], display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromLanguage((await headers()).get('accept-language'));
  const t = getTranslations(locale);
  return {
    title: t.meta.modTitle,
    description: t.meta.modDescription,
  };
}

const GITHUB_URL   = 'https://github.com/L31T1NH0/dynrinth-mod';
const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

function Divider() {
  return <div className="h-px bg-line-subtle mx-6 max-w-2xl w-[calc(100%-3rem)] self-center" />;
}

export default async function ModPage() {
  const locale = detectLocaleFromLanguage((await headers()).get('accept-language'));
  const t = getTranslations(locale);

  const steps = [
    {
      Icon:  MagnifyingGlassIcon,
      n:     '01',
      title: t.modPage.steps.buildTitle,
      body:  t.modPage.steps.buildBody,
    },
    {
      Icon:  CommandLineIcon,
      n:     '02',
      title: t.modPage.steps.runTitle,
      body:  t.modPage.steps.runBody,
    },
    {
      Icon:  RocketLaunchIcon,
      n:     '03',
      title: t.modPage.steps.restartTitle,
      body:  t.modPage.steps.restartBody,
    },
  ];

  const commands = [
    { cmd: '/dynrinth <code>',        desc: t.modPage.commands.install        },
    { cmd: '/dynrinth <code> force',  desc: t.modPage.commands.force          },
    { cmd: '/dynrinth remove <code>', desc: t.modPage.commands.remove         },
  ];

  const platforms = [
    { label: t.modPage.platforms.fabric,   range: '1.18.2 - latest' },
    { label: t.modPage.platforms.neoForge, range: '1.21.1+'          },
    { label: t.modPage.platforms.paper,    range: '1.21.1+'          },
  ];

  const chatLines = [
    { prefix: '>', text: '/dynrinth ABC1234567X', type: 'input'    as const },
    { prefix: '◆', text: t.modPage.chat.fetching, type: 'info'     as const },
    { prefix: '◆', text: t.modPage.chat.resolving, type: 'info'    as const },
    { prefix: '⬇', text: t.modPage.chat.downloadingA, type: 'progress' as const },
    { prefix: '⬇', text: t.modPage.chat.downloadingB, type: 'progress' as const },
    { prefix: '✓', text: t.modPage.chat.done, type: 'ok' as const },
  ];

  return (
    <main className="min-h-dvh bg-bg-base text-ink-primary font-sans flex flex-col">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-3.5 border-b border-line-subtle bg-bg-base shrink-0 h-12">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="inline-flex items-center text-ink-tertiary hover:text-ink-primary transition-colors"
        >
          <CodeBracketIcon className="w-3.5 h-3.5" />
        </a>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center text-center px-6 pt-12 pb-10 gap-5 max-w-2xl mx-auto w-full min-h-[calc(100dvh-3rem)]">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dynrinth-wordmark.svg" alt="Dynrinth" className="h-12 w-auto block sm:translate-x-9 -mt-3 mb-6" />
          <h1 className="text-[1.75rem] font-semibold tracking-tight leading-tight">
            {t.modPage.hero.titleLine1}<br />
            <span className="text-brand">{t.modPage.hero.titleLine2}</span>
          </h1>
          <p className="text-ink-secondary text-[14px] leading-relaxed max-w-sm mx-auto">
            {t.modPage.hero.description}{' '}
            <code className="text-brand font-mono text-[13px]">/dynrinth CODE</code>{' '}
            {t.modPage.hero.descriptionTail}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-5 rounded-lg bg-brand text-brand-dark text-[13px] font-semibold flex items-center gap-2 hover:bg-brand-hover active:scale-95 transition-all"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {t.modPage.download}
          </a>
          <Link
            href="/"
            className="h-9 px-5 rounded-lg bg-bg-surface border border-line text-ink-secondary text-[13px] font-medium flex items-center gap-2 hover:text-ink-primary hover:border-line-strong active:scale-95 transition-all"
          >
            {t.modPage.build}
          </Link>
        </div>

        <ChatMock title={t.modPage.chat.title} lines={chatLines} fontClassName={pixelFont.className} />

        {/* Fog + scroll arrow — anchored to bottom of hero */}
        <div className="absolute bottom-0 left-0 right-0 h-32 flex items-end justify-center pb-5 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-bg-base to-transparent" />
          <ScrollHint />
        </div>
      </section>

      <Divider />

      {/* ── How it works ── */}
      <section id="how-it-works" className="flex flex-col items-center px-6 py-10 max-w-2xl mx-auto w-full gap-8">
        <p className="text-[9px] font-medium text-ink-tertiary uppercase tracking-widest self-start">
          {t.modPage.howItWorks}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full">
          {steps.map(({ Icon, n, title, body }) => (
            <div key={n} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-glow border border-brand/20 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-brand" />
                </div>
                <p className="text-[13px] font-semibold">{title}</p>
              </div>
              <p className="text-[12px] text-ink-secondary leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Commands ── */}
      <section className="flex flex-col items-center px-6 py-10 max-w-2xl mx-auto w-full gap-6">
        <p className="text-[9px] font-medium text-ink-tertiary uppercase tracking-widest self-start">
          {t.modPage.commands.title}
        </p>
        <div className="w-full flex flex-col divide-y divide-line">
          {commands.map(c => (
            <div key={c.cmd} className="flex items-center justify-between gap-4 py-3">
              <code className="text-brand font-mono text-[12px] shrink-0">{c.cmd}</code>
              <span className="text-[12px] text-ink-tertiary text-right">{c.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Platforms ── */}
      <section className="flex flex-col items-center px-6 py-10 max-w-2xl mx-auto w-full gap-6">
        <p className="text-[9px] font-medium text-ink-tertiary uppercase tracking-widest self-start">
          {t.modPage.platforms.title}
        </p>
        <div className="w-full flex flex-col divide-y divide-line">
          {platforms.map(p => (
            <div key={p.label} className="flex items-center justify-between py-3">
              <span className="text-[13px] font-medium">{p.label}</span>
              <span className="text-[11px] font-mono text-ink-tertiary">{p.range}</span>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Callout ── */}
      <section className="flex flex-col items-center px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="w-full rounded-lg border border-brand/20 bg-brand-glow px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-[13px] font-medium">{t.modPage.callout.title}</p>
            <p className="text-[12px] text-ink-secondary mt-0.5">
              {t.modPage.callout.body}
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 h-8 px-4 rounded-lg bg-brand text-brand-dark text-[12px] font-semibold flex items-center gap-1.5 hover:bg-brand-hover transition-colors"
          >
            {t.modPage.callout.open}
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-line-subtle px-6 py-4 flex items-center justify-center mt-auto">
        <span className="text-[11px] text-ink-tertiary">
          MIT License ·{' '}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink-primary transition-colors"
          >
            L31T1NH0
          </a>
        </span>
      </footer>

    </main>
  );
}
