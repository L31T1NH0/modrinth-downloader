'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useLocale, type Translations } from '@/lib/i18n';
import {
  MagnifyingGlassIcon, PlusIcon, CheckIcon, CheckCircleIcon, XMarkIcon,
  ArrowUpTrayIcon, ArrowDownTrayIcon, LinkIcon, ArrowPathIcon,
  ExclamationTriangleIcon, InformationCircleIcon, ArchiveBoxIcon, CubeIcon,
  TrophyIcon, ClipboardIcon, CommandLineIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { TextClamp } from '@/components/TextClamp';
import { Wordmark } from '@/components/Wordmark';
import { CustomSelect } from '@/components/CustomSelect';
import { PillToggle } from '@/components/PillToggle';
import { Skeleton, configureBoneyard } from 'boneyard-js/react';
import { DebugPanel } from '@/components/DebugPanel';
import { captureEvent } from '@/lib/debugCapture';
import { useQueue, type QueueItemStatus } from '@/hooks/useQueue';
import { useRestoreMods } from '@/hooks/useRestoreMods';
import { useFilters } from '@/hooks/useFilters';
import { useSearch, PAGE_SIZE, MIN_QUERY_LENGTH } from '@/hooks/useSearch';
import { useVersionMigration } from '@/hooks/useVersionMigration';
import {
  LOADERS, SHADER_LOADERS, PLUGIN_LOADERS, SORT_OPTIONS, CONTENT_TYPES, CONTENT_TYPE_ICONS,
  LOADER_PRIMARY_COUNT, PLUGIN_LOADER_PRIMARY_COUNT,
} from '@/lib/filterConfig';
import type { ContentType, Source, SortIndex } from '@/lib/modrinth/types';
import {
  buildShareUrl, downloadJSON, readStateFile, buildExportStateMulti, decodeState,
  type ModListState,
} from '@/lib/stateUtils';
import { fmtCount as fmtDownloads } from '@/lib/format';

configureBoneyard({ color: '#1f2d3d', animate: 'pulse' });

function fmtSize(kb: number): string {
  return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
}

function loaderLabel(f: import('@/lib/modrinth/types').Filters): string {
  if (f.contentType === 'mod')
    return LOADERS.find(l => l.id === f.loader)?.label ?? f.loader;
  if (f.contentType === 'shader' && f.shaderLoader)
    return SHADER_LOADERS.find(l => l.id === f.shaderLoader)?.label ?? f.shaderLoader;
  if (f.contentType === 'plugin' && f.pluginLoader)
    return PLUGIN_LOADERS.find(l => l.id === f.pluginLoader)?.label ?? f.pluginLoader;
  return '';
}

function statusLabel(s: QueueItemStatus, t: Translations): string {
  if (s === 'resolving')   return t.status.resolving;
  if (s === 'pending')     return t.status.pending;
  if (s === 'downloading') return t.status.downloading;
  if (s === 'done')        return t.status.done;
  return '';
}

function contentTypeLabel(contentType: ContentType, t: Translations): string {
  return t.filters.contentTypes[contentType];
}

function translateImportError(message: string, t: Translations): string {
  if (message === 'No Modrinth CDN files found in the index.') return t.importErrors.noModrinthCdnFiles;
  if (message === 'Invalid JSON.') return t.importErrors.invalidJson;
  if (message === 'File read failed.') return t.importErrors.fileReadFailed;
  if (message.startsWith('Unsupported format.')) {
    const detail = message.split('Detail: ')[1] ?? t.importErrors.invalidStructure;
    const translatedDetail = detail === 'invalid structure' ? t.importErrors.invalidStructure : detail;
    return `${t.importErrors.unsupportedFormat} ${t.importErrors.detail.replace('{detail}', translatedDetail)}`;
  }
  return message;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-[1.5px] border-line-strong border-t-brand animate-spin shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

function ItemIcon({ url, title }: { url: string | null; title: string }) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return (
      <div className="w-10 h-10 rounded-lg bg-bg-surface border border-line-subtle flex items-center justify-center shrink-0 select-none">
        <CubeIcon className="w-5 h-5 text-ink-tertiary" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      onError={() => setErrored(true)}
      className="w-10 h-10 rounded-lg border border-line-subtle object-cover shrink-0 bg-bg-surface"
    />
  );
}

function QueueStatusDot({ status }: { status: QueueItemStatus }) {
  const base = 'w-2 h-2 rounded-full shrink-0 transition-colors duration-300';
  if (status === 'done')        return <span className={`${base} bg-brand`} />;
  if (status === 'downloading') return <span className={`${base} bg-amber-pulse animate-pulse`} />;
  if (status === 'error')       return <span className={`${base} bg-red-err`} />;
  if (status === 'resolving' || status === 'pending')
    return <span className={`${base} bg-line-strong animate-pulse`} />;
  // ready
  return <span className={`${base} bg-line-strong`} />;
}

// ─── Search result skeleton (boneyard) ───────────────────────────────────────

/** Rendered only during `npx boneyard-js build` so the CLI can capture real bone positions. */
function MockSearchResultCard() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 border-b border-line">
      <div className="w-10 h-10 rounded-lg bg-bg-surface border border-line-subtle shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold leading-tight">Fabric API</div>
        <div className="text-xs text-ink-secondary mt-0.5 leading-snug">
          Core API library for the Fabric toolchain, providing common hooks and interoperability utilities
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-glow text-brand border border-brand/30 font-mono">⬇ 12.5M</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-surface text-ink-secondary border border-line-subtle">library</span>
        </div>
      </div>
      <div className="w-8 h-8 rounded-lg shrink-0 self-center" />
    </div>
  );
}

/** CSS fallback row shown before `npx boneyard-js build` has been run. */
function SkeletonFallbackRow() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 border-b border-line animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-line-subtle shrink-0" />
      <div className="flex-1 min-w-0 py-0.5">
        <div className="h-3 rounded bg-line-subtle w-36" />
        <div className="h-2.5 rounded bg-line-subtle mt-2 w-48" />
        <div className="h-2.5 rounded bg-line-subtle mt-1 w-3/4" />
        <div className="flex gap-1.5 mt-2.5">
          <div className="h-4 w-10 rounded bg-line-subtle" />
          <div className="h-4 w-14 rounded bg-line-subtle" />
        </div>
      </div>
      <div className="w-8 h-8 rounded-lg bg-line-subtle shrink-0 self-center" />
    </div>
  );
}

