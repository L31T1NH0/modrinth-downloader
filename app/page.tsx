'use client';

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  LinkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArchiveBoxIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import { CloudArrowDownIcon } from '@heroicons/react/24/solid';
import * as modrinthService from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import type {
  Filters,
  Loader,
  ShaderLoader,
  PluginLoader,
  ContentType,
  Source,
  SearchResult,
} from '@/lib/modrinth/types';
import { useQueue, type QueueItemStatus } from '@/hooks/useQueue';
import { useRestoreMods } from '@/hooks/useRestoreMods';
import {
  buildShareUrl, downloadJSON, readJSONFile, buildExportState, decodeState,
  type ModListState,
} from '@/lib/stateUtils';
import { CustomSelect } from '@/components/CustomSelect';

const PAGE_SIZE = modrinthService.PAGE_SIZE;

// ─── UI configuration ─────────────────────────────────────────────────────────

const LOADERS: { id: Loader; label: string }[] = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge',  label: 'Forge'  },
];

const SHADER_LOADERS: { id: ShaderLoader; label: string }[] = [
  { id: 'iris',     label: 'Iris'     },
  { id: 'optifine', label: 'OptiFine' },
];

const PLUGIN_LOADERS: { id: PluginLoader; label: string }[] = [
  { id: 'paper',  label: 'Paper'  },
  { id: 'spigot', label: 'Spigot' },
  { id: 'bukkit', label: 'Bukkit' },
];

const CONTENT_TYPES: { id: ContentType; label: string; usesLoader: boolean; sources: Source[] }[] = [
  { id: 'mod',            label: 'Mods',          usesLoader: true,  sources: ['modrinth', 'curseforge']          },
  { id: 'plugin',         label: 'Plugins',       usesLoader: false, sources: ['modrinth']                        },
  { id: 'datapack',       label: 'Datapacks',     usesLoader: false, sources: ['modrinth', 'curseforge']          },
  { id: 'resourcepack',   label: 'Resourcepacks', usesLoader: false, sources: ['modrinth', 'curseforge']          },
  { id: 'shader',         label: 'Shaders',       usesLoader: false, sources: ['modrinth', 'curseforge']          },
  { id: 'addon',          label: 'Addons',        usesLoader: false, sources: ['curseforge-bedrock']              },
  { id: 'map',            label: 'Maps',          usesLoader: false, sources: ['curseforge-bedrock']              },
  { id: 'texture-pack',   label: 'Texture Packs', usesLoader: false, sources: ['curseforge-bedrock']              },
  { id: 'script',         label: 'Scripts',       usesLoader: false, sources: ['curseforge-bedrock']              },
  { id: 'skin',           label: 'Skins',         usesLoader: false, sources: ['curseforge-bedrock']              },
];

/** Content types that belong exclusively to Bedrock. */
const BEDROCK_CONTENT_TYPES = new Set<ContentType>(['addon', 'map', 'texture-pack', 'script', 'skin']);

const DEFAULT_FILTERS: Filters = {
  source:       'modrinth',
  version:      '',
  contentType:  'mod',
  loader:       'fabric',
  shaderLoader: null,
  pluginLoader: null,
};

// ─── Display helpers ──────────────────────────────────────────────────────────

function fmtDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return Math.round(n / 1_000) + 'K';
  return String(n);
}

function fmtSize(kb: number): string {
  return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
}

function loaderLabel(f: Filters): string {
  if (f.contentType === 'mod')
    return LOADERS.find(l => l.id === f.loader)?.label ?? f.loader;
  if (f.contentType === 'shader' && f.shaderLoader)
    return SHADER_LOADERS.find(l => l.id === f.shaderLoader)?.label ?? f.shaderLoader;
  if (f.contentType === 'plugin' && f.pluginLoader)
    return PLUGIN_LOADERS.find(l => l.id === f.pluginLoader)?.label ?? f.pluginLoader;
  return '';
}