function SearchResultSkeletons() {
  return (
    <div>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton
          key={i}
          name="search-result-card"
          loading={true}
          fixture={<MockSearchResultCard />}
          fallback={<SkeletonFallbackRow />}
        >{null}</Skeleton>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const t = useLocale();

  const {
    filters, versions, setFilters, lockRestoredVersion,
    showMobileSourceSuggestion,
    setSource, setVersion, setLoader, toggleShaderLoader, togglePluginLoader,
    setContentType, setSortIndex, toggleClientSide, toggleServerSide,
    dismissMobileSourceSuggestion, acceptMobileSourceSuggestion,
  } = useFilters();

  const queue  = useQueue();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const renderedQueueEntries = hasHydrated ? queue.entries : [];
  const renderedConflictWarnings = hasHydrated ? queue.conflictWarnings : [];
  const renderedReadyCount = hasHydrated ? queue.readyCount : 0;
  const queueEntryCount = renderedQueueEntries.length;

  const queueVersions = [...new Set(
    renderedQueueEntries.map(e => e.filters.version).filter(Boolean),
  )];
  const hasMultipleVersions = queueVersions.length > 1;
  const canExportMrpack = renderedQueueEntries.some(
    e => e.filters.source === 'modrinth' &&
      (e.status === 'ready' || e.status === 'done') &&
      !!e.resolved?.file.hashes,
  );

  const [primaryFiltersOpen, setPrimaryFiltersOpen] = useState(true);
  const [contentTypeOpen,    setContentTypeOpen]    = useState(true);
  const [filtersOpen,        setFiltersOpen]        = useState(false);
  const [separateByVersion,  setSeparateByVersion]  = useState<boolean | null>(null); // null = not decided

  const search = useSearch(filters, versions);
  const { isRestoring, failedCount, processedCount, totalCount, restoreMods } = useRestoreMods(queue, setFilters);
  const { migration, check, confirm: confirmMigration, dismiss: dismissMigration } =
    useVersionMigration(filters, queue, restoreMods);

  const sourceOptions = [
    { value: 'modrinth',           label: t.filters.sources.modrinth,   icon: '/Modrinth_icon_light.webp' },
    { value: 'curseforge',         label: t.filters.sources.curseforge, icon: '/curseforge.svg' },
    { value: 'curseforge-bedrock', label: t.filters.sources.bedrock,    icon: '/bedrock.webp' },
  ] as const;

  const contentTypes     = CONTENT_TYPES.map(ct => ({ ...ct, label: contentTypeLabel(ct.id, t) }));
  const currentTypeInfo  = CONTENT_TYPES.find(ct => ct.id === filters.contentType)!;
  const currentTypeLabel = contentTypeLabel(filters.contentType, t);
  const canUseMinecraftShare = filters.source === 'modrinth';
  const canUseMrpack = filters.source === 'modrinth' && canExportMrpack;

  // ── Restore (import / share URL) ─────────────────────────────────────────
  const [pendingRestore, setPendingRestore] = useState<ModListState | null>(null);
  const [importError,    setImportError]    = useState<string | null>(null);
  const [copyFeedback,   setCopyFeedback]   = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Mobile panel ─────────────────────────────────────────────────────────
  const [mobilePanel, setMobilePanel] = useState<'search' | 'queue'>('search');

  // ── Snackbar ──────────────────────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Added-to-queue snackbar (mobile) ─────────────────────────────────────
  const [addedSnackbar, setAddedSnackbar] = useState(false);
  const addedSnackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());
  const justAddedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Minecraft code share ──────────────────────────────────────────────────
  const [mcCode,         setMcCode]         = useState<string | null>(null);
  const [mcCodeCopied,   setMcCodeCopied]   = useState(false);
  const [mcCodeLoading,  setMcCodeLoading]  = useState(false);
  const mcCodeCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Archive format ────────────────────────────────────────────────────────
  const [archiveFormat, setArchiveFormat] = useState<'zip' | 'tar.gz' | 'mrpack'>('zip');

  useEffect(() => {
    try { localStorage.setItem('modrinth-dl:archiveFormat', archiveFormat); } catch { /* ignore */ }
  }, [archiveFormat]);

  useEffect(() => {
    try {
      const savedFormat = localStorage.getItem('modrinth-dl:archiveFormat');
      if (savedFormat === 'zip' || savedFormat === 'tar.gz' || savedFormat === 'mrpack') setArchiveFormat(savedFormat);
    } catch { /* ignore */ }
   
  }, []);

  useEffect(() => {
    if (archiveFormat === 'mrpack' && !canUseMrpack) setArchiveFormat('zip');
  }, [archiveFormat, canUseMrpack]);

  // ── Snackbar: warn when Modrinth + datapack is selected ──────────────────
  useEffect(() => {
    if (filters.source === 'modrinth' && filters.contentType === 'datapack') {
      if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
      setSnackbar(t.snackbar.datapacks);
      snackbarTimerRef.current = setTimeout(() => setSnackbar(null), 6000);
    }
  }, [filters.source, filters.contentType, t.snackbar.datapacks]);

  // ── URL share detection (two-phase: mount → after versions load) ──────────
  useEffect(() => {
    const data = new URLSearchParams(window.location.search).get('data');
    if (!data) return;
    const state = decodeState(data);
    if (!state) return;
    setPendingRestore(state);
    window.history.replaceState({}, '', window.location.pathname);
   
  }, []);

  useEffect(() => {
    if (!versions.length || !pendingRestore) return;
    lockRestoredVersion(pendingRestore.version);
    restoreMods(pendingRestore);
    setPendingRestore(null);
  }, [versions, pendingRestore, restoreMods, lockRestoredVersion]);

  // ── Export / Import / Share ───────────────────────────────────────────────

  const getExportState = useCallback(() => {
    // Group entries by the contentType they had when added to the queue.
    // This ensures mods go to mods/, resourcepacks to resourcepacks/, etc.
    const groupMap = new Map<string, {
      contentType: ContentType;
      ids: string[];
      loader: typeof filters.loader;
      shaderLoader: typeof filters.shaderLoader;
      pluginLoader: typeof filters.pluginLoader;
    }>();

    for (const entry of queue.entries) {
      const ct = entry.filters.contentType;
      const variant = ct === 'mod'
        ? entry.filters.loader
        : ct === 'shader'
          ? (entry.filters.shaderLoader ?? 'iris')
          : ct === 'plugin'
            ? (entry.filters.pluginLoader ?? 'paper')
            : 'default';
      const key = `${ct}::${variant}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          contentType:  ct,
          ids: [],
          loader:       entry.filters.loader,
          shaderLoader: entry.filters.shaderLoader,
          pluginLoader: entry.filters.pluginLoader,
        });
      }
      groupMap.get(key)!.ids.push(entry.id);
    }

    const groups = Array.from(groupMap.values()).map(g => ({
      contentType:   g.contentType,
      loader:        g.loader,
      shaderLoader:  g.shaderLoader ?? undefined,
      pluginLoader:  g.pluginLoader ?? undefined,
      mods:          g.ids,
    }));

    return buildExportStateMulti(
      filters.version,
      filters.source,
      groups.length > 0 ? groups : [{
        contentType:  filters.contentType,
        loader:       filters.loader,
        shaderLoader: filters.shaderLoader ?? undefined,
        pluginLoader: filters.pluginLoader ?? undefined,
        mods:         [],
      }],
    );
  }, [filters, queue.entries]);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const state = await readStateFile(file);
      setImportError(null);
      lockRestoredVersion(state.version);
      await restoreMods(state);
    } catch (err) {
      setImportError(translateImportError((err as Error).message, t));
    }
  }, [restoreMods, lockRestoredVersion, t]);

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(getExportState());
    if (!url) { setImportError(t.snackbar.listTooLarge); return; }
    setImportError(null);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      prompt(t.footer.copySharePrompt, url);
      return;
    }
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, [getExportState, t]);

  const handleMinecraftShare = useCallback(async () => {
    if (!canUseMinecraftShare) return;
    setMcCodeLoading(true);
    setMcCode(null);
    try {
      const res = await fetch('/api/codes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ state: getExportState() }),
      });
      if (!res.ok) throw new Error('failed');
      const { code } = await res.json() as { code: string };
      setMcCode(code);
    } catch {
      setImportError(t.minecraft.error);
    } finally {
      setMcCodeLoading(false);
    }
  }, [canUseMinecraftShare, getExportState, t]);

  useEffect(() => {
    if (!canUseMinecraftShare) {
      setMcCode(null);
      setMcCodeCopied(false);
    }
  }, [canUseMinecraftShare]);

  const handleMcCodeCopy = useCallback(async (code: string) => {
    const cmd = t.minecraft.command.replace('{code}', code);
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      prompt(cmd);
      return;
    }
    setMcCodeCopied(true);
    if (mcCodeCopyTimer.current) clearTimeout(mcCodeCopyTimer.current);
    mcCodeCopyTimer.current = setTimeout(() => setMcCodeCopied(false), 2000);
  }, [t]);

  const handleDownload = useCallback(() => {
    if (archiveFormat === 'mrpack' && !canUseMrpack) return;
    captureEvent({ type: 'queue_download', ts: Date.now(), itemCount: queue.readyCount, format: archiveFormat });
    if (archiveFormat === 'mrpack') {
      void queue.exportMrpack();
      return;
    }
    void queue.downloadZip(archiveFormat, separateByVersion ?? false);
  }, [archiveFormat, canUseMrpack, queue, separateByVersion]);

  const inQueue = (id: string) => renderedQueueEntries.some(e => e.id === id);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-bg-base text-ink-primary overflow-hidden select-none" style={{ height: '100dvh' }}>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar (desktop only) ──────────────────────────────────────── */}
        <aside className="hidden md:flex w-[196px] flex-shrink-0 flex-col bg-bg-base border-r border-line-subtle overflow-hidden">

          {/* Logo */}
          <Link href="/" className="flex items-center px-3.5 border-b border-line-subtle shrink-0 h-12">
            <Wordmark />
          </Link>

          {/* Source/version/loader */}
          <div className="border-b border-line-subtle shrink-0">
            <button
              onClick={() => setPrimaryFiltersOpen(v => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-[9px] font-medium text-ink-tertiary uppercase tracking-widest hover:text-ink-secondary transition-colors"
            >
              <span>{t.filters.filters}</span>
              <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${primaryFiltersOpen ? 'rotate-180' : ''}`} />
            </button>

            {primaryFiltersOpen && (
              <div className="pb-2">
                <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-1 pb-1.5">{t.filters.source}</p>
                <div className="px-3.5">
                  <CustomSelect
                    value={filters.source}
                    onChange={v => setSource(v as Source)}
                    options={[...sourceOptions]}
                    width="w-full"
                  />
                </div>

                <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">{t.filters.version}</p>
                <div className="px-3.5">
                  <CustomSelect
                    value={filters.version}
                    onChange={setVersion}
                    options={versions.length ? versions.map(v => ({ value: v, label: v })) : [{ value: '', label: '...' }]}
                    width="w-full"
                  />
                </div>

                {currentTypeInfo.usesLoader && (
                  <>
                    <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">{t.filters.loader}</p>
                    <div className="px-3.5">
                      <PillToggle options={LOADERS} active={filters.loader} onToggle={setLoader} primaryCount={LOADER_PRIMARY_COUNT} />
                    </div>
                  </>
                )}
                {filters.contentType === 'shader' && (
                  <>
                    <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">{t.filters.renderer}</p>
                    <div className="px-3.5">
                      <PillToggle options={SHADER_LOADERS} active={filters.shaderLoader} onToggle={toggleShaderLoader} />
                    </div>
                  </>
                )}
                {filters.contentType === 'plugin' && filters.source === 'modrinth' && (
                  <>
                    <p className="text-mono text-[9px] font-medium text-ink-tertiary uppercase tracking-widest px-3.5 pt-2.5 pb-1.5">{t.filters.platform}</p>
                    <div className="px-3.5">
                      <PillToggle options={PLUGIN_LOADERS} active={filters.pluginLoader} onToggle={togglePluginLoader} primaryCount={PLUGIN_LOADER_PRIMARY_COUNT} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Content type nav */}
          <div className="border-b border-line-subtle shrink-0">
            <button
              onClick={() => setContentTypeOpen(v => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-[9px] font-medium text-ink-tertiary uppercase tracking-widest hover:text-ink-secondary transition-colors"
            >
              <span>{t.filters.contentType}</span>
              <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${contentTypeOpen ? 'rotate-180' : ''}`} />
            </button>

            {contentTypeOpen && (
              <div className="py-1 overflow-y-auto">
                {contentTypes.filter(ct => ct.sources.includes(filters.source)).map(ct => {
                  const Icon = CONTENT_TYPE_ICONS[ct.id];
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setContentType(ct.id)}
                      className={[
                        'flex items-center gap-2 w-[calc(100%-12px)] mx-1.5 px-3 py-1.5 mb-px rounded text-[12.5px] font-medium transition-all duration-100 border',
                        filters.contentType === ct.id
                          ? 'bg-brand-glow text-ink-primary border-brand/30'
                          : 'text-ink-secondary hover:text-ink-primary hover:bg-bg-hover border-transparent',
                      ].join(' ')}
                    >
                      {Icon && <Icon className="w-3 h-3 shrink-0" />}
                      {ct.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Collapsible extra filters (sort, client/server) */}
          <div className="border-t border-line-subtle shrink-0">
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-[9px] font-medium text-ink-tertiary uppercase tracking-widest hover:text-ink-secondary transition-colors"
            >
              <span>{t.filters.sort}</span>
              <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>

            {filtersOpen && (
              <div className="pb-2">
                <div className="px-3.5 pt-1">
                  <CustomSelect
                    value={filters.sortIndex}
                    onChange={v => setSortIndex(v as import('@/lib/modrinth/types').SortIndex)}
                    options={SORT_OPTIONS.map(s => ({ value: s.id, label: t.filters.sortOptions[s.id] }))}
                    width="w-full"
                  />
                </div>
                
                {filters.source === 'modrinth' && filters.contentType === 'mod' && (
                  <>
                    <div className="px-3.5 pt-2.5 flex gap-1.5">
                      <button
                        onClick={toggleClientSide}
                        className={[
                          'h-7 px-3 rounded-md text-[11px] transition-all duration-150 font-medium',
                          filters.clientSide
                            ? 'bg-brand-glow border border-brand text-brand'
                            : 'bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover',
                        ].join(' ')}
                      >
                        {t.filters.clientSide}
                      </button>
                      <button
                        onClick={toggleServerSide}
                        className={[
                          'h-7 px-3 rounded-md text-[11px] transition-all duration-150 font-medium',
                          filters.serverSide
                            ? 'bg-brand-glow border border-brand text-brand'
                            : 'bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover',
                        ].join(' ')}
                      >
                        {t.filters.serverSide}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom links */}
          <div className="px-1.5 py-2 border-t border-line-subtle shrink-0">
            <a
              href="/rankings"
              className="flex items-center gap-2 px-3 py-1.5 rounded text-[12.5px] font-medium transition-all duration-100 border text-ink-secondary hover:text-ink-primary hover:bg-bg-hover border-transparent"
            >
              <TrophyIcon className="w-3 h-3 shrink-0" />
              Rankings
            </a>
            <a
              href="/install"
              className="flex items-center gap-2 px-3 py-1.5 rounded text-[12.5px] font-medium transition-all duration-100 border text-ink-secondary hover:text-ink-primary hover:bg-bg-hover border-transparent"
            >
              <CommandLineIcon className="w-3 h-3 shrink-0" />
              {t.nav.installMod}
              <span className="text-[9px] font-bold uppercase px-1 py-px rounded bg-brand text-brand-dark leading-none">New</span>
            </a>
          </div>
        </aside>

        {/* ── Center panel (search + results) ─────────────────────────────── */}
        <div className={`${mobilePanel === 'queue' ? 'hidden' : 'flex'} md:flex flex-1 flex-col overflow-hidden min-w-0`}>

          {/* Mobile header: logo + content tabs + filters */}
          <div className="md:hidden border-b border-line-subtle shrink-0">
            <div className="flex items-center gap-5 px-5 py-2 overflow-x-auto scrollbar-none">
              <div className="flex items-center shrink-0">
                <Wordmark />
              </div>
              {contentTypes.filter(ct => ct.sources.includes(filters.source)).map(ct => (
                <button
                  key={ct.id}
                  onClick={() => setContentType(ct.id)}
                  className={[
                    'py-2 text-xs font-medium border-b-2 transition-all duration-150 -mb-px whitespace-nowrap',
                    filters.contentType === ct.id
                      ? 'border-brand text-ink-primary'
                      : 'border-transparent text-ink-secondary hover:text-ink-primary',
                  ].join(' ')}
                >
                  {ct.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-3 shrink-0">
                <a
                  href="/install"
                  className="flex items-center gap-1 text-[11px] text-ink-secondary hover:text-ink-primary transition-colors whitespace-nowrap"
                >
                  {t.nav.installMod}
                  <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-brand text-brand-dark leading-none">New</span>
                </a>
                <a
                  href="/rankings"
                  className="text-[11px] text-ink-secondary hover:text-ink-primary transition-colors whitespace-nowrap"
                >
                  {t.rankings.title}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-2 flex-wrap">
              <CustomSelect
                value={filters.source}
                onChange={v => setSource(v as Source)}
                options={[...sourceOptions]}
                width="w-32"
              />
              <CustomSelect
                value={filters.version}
                onChange={setVersion}
                options={versions.length ? versions.map(v => ({ value: v, label: v })) : [{ value: '', label: '...' }]}
                width="w-28"
              />
              {currentTypeInfo.usesLoader && (
                <PillToggle options={LOADERS} active={filters.loader} onToggle={setLoader} primaryCount={LOADER_PRIMARY_COUNT} />
              )}
              {filters.contentType === 'shader' && (
                <PillToggle options={SHADER_LOADERS} active={filters.shaderLoader} onToggle={toggleShaderLoader} />
              )}
              {filters.contentType === 'plugin' && filters.source === 'modrinth' && (
                <PillToggle options={PLUGIN_LOADERS} active={filters.pluginLoader} onToggle={togglePluginLoader} primaryCount={PLUGIN_LOADER_PRIMARY_COUNT} />
              )}
              <CustomSelect
                value={filters.sortIndex}
                onChange={v => setSortIndex(v as import('@/lib/modrinth/types').SortIndex)}
                options={SORT_OPTIONS.map(s => ({ value: s.id, label: t.filters.sortOptions[s.id] }))}
                width="w-28"
              />
              {filters.source === 'modrinth' && filters.contentType === 'mod' && (
                <>
                  <button
                    onClick={toggleClientSide}
                    className={[
                      'h-7 px-3 rounded-md text-[11px] transition-all duration-150 font-medium',
                      filters.clientSide
                        ? 'bg-brand-glow border border-brand text-brand'
                        : 'bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover',
                    ].join(' ')}
                  >
                    {t.filters.clientSide}
                  </button>
                  <button
                    onClick={toggleServerSide}
                    className={[
                      'h-7 px-3 rounded-md text-[11px] transition-all duration-150 font-medium',
                      filters.serverSide
                        ? 'bg-brand-glow border border-brand text-brand'
                        : 'bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover',
                    ].join(' ')}
                  >
                    {t.filters.serverSide}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-line-subtle shrink-0 bg-bg-base flex-wrap">
            <div className="flex gap-1 flex-1 min-w-0 max-w-sm">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-secondary" />
                <input
                  type="text"
                  value={search.searchQuery}
                  onChange={search.handleQueryChange}
                  onKeyDown={search.handleKeyDown}
                  placeholder={t.search.placeholder}
                  className="w-full h-7 pl-8 pr-2 rounded text-ink-primary text-xs placeholder:text-ink-tertiary transition-colors focus:ring-2 focus:ring-brand focus:outline-none bg-bg-surface"
                />
                {search.searchQuery && (
                  <button
                    onClick={search.clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                    title={t.search.clearTitle}
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={search.triggerSearch}
                disabled={search.isSearching || (!!search.searchQuery.trim() && search.searchQuery.trim().length < MIN_QUERY_LENGTH)}
                className="h-7 w-7 rounded-md bg-brand border border-brand text-brand-dark flex items-center justify-center shrink-0 transition-all hover:bg-brand-hover active:scale-95 disabled:opacity-50"
              >
                {search.isSearching
                  ? <Spinner size={11} />
                  : <MagnifyingGlassIcon className="w-[11px] h-[11px]" />
                }
              </button>
            </div>

            {showMobileSourceSuggestion && (
              <div className="w-full md:hidden rounded-md border border-brand/30 bg-brand-glow px-3 py-2 text-xs text-ink-secondary flex items-center justify-between gap-2">
                <span>{t.mobileSuggestion.text}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={dismissMobileSourceSuggestion} className="text-ink-secondary hover:text-ink-primary transition-colors">
                    {t.mobileSuggestion.keep}
                  </button>
                  <button onClick={acceptMobileSourceSuggestion} className="h-6 px-2 rounded bg-brand border border-brand text-brand-dark hover:bg-brand-hover transition-colors">
                    {t.mobileSuggestion.switch}
                  </button>
                </div>
              </div>
            )}

            {!!search.searchQuery.trim() && search.searchQuery.trim().length < MIN_QUERY_LENGTH && (
              <div className="w-full text-[10px] text-ink-tertiary">
                {t.search.minLength.replace('{n}', String(MIN_QUERY_LENGTH))}
              </div>
            )}
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto relative" style={{ viewTransitionName: 'results-list' }}>

            {search.fallbackVersion && !search.isSearching && (
              <div className="px-4 py-2 bg-brand-glow border-b border-brand/30 text-brand text-xs flex items-center gap-2">
                <InformationCircleIcon className="w-4 h-4 shrink-0" />
                <span>{t.fallback.banner
                  .replace('{type}', currentTypeLabel.toLowerCase())
                  .replace('{version}', filters.version)
                  .replace('{fallback}', search.fallbackVersion ?? '')
                }</span>
              </div>
            )}

            {search.isSearching && search.results.length === 0 && <SearchResultSkeletons />}

            {!search.isSearching && search.hasError && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs">
                <ExclamationTriangleIcon className="w-8 h-8 text-ink-primary" />
                {t.search.error}
              </div>
            )}

            {!search.isSearching && !search.hasError && search.results.length === 0 && filters.version && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs text-center">
                <MagnifyingGlassIcon className="w-8 h-8 text-ink-secondary opacity-50" />
                <span>
                  {t.search.noResultsFor}{' '}
                  <strong className="text-ink-primary">
                    {search.searchQuery || currentTypeLabel}
                  </strong>
                  {search.searchQuery && (
                    <><br />{t.search.withVersion} {filters.version}</>
                  )}
                </span>
                {search.searchDebugMeta && (
                  <div className="mt-2 rounded-md border border-line-subtle bg-bg-surface px-2 py-1 text-[10px] text-ink-tertiary">
                    debug: strategy={search.searchDebugMeta.strategy}, termFallbacks={search.searchDebugMeta.termSimplificationAttempts}, versionFallbacks={search.searchDebugMeta.versionFallbackAttempts}
                  </div>
                )}
              </div>
            )}

            {search.results.length > 0 && (
              <div>
                {search.results.map((item, i) => {
                  const isNew      = i >= search.offset - PAGE_SIZE && !search.animatedIds.current.has(item.project_id);
                  const queued     = inQueue(item.project_id);
                  const qEntry     = queue.entries.find(e => e.id === item.project_id);
                  const isActive   = qEntry?.status === 'pending' || qEntry?.status === 'resolving';
                  const justAdded  = justAddedIds.has(item.project_id);

                  if (isNew) search.animatedIds.current.add(item.project_id);

                  return (
                    <div
                      key={item.project_id}
                      className={`flex items-start gap-3 px-4 py-3.5 border-b border-line hover:bg-bg-surface/60 transition-all duration-150 cursor-default${isNew ? ' animate-fadeIn' : ''}`}
                      style={isNew ? { animationDelay: `${(i % PAGE_SIZE) * 20}ms` } : undefined}
                    >
                      <ItemIcon url={item.icon_url} title={item.title} />
                      <div className="flex-1 min-w-0">
                        {item.page_url ? (
                          <TextClamp
                            as="a"
                            text={item.title}
                            font="600 13px Outfit"
                            lineHeightPx={17}
                            maxLines={2}
                            href={item.page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] font-semibold leading-tight hover:underline hover:text-brand transition-colors"
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <TextClamp
                            text={item.title}
                            font="600 13px Outfit"
                            lineHeightPx={17}
                            maxLines={2}
                            className="text-[13px] font-semibold leading-tight"
                          />
                        )}
                        <TextClamp
                          text={item.description}
                          font="400 12px Outfit"
                          lineHeightPx={17}
                          maxLines={2}
                          className="text-xs text-ink-secondary mt-0.5 leading-snug"
                        />
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-glow text-brand border border-brand/30 font-mono">
                            ⬇ {fmtDownloads(item.downloads)}
                          </span>
                          {(item.categories ?? []).slice(0, 2).map(c => (
                            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-surface text-ink-secondary border border-line-subtle">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        disabled={isActive}
                        onClick={() => {
                          if (queued && qEntry) {
                            queue.remove(qEntry.queueKey);
                          } else {
                            queue.add(item.project_id, item.title, item.icon_url, filters);
                            captureEvent({ type: 'queue_add', ts: Date.now(), id: item.project_id, title: item.title, source: filters.source, contentType: filters.contentType });
                            if (addedSnackbarTimerRef.current) clearTimeout(addedSnackbarTimerRef.current);
                            setAddedSnackbar(true);
                            addedSnackbarTimerRef.current = setTimeout(() => setAddedSnackbar(false), 2000);
                            setJustAddedIds(prev => new Set(prev).add(item.project_id));
                            const existing = justAddedTimersRef.current.get(item.project_id);
                            if (existing) clearTimeout(existing);
                            justAddedTimersRef.current.set(item.project_id, setTimeout(() => {
                              setJustAddedIds(prev => { const s = new Set(prev); s.delete(item.project_id); return s; });
                              justAddedTimersRef.current.delete(item.project_id);
                            }, 800));
                          }
                        }}
                        className={[
                          'no-ring w-8 h-8 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all duration-150 leading-none self-center',
                          isActive
                            ? 'bg-bg-card text-ink-tertiary cursor-wait'
                            : queued && !justAdded
                            ? 'bg-brand-glow text-brand hover:bg-red-500/10 hover:text-red-400 active:scale-95'
                            : queued
                            ? 'bg-brand-glow text-brand cursor-default'
                            : 'bg-bg-card text-ink-secondary hover:text-brand hover:bg-brand-glow active:scale-95',
                        ].join(' ')}
                        title={queued ? t.queue.removeTitle : t.queue.addToQueue}
                      >
                        {isActive
                          ? <Spinner size={12} />
                          : queued
                          ? <CheckIcon className="w-3 h-3" />
                          : <PlusIcon className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  );
                })}

                {(search.hasMore || search.isLoadingMore) && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={search.loadMore}
                      disabled={search.isLoadingMore}
                      className="h-8 px-5 rounded-lg bg-bg-surface text-ink-secondary text-xs font-medium flex items-center gap-2 transition-all hover:text-ink-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {search.isLoadingMore ? <><Spinner size={11} /> {t.search.loading}</> : t.search.loadMore}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="hidden md:block w-px bg-line-subtle self-stretch shrink-0" />

        {/* ── Queue panel ─────────────────────────────────────────────────── */}
        <div className={`${mobilePanel === 'search' ? 'hidden' : 'flex'} md:flex w-full md:w-[290px] flex-col shrink-0`}>

          {/* Queue header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">{t.queue.title}</span>
              <span className="min-w-[20px] h-5 px-1.5 bg-brand text-brand-dark text-[10px] font-bold rounded-full flex items-center justify-center font-mono">
                {queueEntryCount}
              </span>
            </div>
            {queueEntryCount > 0 && !queue.isDownloading && (
              <button
                onClick={queue.clear}
                className="text-[11px] text-ink-tertiary hover:text-ink-secondary transition-colors px-2 py-1 rounded hover:bg-bg-hover"
              >
                {t.queue.clear}
              </button>
            )}
          </div>

          {/* Queue items */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Version migration banner ────────────────────────────────── */}
            {migration && (
              <div className="mx-3 mt-3 mb-1 rounded-lg border border-line animate-slideIn overflow-hidden">
                {migration.phase === 'prompt' && (
                  <div className="px-3 py-2.5 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-[10px] text-ink-secondary leading-relaxed">
                        {t.migration.prompt
                          .replace('{n}',    String(migration.modIds.length))
                          .replace('{from}', migration.sourceVersion)}
                      </p>
                      <button
                        onClick={dismissMigration}
                        className="text-ink-muted hover:text-ink-primary transition-colors shrink-0 mt-px"
                        title={t.migration.dismiss}
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => void check()}
                      className="w-full h-7 rounded-md bg-bg-hover text-ink-primary text-[10px] font-medium flex items-center justify-center gap-1.5 transition-all hover:bg-line-subtle"
                    >
                      <ArrowPathIcon className="w-3 h-3 text-brand" />
                      {t.migration.check.replace('{to}', filters.version)}
                    </button>
                  </div>
                )}

                {migration.phase === 'checking' && (
                  <div className="flex items-center gap-2 px-3 py-3 text-ink-secondary">
                    <Spinner size={11} />
                    <span className="text-[10px]">
                      {t.migration.checking
                        .replace('{n}',  String(migration.modIds.length))
                        .replace('{to}', filters.version)}
                    </span>
                  </div>
                )}

                {migration.phase === 'result' && (
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-1.5 mb-2.5">
                      {migration.incompatible === 0
                        ? <CheckCircleIcon className="w-3.5 h-3.5 text-brand shrink-0 mt-px" />
                        : <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
                      }
                      <p className="text-[10px] text-ink-secondary leading-snug">
                        <span className="text-ink-primary font-medium">
                          {t.migration.compatible.replace('{ok}', String(migration.compatible))}
                        </span>
                        {' · '}
                        <span className={migration.incompatible > 0 ? 'text-amber-400 font-medium' : 'text-ink-tertiary'}>
                          {t.migration.incompatible
                            .replace('{fail}', String(migration.incompatible))
                            .replace('{to}',   filters.version)}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => void confirmMigration()}
                        disabled={isRestoring}
                        className="flex-1 h-7 rounded-md bg-brand text-brand-dark text-[10px] font-semibold flex items-center justify-center gap-1 transition-all hover:bg-brand-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isRestoring
                          ? <Spinner size={10} />
                          : <><ArrowPathIcon className="w-3 h-3" />{t.migration.migrate}</>
                        }
                      </button>
                      <button
                        onClick={dismissMigration}
                        className="flex-1 h-7 rounded-md bg-bg-hover text-ink-secondary text-[10px] font-medium flex items-center justify-center transition-colors hover:text-ink-primary hover:bg-line-subtle"
                      >
                        {t.migration.dismiss}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {queueEntryCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-tertiary">
                <ArchiveBoxIcon className="w-8 h-8 text-ink-secondary opacity-40" />
                <span className="text-xs text-center leading-relaxed">
                  {t.queue.empty}<br />{t.queue.emptyHint}
                </span>
              </div>
            ) : (
              renderedQueueEntries.map((entry, i) => {
                const lbl         = loaderLabel(entry.filters);
                const isTransient = entry.status === 'pending' || entry.status === 'resolving';
                const isError     = entry.status === 'error';
                const slbl        = statusLabel(entry.status, t);
                const conflicts   = renderedConflictWarnings.filter(
                  w => w.queueKeyA === entry.queueKey || w.queueKeyB === entry.queueKey,
                );
                return (
                  <div
                    key={entry.queueKey}
                    className="flex items-center gap-2.5 px-4 py-3 border-b border-line hover:bg-bg-hover transition-all duration-150 animate-slideIn"
                    style={{ animationDelay: `${i * 15}ms` }}
                  >
                    <QueueStatusDot status={entry.status} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TextClamp
                          as="span"
                          text={entry.title}
                          font="500 12px Outfit"
                          lineHeightPx={18}
                          maxLines={2}
                          className="text-[12px] font-medium"
                        />
                        {entry.isDependency && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-line-subtle text-ink-tertiary border border-line shrink-0">
                            {t.queue.dep}
                          </span>
                        )}
                        {entry.license && (entry.license.id === 'arr' || entry.license.id === 'custom') && (
                          entry.license.url
                            ? (
                              <a
                                href={entry.license.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 shrink-0 hover:bg-red-500/20 transition-colors"
                                title={entry.license.name}
                              >
                                {t.queue.restrictedLicense}
                              </a>
                            ) : (
                              <span
                                className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 shrink-0"
                                title={entry.license.name}
                              >
                                {t.queue.restrictedLicense}
                              </span>
                            )
                        )}
                      </div>

                      {isTransient && (
                        <div className="text-[10px] text-ink-tertiary mt-0.5">{slbl}</div>
                      )}
                      {isError && (
                        <div className="text-[10px] text-red-err mt-0.5">
                          {entry.errorReason === 'no_compatible_version'
                            ? t.errors.noCompatibleVersion
                            : entry.errorReason === 'distribution_restricted'
                            ? t.errors.distributionRestricted
                            : entry.errorReason === 'threshold_exceeded'
                            ? t.errors.batchLimitExceeded
                            : t.errors.networkError}
                        </div>
                      )}
                      {entry.resolved && !isTransient && (
                        <div className="text-[10px] font-mono text-ink-tertiary mt-0.5 truncate">
                          {entry.resolved.versionNumber}
                          {entry.resolved.sizeKb ? ` · ${fmtSize(entry.resolved.sizeKb)}` : ''}
                          {lbl ? ` · ${lbl}` : ''}
                        </div>
                      )}

                      {conflicts.map(w => {
                        const otherTitle = w.queueKeyA === entry.queueKey ? w.titleB : w.titleA;
                        return (
                          <div key={w.queueKeyA + w.queueKeyB} className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                            <ExclamationTriangleIcon className="w-3 h-3 shrink-0" />
                            {t.queue.conflictWith.replace('{title}', otherTitle)}
                          </div>
                        );
                      })}

                      {entry.status === 'downloading' && entry.progress > 0 && (
                        <div className="mt-1 h-0.5 bg-line-subtle rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand transition-all duration-200"
                            style={{ width: `${entry.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {!queue.isDownloading && (
                      <div className="flex items-center gap-1 shrink-0">
                        {isError && (
                          <button
                            onClick={() => queue.retry(entry.queueKey)}
                            className="text-ink-secondary hover:text-brand w-5 h-5 flex items-center justify-center rounded hover:bg-bg-hover transition-colors"
                            title={t.queue.retryTitle}
                          >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => queue.remove(entry.queueKey)}
                          className="text-ink-tertiary hover:text-ink-primary w-5 h-5 flex items-center justify-center rounded hover:bg-bg-hover transition-colors"
                          title={t.queue.removeTitle}
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Download footer */}
          <div className="px-4 py-3.5 border-t border-line-subtle shrink-0">

            <input
              ref={importInputRef}
              type="file"
              accept=".json,.mrpack,application/json,application/zip"
              className="hidden"
              onChange={handleImportFile}
            />

            {/* Export / Import / Share row */}
            <div className="flex gap-2 mb-2.5">
              <button
                onClick={() => downloadJSON(getExportState())}
                disabled={isRestoring}
                className="flex-1 h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title={t.footer.exportTitle}
              >
                <ArrowUpTrayIcon className="w-[11px] h-[11px]" />
                {t.footer.export}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={isRestoring}
                className="flex-1 h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title={t.footer.importTitle}
              >
                {isRestoring ? (
                  <><Spinner size={11} /> {processedCount}/{totalCount}</>
                ) : (
                  <>
                    <ArrowDownTrayIcon className="w-[11px] h-[11px]" />
                    {t.footer.import}
                  </>
                )}
              </button>
              <button
                onClick={handleShare}
                disabled={isRestoring}
                className="flex-1 h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title={t.footer.shareTitle}
              >
                <LinkIcon className="w-[11px] h-[11px]" />
                {copyFeedback ? t.footer.copied : t.footer.share}
              </button>
            </div>

            {canUseMinecraftShare && (
              <button
                onClick={handleMinecraftShare}
                disabled={hasHydrated ? (isRestoring || mcCodeLoading || queueEntryCount === 0) : undefined}
                className="w-full h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 mb-2.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title={t.minecraft.shareTitle}
              >
                {mcCodeLoading
                  ? <><Spinner size={11} /> {t.minecraft.generating}</>
                  : <><CubeIcon className="w-[11px] h-[11px]" /> {t.minecraft.share}</>
                }
              </button>
            )}

            {canUseMinecraftShare && mcCode && (
              <div className="mb-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 rounded-lg bg-bg-surface px-3 py-2">
                  <span className="text-[10px] text-ink-tertiary shrink-0">{t.minecraft.prompt}</span>
                  <code className="flex-1 text-[11px] font-mono text-brand truncate">
                    {t.minecraft.command.replace('{code}', mcCode)}
                  </code>
                  <button
                    onClick={() => handleMcCodeCopy(mcCode)}
                    className="shrink-0 text-[10px] text-ink-secondary hover:text-white transition-colors"
                  >
                    {mcCodeCopied ? t.minecraft.copied : <ClipboardIcon className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <a
                    href={`/pack/${mcCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-ink-tertiary hover:text-brand transition-colors"
                  >
                    {t.minecraft.preview} ↗
                  </a>
                  <span className="text-line-strong">·</span>
                  <a
                    href="/install"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-ink-tertiary hover:text-brand transition-colors"
                  >
                    Get the mod ↗
                  </a>
                </div>
              </div>
            )}

            {failedCount !== null && failedCount > 0 && (
              <div className="mb-2 text-[10px] text-amber-400 text-center">
                {(failedCount > 1 ? t.footer.failedModsPlural : t.footer.failedMods).replace('{n}', String(failedCount))}
              </div>
            )}

            {importError && (
              <div className="mb-2 text-[10px] text-red-err text-center">{importError}</div>
            )}

            {renderedConflictWarnings.length > 0 && !queue.isDownloading && (
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-400">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                {(renderedConflictWarnings.length > 1
                  ? t.queue.conflictBannerPlural
                  : t.queue.conflictBanner
                ).replace('{n}', String(renderedConflictWarnings.length))}
              </div>
            )}

            {hasMultipleVersions && separateByVersion === null && !queue.isDownloading && (
              <div className="mb-2 rounded-md border border-line bg-bg-surface p-2.5">
                <p className="text-[10px] text-ink-secondary">
                  {t.queue.multiVersionBanner.replace('{versions}', queueVersions.join(', '))}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => setSeparateByVersion(true)}
                    className="h-7 px-2.5 rounded-md bg-brand-glow border border-brand/30 text-brand text-[10px] font-semibold hover:border-brand transition-colors"
                  >
                    {t.queue.separateFolders}
                  </button>
                  <button
                    onClick={() => setSeparateByVersion(false)}
                    className="h-7 px-2.5 rounded-md bg-bg-base border border-line text-ink-secondary text-[10px] font-semibold hover:text-ink-primary hover:border-line-strong transition-colors"
                  >
                    {t.queue.keepTogether}
                  </button>
                </div>
              </div>
            )}

            {queue.isDownloading ? (
              <button
                disabled
                className="w-full h-10 rounded-lg bg-brand border border-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
              >
                {queue.entries.filter(e => e.status === 'downloading').length === 1
                  ? <><Spinner size={13} /> {t.footer.downloading} {queue.zipProgress}%</>
                  : <><Spinner size={13} /> {t.footer.creatingArchive.replace('{format}', archiveFormat === 'tar.gz' ? '.tar.gz' : 'ZIP')} {queue.zipProgress}%</>
                }
              </button>
            ) : renderedReadyCount > 1 ? (
              <div className="flex w-full h-10 rounded-lg overflow-hidden border border-brand">
                <button
                  onClick={handleDownload}
                  className="flex-1 bg-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover active:scale-[0.98]"
                >
                  <ArrowDownTrayIcon className="w-[13px] h-[13px]" />
                  {t.footer.downloadFiles.replace('{n}', String(renderedReadyCount))}
                </button>
                <button
                  onClick={() => setArchiveFormat(f => {
                    if (f === 'zip') return 'tar.gz';
                    if (f === 'tar.gz') return canUseMrpack ? 'mrpack' : 'zip';
                    return 'zip';
                  })}
                  title={t.footer.toggleFormat}
                  className="px-3 bg-brand text-brand-dark text-[10px] font-mono font-semibold border-l border-black/20 hover:bg-brand-hover transition-colors"
                >
                  .{archiveFormat}
                </button>
              </div>
            ) : (
              <button
                onClick={handleDownload}
                disabled={hasHydrated ? (renderedReadyCount === 0 || (archiveFormat === 'mrpack' && !canUseMrpack)) : undefined}
                className="w-full h-10 rounded-lg bg-brand border border-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover hover:border-brand-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                  <ArrowDownTrayIcon className="w-[13px] h-[13px]" />
                {t.footer.downloadFile}
              </button>
            )}

            {queue.isDownloading && (
              <div className="mt-2 h-1 bg-line-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300 ease-out"
                  style={{ width: `${queue.zipProgress}%` }}
                />
              </div>
            )}

            {!queue.isDownloading && queueEntryCount > 0 && (
              <div className="mt-2 flex gap-3 justify-center text-[10px] font-mono text-ink-tertiary">
                {(() => {
                  const counts = {
                    pending: renderedQueueEntries.filter(e => e.status === 'pending' || e.status === 'resolving').length,
                    ready:   renderedReadyCount,
                    done:    renderedQueueEntries.filter(e => e.status === 'done').length,
                    error:   renderedQueueEntries.filter(e => e.status === 'error').length,
                  };
                  return (
                    <>
                      {counts.pending > 0 && <span className="text-ink-tertiary">{counts.pending} {t.summary.resolving}</span>}
                      {counts.ready   > 0 && <span className="text-brand">{counts.ready} {t.summary.ready}</span>}
                      {counts.done    > 0 && <span className="text-brand">{counts.done} {t.summary.downloaded}</span>}
                      {counts.error   > 0 && <span className="text-red-err">{counts.error} {counts.error > 1 ? t.summary.errors : t.summary.error}</span>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <DebugPanel />

      {/* ── Added-to-queue snackbar ──────────────────────────────────────── */}
      {addedSnackbar && (
        <div className="fixed bottom-16 md:hidden left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-brand/10 border border-brand/30 text-brand text-xs shadow-lg backdrop-blur-sm max-w-sm w-[calc(100%-2rem)]">
          <CheckCircleIcon className="w-4 h-4 shrink-0" />
          <span className="flex-1">{t.snackbar.added}</span>
        </div>
      )}

      {/* ── Snackbar ─────────────────────────────────────────────────────── */}
      {snackbar && (
        <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-amber-950/90 border border-amber-700/60 text-amber-300 text-xs shadow-lg backdrop-blur-sm max-w-sm w-[calc(100%-2rem)]">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="flex-1">{snackbar}</span>
          <button
            onClick={() => setSnackbar(null)}
            className="shrink-0 text-amber-500 hover:text-amber-300 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      <nav className="md:hidden shrink-0 flex border-t border-line-subtle bg-bg-base">
        <button
          onClick={() => setMobilePanel('search')}
          className={`flex-1 py-3.5 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
            mobilePanel === 'search' ? 'text-brand' : 'text-ink-secondary'
          }`}
        >
          <MagnifyingGlassIcon className="w-[15px] h-[15px]" />
          {t.nav.search}
        </button>
        <button
          onClick={() => setMobilePanel('queue')}
          className={`flex-1 py-3.5 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
            mobilePanel === 'queue' ? 'text-brand' : 'text-ink-secondary'
          }`}
        >
          <ArrowDownTrayIcon className="w-[15px] h-[15px]" />
          {t.nav.queue}
          {queueEntryCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 bg-brand text-brand-dark text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
              {queueEntryCount}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}