/** User-facing label for queue item status. */
function statusLabel(s: QueueItemStatus): string {
  if (s === 'resolving')   return 'Resolving...';
  if (s === 'pending')     return 'Awaiting...';
  if (s === 'downloading') return 'Downloading...';
  if (s === 'done')        return 'Completed';
  return '';
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

// ─── Pill button (shared style for loader toggles) ────────────────────────────

function PillToggle<T extends string>({
  options,
  active,
  onToggle,
}: {
  options:  { id: T; label: string }[];
  active:   T | null;
  onToggle: (id: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onToggle(o.id)}
          className={[
            'h-7 px-3 rounded-md text-[11px] transition-all duration-150 font-medium',
            active === o.id
              ? 'bg-brand-glow border border-brand text-brand'
              : 'bg-bg-surface text-ink-secondary hover:text-ink-primary hover:bg-bg-hover',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {

  // ── MC version list ───────────────────────────────────────────────────────
  const [versions, setVersions] = useState<string[]>([]);

  // ── Active filters ────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError,      setHasError]      = useState(false);
  const [results,       setResults]       = useState<SearchResult[]>([]);
  const [offset,        setOffset]        = useState(0);
  const [hasMore,       setHasMore]       = useState(false);
  const activeRef = useRef<{ query: string; filters: Filters }>({
    query: '', filters: DEFAULT_FILTERS,
  });
  const abortRef  = useRef<AbortController | null>(null);
  const animatedIds = useRef<Set<string>>(new Set());

  // ── Queue ─────────────────────────────────────────────────────────────────
  const queue = useQueue();

  // ── Restore (import / share URL) ─────────────────────────────────────────
  const { isRestoring, failedCount, restoreMods } = useRestoreMods(queue, setFilters);
  const [pendingRestore, setPendingRestore] = useState<ModListState | null>(null);
  const [importError,    setImportError]    = useState<string | null>(null);
  const [copyFeedback,   setCopyFeedback]   = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Holds a version locked by restore; prevents the versions-load effect from
  // overwriting it with releases[0] when it re-fires due to a source change.
  const restoredVersionRef = useRef<string | null>(null);
  // Holds the version to preserve when switching between non-Bedrock sources.
  const preservedVersionRef = useRef<string | null>(null);

  // ── Mobile panel ─────────────────────────────────────────────────────────
  const [mobilePanel, setMobilePanel] = useState<'search' | 'queue'>('search');

  // ── Snackbar ──────────────────────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Archive format ────────────────────────────────────────────────────────
  const [archiveFormat, setArchiveFormat] = useState<'zip' | 'tar.gz'>('zip');

  // ── Fallback version tracking ─────────────────────────────────────────────
  const [fallbackVersion, setFallbackVersion] = useState<string | null>(null);

  // ── Load MC versions (re-fetched when source changes) ────────────────────

  useEffect(() => {
    setVersions([]);
    setFilters(prev => ({ ...prev, version: '' }));
    const fetchVersions = filters.source === 'modrinth'
      ? modrinthService.fetchGameVersions()
      : curseforgeService.fetchGameVersions(filters.source);
    fetchVersions
      .then(releases => {
        setVersions(releases);
        if (releases.length) {
          const locked = restoredVersionRef.current;
          restoredVersionRef.current = null;
          const preserved = preservedVersionRef.current;
          preservedVersionRef.current = null;
          const preferred = locked ?? (preserved && releases.includes(preserved) ? preserved : null) ?? releases[0];
          setFilters(prev => ({ ...prev, version: preferred }));
        }
      })
      .catch(() => { /* version list unavailable — search will stay paused */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source]);

  // ── Core search ───────────────────────────────────────────────────────────

  const runSearch = useCallback(async (
    query:       string,
    snapshot:    Filters,
    startOffset: number,
    append:      boolean,
  ) => {
    if (!snapshot.version) return;

    if (!append) {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsLoading(true);
      setHasError(false);
      setOffset(0);
      activeRef.current = { query, filters: snapshot };
      animatedIds.current.clear();
      setFallbackVersion(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const service = snapshot.source === 'modrinth' ? modrinthService : curseforgeService;
      const signal  = append ? undefined : abortRef.current?.signal;
      let page      = await service.searchProjects(query, snapshot, startOffset, signal);
      let usedVersion = snapshot.version;

      // Fallback to older versions if no results found on fresh search
      if (!append && page.hits.length === 0) {
        const currentIdx = versions.indexOf(snapshot.version);
        console.log('No results for version:', snapshot.version, 'Index:', currentIdx, 'Total versions:', versions.length);
        // Try older versions (next indices, since versions are sorted newest-first)
        if (currentIdx >= 0 && currentIdx < versions.length - 1) {
          for (let i = currentIdx + 1; i < versions.length; i++) {
            const prevVersion = versions[i];
            console.log('Trying fallback version:', prevVersion);
            const fallbackSnapshot = { ...snapshot, version: prevVersion };
            page = await service.searchProjects(query, fallbackSnapshot, 0, signal);
            console.log('Fallback results:', page.hits.length);
            if (page.hits.length > 0) {
              usedVersion = prevVersion;
              setFallbackVersion(prevVersion);
              console.log('Found results in:', prevVersion);
              break;
            }
          }
        }
      }

      if (append) {
        setResults(prev => [...prev, ...page.hits]);
        const next = startOffset + page.hits.length;
        setOffset(next);
        setHasMore(next < page.totalHits);
      } else {
        setResults(page.hits);
        setOffset(page.hits.length);
        setHasMore(page.hits.length < page.totalHits);
      }
      setHasError(false);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setHasError(true);
    } finally {
      if (append) setIsLoadingMore(false);
      else        setIsLoading(false);
    }
  }, [versions]);

  // Re-fetch on filter change; clears query to show browse mode.
  useEffect(() => {
    if (!filters.version) return;
    setSearchQuery('');
    runSearch('', filters, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source, filters.version, filters.contentType, filters.loader, filters.shaderLoader, filters.pluginLoader, runSearch]);

  // ── Search actions ────────────────────────────────────────────────────────

  const triggerSearch = useCallback(() => {
    runSearch(searchQuery.trim(), filters, 0, false);
  }, [runSearch, searchQuery, filters]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') triggerSearch(); },
    [triggerSearch],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    runSearch('', filters, 0, false);
  }, [runSearch, filters]);

  const loadMore = useCallback(() => {
    const { query, filters: f } = activeRef.current;
    runSearch(query, f, offset, true);
  }, [runSearch, offset]);

  // ── Filter setters ────────────────────────────────────────────────────────

  const setSource = useCallback((s: Source) => {
    setFilters(prev => {
      const toBedrockBoundary   = s === 'curseforge-bedrock' && !BEDROCK_CONTENT_TYPES.has(prev.contentType);
      const fromBedrockBoundary = s !== 'curseforge-bedrock' &&  BEDROCK_CONTENT_TYPES.has(prev.contentType);
      const contentType = toBedrockBoundary ? 'addon' : fromBedrockBoundary ? 'mod' : prev.contentType;
      // Preserve the version when switching between non-Bedrock sources.
      if (s !== 'curseforge-bedrock' && prev.source !== 'curseforge-bedrock' && prev.version) {
        preservedVersionRef.current = prev.version;
      }
      return { ...prev, source: s, contentType };
    });
  }, []);

  const setVersion = useCallback((v: string) => {
    setFilters(prev => ({ ...prev, version: v }));
  }, []);

  const setLoader = useCallback((l: Loader) => {
    setFilters(prev => ({ ...prev, loader: l }));
  }, []);

  const toggleShaderLoader = useCallback((sl: ShaderLoader) => {
    setFilters(prev => ({ ...prev, shaderLoader: prev.shaderLoader === sl ? null : sl }));
  }, []);

  const togglePluginLoader = useCallback((pl: PluginLoader) => {
    setFilters(prev => ({ ...prev, pluginLoader: prev.pluginLoader === pl ? null : pl }));
  }, []);

  const setContentType = useCallback((ct: ContentType) => {
    setFilters(prev => ({
      ...prev,
      contentType:  ct,
      shaderLoader: ct === 'shader' ? prev.shaderLoader : null,
      pluginLoader: ct === 'plugin' ? prev.pluginLoader : null,
    }));
  }, []);

  // ── Snackbar: warn when Modrinth + datapack is selected ──────────────────
  useEffect(() => {
    if (filters.source === 'modrinth' && filters.contentType === 'datapack') {
      if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
      setSnackbar('Use CurseForge instead; Modrinth datapacks are unreliable (may download mods instead)');
      snackbarTimerRef.current = setTimeout(() => setSnackbar(null), 6000);
    }
  }, [filters.source, filters.contentType]);

  // ── Auto-select Bedrock on mobile (skipped when a share URL is present) ────

  useEffect(() => {
    const hasShareData = new URLSearchParams(window.location.search).has('data');
    if (hasShareData) return;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobile) setSource('curseforge-bedrock');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── URL share detection (two-phase: mount → after versions load) ──────────

  useEffect(() => {
    const data = new URLSearchParams(window.location.search).get('data');
    if (!data) return;
    const state = decodeState(data);
    if (!state) return; // leave URL intact — corrupt/unknown format
    setPendingRestore(state);
    window.history.replaceState({}, '', window.location.pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!versions.length || !pendingRestore) return;
    restoredVersionRef.current = pendingRestore.version;
    restoreMods(pendingRestore);
    setPendingRestore(null);
  }, [versions, pendingRestore, restoreMods]);

  // ── Export / Import / Share ───────────────────────────────────────────────

  const getExportState = useCallback(() =>
    buildExportState(
      filters.version,
      filters.loader,
      filters.source,
      queue.entries.filter(e => !e.isDependency).map(e => e.id),
    ),
  [filters.version, filters.loader, filters.source, queue.entries]);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting the same file
    try {
      const state = await readJSONFile(file);
      setImportError(null);
      restoredVersionRef.current = state.version;
      await restoreMods(state);
    } catch (err) {
      setImportError((err as Error).message);
    }
  }, [restoreMods]);

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(getExportState());
    if (!url) {
      setImportError('List too large for a URL — use Export instead.');
      return;
    }
    setImportError(null);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      prompt('Copy this share URL:', url);
      return;
    }
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, [getExportState]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const currentTypeInfo = CONTENT_TYPES.find(t => t.id === filters.contentType)!;

  /** True when this project is already present in the queue (any status). */
  const inQueue = useCallback(
    (id: string) => queue.entries.some(e => e.id === id),
    [queue.entries],
  );

  /** ZIP filename derived from active source and content type. */
  const zipName = `${filters.source}-${filters.contentType}s`;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-bg-base text-ink-primary overflow-hidden select-none" style={{ height: '100dvh' }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="border-b border-line-subtle shrink-0">
        <div className="flex items-center gap-6 px-5 py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center shrink-0">
              <CloudArrowDownIcon className="w-3.5 h-3.5 text-brand-dark" />
            </div>
            <span className="text-[14px] font-semibold tracking-tight">dynrinth</span>
          </div>
          <div className="flex overflow-x-auto scrollbar-none gap-6">
            {CONTENT_TYPES.filter(t => t.sources.includes(filters.source)).map(t => (
              <button
                key={t.id}
                onClick={() => setContentType(t.id)}
                className={[
                  'px-0 py-2 text-xs font-medium border-b-2 transition-all duration-150 -mb-px whitespace-nowrap',
                  filters.contentType === t.id
                    ? 'border-brand text-ink-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className={`${mobilePanel === 'queue' ? 'hidden' : 'flex'} md:flex flex-1 flex-col overflow-hidden min-w-0`}>

          {/* Version + loader row */}
          <div className="flex items-center gap-3 px-5 py-2 border-b border-line-subtle shrink-0 flex-wrap">

            {/* API source */}
            <CustomSelect
              value={filters.source}
              onChange={v => setSource(v as Source)}
              options={[
                { value: 'modrinth',           label: 'Modrinth'    },
                { value: 'curseforge',          label: 'CurseForge'  },
                { value: 'curseforge-bedrock',  label: 'Bedrock'     },
              ]}
              width="w-32"
            />

            {/* MC version */}
            <CustomSelect
              value={filters.version}
              onChange={setVersion}
              options={versions.length ? versions.map(v => ({ value: v, label: v })) : [{ value: '', label: '...' }]}
              width="w-28"
            />

            {/* Mod loader */}
            {currentTypeInfo.usesLoader && (
              <PillToggle<Loader>
                options={LOADERS}
                active={filters.loader}
                onToggle={setLoader}
              />
            )}

            {/* Shader renderer */}
            {filters.contentType === 'shader' && (
              <PillToggle<ShaderLoader>
                options={SHADER_LOADERS}
                active={filters.shaderLoader}
                onToggle={toggleShaderLoader}
              />
            )}

            {/* Plugin platform */}
            {filters.contentType === 'plugin' && (
              <PillToggle<PluginLoader>
                options={PLUGIN_LOADERS}
                active={filters.pluginLoader}
                onToggle={togglePluginLoader}
              />
            )}

            {/* Search input */}
            <div className="flex gap-1 w-full md:ml-auto md:flex-1 md:max-w-sm">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Search items...`}
                  className="w-full h-7 pl-8 pr-2 rounded text-ink-primary text-xs placeholder:text-ink-tertiary transition-colors focus:ring-2 focus:ring-brand focus:outline-none bg-bg-surface"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                    title="Clear search"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={triggerSearch}
                disabled={isLoading}
                className="h-7 w-7 rounded-md bg-brand border border-brand text-brand-dark flex items-center justify-center shrink-0 transition-all hover:bg-brand-hover active:scale-95 disabled:opacity-50"
              >
                {isLoading
                  ? <Spinner size={11} />
                  : <MagnifyingGlassIcon className="w-[11px] h-[11px]" />
                }
              </button>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto relative">

            {fallbackVersion && !isLoading && (
              <div className="px-4 py-2 bg-brand-glow border-b border-brand/30 text-brand text-xs flex items-center gap-2">
                <InformationCircleIcon className="w-4 h-4 shrink-0" />
                <span>No {currentTypeInfo.label.toLowerCase()} for {filters.version}. Showing results from {fallbackVersion} instead.</span>
              </div>
            )}

            {isLoading && results.length > 0 && (
              <div className="absolute inset-0 bg-bg-base/60 flex items-start justify-center pt-10 z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-ink-secondary text-xs bg-bg-surface border border-line-subtle rounded-lg px-3 py-2 shadow-lg">
                  <Spinner size={12} /> Updating...
                </div>
              </div>
            )}

            {isLoading && results.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-16 text-ink-secondary text-xs">
                <Spinner /> Loading {currentTypeInfo.label.toLowerCase()}...
              </div>
            )}

            {!isLoading && hasError && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs">
                <ExclamationTriangleIcon className="w-8 h-8 text-ink-primary" />
                Error searching. Check your connection.
              </div>
            )}

            {!isLoading && !hasError && results.length === 0 && filters.version && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs text-center">
                <MagnifyingGlassIcon className="w-8 h-8 text-ink-secondary opacity-50" />
                <span>
                  No results for{' '}
                  <strong className="text-ink-primary">
                    {activeRef.current.query || currentTypeInfo.label}
                  </strong>
                  {activeRef.current.query && (
                    <><br />with {filters.version}</>
                  )}
                </span>
              </div>
            )}

            {results.length > 0 && (
              <div>
                {results.map((item, i) => {
                  const isNew    = i >= offset - PAGE_SIZE && !animatedIds.current.has(item.project_id);
                  const queued   = inQueue(item.project_id);
                  const qEntry   = queue.entries.find(e => e.id === item.project_id);
                  const isActive = qEntry?.status === 'pending' || qEntry?.status === 'resolving';

                  // Mark this item as animated
                  if (isNew) {
                    animatedIds.current.add(item.project_id);
                  }

                  return (
                    <div
                      key={item.project_id}
                      className={`flex items-start gap-3 px-4 py-3.5 border-b border-line hover:bg-bg-surface/60 transition-all duration-150 cursor-default${isNew ? ' animate-fadeIn' : ''}`}
                      style={isNew ? { animationDelay: `${(i % PAGE_SIZE) * 20}ms` } : undefined}
                    >
                      <ItemIcon url={item.icon_url} title={item.title} />
                      <div className="flex-1 min-w-0">
                        {item.page_url ? (
                          <a
                            href={item.page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] font-semibold truncate leading-tight hover:underline hover:text-brand transition-colors"
                            onClick={e => e.stopPropagation()}
                          >{item.title}</a>
                        ) : (
                          <div className="text-[13px] font-semibold truncate leading-tight">{item.title}</div>
                        )}
                        <div className="text-xs text-ink-secondary mt-0.5 truncate leading-snug">{item.description}</div>
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
                        disabled={queued}
                        onClick={() => { queue.add(item.project_id, item.title, item.icon_url, filters); setMobilePanel('queue'); }}
                        className={[
                          'no-ring w-8 h-8 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all duration-150 leading-none self-center',
                          queued && !isActive
                            ? 'bg-brand-glow text-brand cursor-default'
                            : isActive
                            ? 'bg-bg-card text-ink-tertiary cursor-wait'
                            : 'bg-bg-card text-ink-secondary hover:text-brand hover:bg-brand-glow active:scale-95',
                        ].join(' ')}
                        title={queued ? 'In queue' : 'Add to queue'}
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

                {(hasMore || isLoadingMore) && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="h-8 px-5 rounded-lg bg-bg-surface text-ink-secondary text-xs font-medium flex items-center gap-2 transition-all hover:text-ink-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMore ? <><Spinner size={11} /> Loading...</> : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="hidden md:block w-px bg-line-subtle self-stretch shrink-0" />

        {/* ── Right panel (queue) ─────────────────────────────────────────── */}
        <div className={`${mobilePanel === 'search' ? 'hidden' : 'flex'} md:flex w-full md:w-[290px] flex-col shrink-0`}>

          {/* Queue header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">Download queue</span>
              <span className="min-w-[20px] h-5 px-1.5 bg-brand text-brand-dark text-[10px] font-bold rounded-full flex items-center justify-center font-mono">
                {queue.entries.length}
              </span>
            </div>
            {queue.entries.length > 0 && !queue.isDownloading && (
              <button
                onClick={queue.clear}
                className="text-[11px] text-ink-tertiary hover:text-ink-secondary transition-colors px-2 py-1 rounded hover:bg-bg-hover"
              >
                Clear
              </button>
            )}
          </div>

          {/* Queue items */}
          <div className="flex-1 overflow-y-auto">
            {queue.entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-tertiary">
                <ArchiveBoxIcon className="w-8 h-8 text-ink-secondary opacity-40" />
                <span className="text-xs text-center leading-relaxed">
                  Queue empty.<br />Add items from search.
                </span>
              </div>
            ) : (
              queue.entries.map((entry, i) => {
                const lbl         = loaderLabel(entry.filters);
                const isTransient = entry.status === 'pending' || entry.status === 'resolving';
                const isError     = entry.status === 'error';
                const slbl        = statusLabel(entry.status);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2.5 px-4 py-3 border-b border-line hover:bg-bg-hover transition-all duration-150 animate-slideIn"
                    style={{ animationDelay: `${i * 15}ms` }}
                  >
                    <QueueStatusDot status={entry.status} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12px] font-medium truncate">{entry.title}</span>
                        {entry.isDependency && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-line-subtle text-ink-tertiary border border-line shrink-0">
                            dep
                          </span>
                        )}
                      </div>

                      {/* Status / metadata line */}
                      {isTransient && (
                        <div className="text-[10px] text-ink-tertiary mt-0.5">{slbl}</div>
                      )}
                      {isError && (
                        <div className="text-[10px] text-red-err mt-0.5">
                          {entry.errorReason === 'no_compatible_version'
                            ? 'No compatible version'
                            : 'Network error'}
                        </div>
                      )}
                      {entry.resolved && !isTransient && (
                        <div className="text-[10px] font-mono text-ink-tertiary mt-0.5 truncate">
                          {entry.resolved.versionNumber}
                          {entry.resolved.sizeKb ? ` · ${fmtSize(entry.resolved.sizeKb)}` : ''}
                          {lbl ? ` · ${lbl}` : ''}
                        </div>
                      )}

                      {/* Per-item download progress bar */}
                      {entry.status === 'downloading' && entry.progress > 0 && (
                        <div className="mt-1 h-0.5 bg-line-subtle rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand transition-all duration-200"
                            style={{ width: `${entry.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!queue.isDownloading && (
                      <div className="flex items-center gap-1 shrink-0">
                        {isError && (
                          <button
                            onClick={() => queue.retry(entry.id)}
                            className="text-ink-secondary hover:text-brand w-5 h-5 flex items-center justify-center rounded hover:bg-bg-hover transition-colors"
                            title="Try again"
                          >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => queue.remove(entry.id)}
                          className="text-ink-tertiary hover:text-ink-primary w-5 h-5 flex items-center justify-center rounded hover:bg-bg-hover transition-colors"
                          title="Remove"
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

            {/* Hidden file input for import */}
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />

            {/* Export / Import / Share row */}
            <div className="flex gap-2 mb-2.5">
              <button
                onClick={() => downloadJSON(getExportState())}
                disabled={isRestoring}
                className="flex-1 h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title="Export mod list as JSON"
              >
                <ArrowUpTrayIcon className="w-[11px] h-[11px]" />
                Export
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={isRestoring}
                className="flex-1 h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title="Import mod list from JSON"
              >
                {isRestoring ? (
                  <><Spinner size={11} /> Restoring...</>
                ) : (
                  <>
                    <ArrowDownTrayIcon className="w-[11px] h-[11px]" />
                    Import
                  </>
                )}
              </button>
              <button
                onClick={handleShare}
                disabled={isRestoring}
                className="flex-1 h-8 rounded-lg bg-bg-surface text-ink-primary text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all hover:text-white hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy shareable URL"
              >
                <LinkIcon className="w-[11px] h-[11px]" />
                {copyFeedback ? 'Copied!' : 'Share'}
              </button>
            </div>

            {/* Partial restore failure */}
            {failedCount !== null && failedCount > 0 && (
              <div className="mb-2 text-[10px] text-amber-400 text-center">
                {failedCount} mod{failedCount > 1 ? 's' : ''} could not be loaded
              </div>
            )}

            {/* Import / share error */}
            {importError && (
              <div className="mb-2 text-[10px] text-red-err text-center">{importError}</div>
            )}

            {queue.isDownloading ? (
              <button
                disabled
                className="w-full h-10 rounded-lg bg-brand border border-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
              >
                {queue.entries.filter(e => e.status === 'downloading').length === 1
                  ? <><Spinner size={13} /> Downloading... {queue.zipProgress}%</>
                  : <><Spinner size={13} /> Creating {archiveFormat === 'tar.gz' ? '.tar.gz' : 'ZIP'}... {queue.zipProgress}%</>
                }
              </button>
            ) : queue.readyCount > 1 ? (
              <div className="flex w-full h-10 rounded-lg overflow-hidden border border-brand">
                <button
                  onClick={() => queue.downloadZip(zipName, archiveFormat)}
                  className="flex-1 bg-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover active:scale-[0.98]"
                >
                  <ArrowDownTrayIcon className="w-[13px] h-[13px]" />
                  Download {queue.readyCount} files
                </button>
                <button
                  onClick={() => setArchiveFormat(f => f === 'zip' ? 'tar.gz' : 'zip')}
                  title="Toggle archive format"
                  className="px-3 bg-brand text-brand-dark text-[10px] font-mono font-semibold border-l border-black/20 hover:bg-brand-hover transition-colors"
                >
                  .{archiveFormat}
                </button>
              </div>
            ) : (
              <button
                onClick={() => queue.downloadZip(zipName, archiveFormat)}
                disabled={queue.readyCount === 0}
                className="w-full h-10 rounded-lg bg-brand border border-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover hover:border-brand-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowDownTrayIcon className="w-[13px] h-[13px]" />
                Download file
              </button>
            )}

            {/* ZIP progress bar */}
            {queue.isDownloading && (
              <div className="mt-2 h-1 bg-line-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300 ease-out"
                  style={{ width: `${queue.zipProgress}%` }}
                />
              </div>
            )}

            {/* Status summary below the button */}
            {!queue.isDownloading && queue.entries.length > 0 && (
              <div className="mt-2 flex gap-3 justify-center text-[10px] font-mono text-ink-tertiary">
                {(() => {
                  const counts = {
                    pending:  queue.entries.filter(e => e.status === 'pending' || e.status === 'resolving').length,
                    ready:    queue.readyCount,
                    done:     queue.entries.filter(e => e.status === 'done').length,
                    error:    queue.entries.filter(e => e.status === 'error').length,
                  };
                  return (
                    <>
                      {counts.pending > 0 && <span className="text-ink-tertiary">{counts.pending} resolving</span>}
                      {counts.ready   > 0 && <span className="text-brand">{counts.ready} ready</span>}
                      {counts.done    > 0 && <span className="text-brand">{counts.done} downloaded</span>}
                      {counts.error   > 0 && <span className="text-red-err">{counts.error} error{counts.error > 1 ? 's' : ''}</span>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

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
          Search
        </button>
        <button
          onClick={() => setMobilePanel('queue')}
          className={`flex-1 py-3.5 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
            mobilePanel === 'queue' ? 'text-brand' : 'text-ink-secondary'
          }`}
        >
          <ArrowDownTrayIcon className="w-[15px] h-[15px]" />
          Queue
          {queue.entries.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 bg-brand text-brand-dark text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
              {queue.entries.length}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}
