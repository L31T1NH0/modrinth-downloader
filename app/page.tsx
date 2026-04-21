'use client';

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { useLocale, type Translations } from '@/lib/i18n';
import { flushSync } from 'react-dom';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  CheckIcon,
  CheckCircleIcon,
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
import { TextClamp } from '@/components/TextClamp';
import * as curseforgeService from '@/lib/curseforge/service';
import type {
  Filters,
  Loader,
  ShaderLoader,
  PluginLoader,
  ContentType,
  Source,
  SearchResult,
  SearchPage,
} from '@/lib/modrinth/types';
import { useQueue, type QueueItemStatus } from '@/hooks/useQueue';
import { useRestoreMods } from '@/hooks/useRestoreMods';
import {
  buildShareUrl, downloadJSON, readJSONFile, buildExportState, decodeState,
  type ModListState,
} from '@/lib/stateUtils';
import { CustomSelect } from '@/components/CustomSelect';
import { Skeleton, configureBoneyard } from 'boneyard-js/react';
import { DebugPanel } from '@/components/DebugPanel';
import { captureEvent } from '@/lib/debugCapture';

configureBoneyard({ color: '#1f2d3d', animate: 'pulse' });

const PAGE_SIZE = modrinthService.PAGE_SIZE;
const SEARCH_FALLBACK_LIMITS = {
  maxTermSimplifications: 1,
  maxVersionFallbacks: 2,
} as const;
const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;
const SEARCH_CACHE_TTL_MS = 60_000;

type SearchFallbackDebugMeta = {
  requestId: number;
  originalQuery: string;
  executedQuery: string;
  originalVersion: string;
  usedVersion: string;
  termSimplificationAttempts: number;
  versionFallbackAttempts: number;
  versionFallbackTried: string[];
  strategy: 'none' | 'term-simplification' | 'version-fallback';
  resultedInHits: boolean;
};

type SearchFetchContext = {
  service: typeof modrinthService | typeof curseforgeService;
  signal: AbortSignal;
};

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
function statusLabel(s: QueueItemStatus, t: Translations): string {
  if (s === 'resolving')   return t.status.resolving;
  if (s === 'pending')     return t.status.pending;
  if (s === 'downloading') return t.status.downloading;
  if (s === 'done')        return t.status.done;
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

  // ── MC version list ───────────────────────────────────────────────────────
  const [versions, setVersions] = useState<string[]>([]);

  // ── Active filters ────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [isSearching,   setIsSearching]   = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError,      setHasError]      = useState(false);
  const [results,       setResults]       = useState<SearchResult[]>([]);
  const [offset,        setOffset]        = useState(0);
  const [hasMore,       setHasMore]       = useState(false);
  const activeRef = useRef<{ query: string; filters: Filters }>({
    query: '', filters: DEFAULT_FILTERS,
  });
  const abortRef    = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, { expiresAt: number; page: SearchPage }>>(new Map());
  const inflightRef = useRef<Map<string, Promise<SearchPage>>>(new Map());
  const fallbackUsageByInteractionRef = useRef<Map<number, boolean>>(new Map());
  const interactionIdRef = useRef(0);
  const animatedIds = useRef<Set<string>>(new Set());
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [searchDebugMeta, setSearchDebugMeta] = useState<SearchFallbackDebugMeta | null>(null);

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
  const [showMobileSourceSuggestion, setShowMobileSourceSuggestion] = useState(false);

  // ── Snackbar ──────────────────────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Added-to-queue snackbar (mobile) ─────────────────────────────────────
  const [addedSnackbar, setAddedSnackbar] = useState(false);
  const addedSnackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Archive format ────────────────────────────────────────────────────────
  const [archiveFormat, setArchiveFormat] = useState<'zip' | 'tar.gz'>('zip');

  // ── Persist user decisions ────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('modrinth-dl:filters', JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  useEffect(() => {
    try { localStorage.setItem('modrinth-dl:archiveFormat', archiveFormat); } catch { /* ignore */ }
  }, [archiveFormat]);

  // ── Restore persisted state from localStorage (client-only, runs before versions fetch) ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('modrinth-dl:filters');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Filters>;
        preservedVersionRef.current = parsed.version ?? null;
        setFilters(prev => ({ ...prev, ...parsed, version: '' }));
      }
    } catch { /* ignore */ }
    try {
      const savedFormat = localStorage.getItem('modrinth-dl:archiveFormat');
      if (savedFormat === 'zip' || savedFormat === 'tar.gz') setArchiveFormat(savedFormat);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fallback version tracking ─────────────────────────────────────────────
  const [fallbackVersion, setFallbackVersion] = useState<string | null>(null);

  // ── Load MC versions (re-fetched when source changes) ────────────────────

  useEffect(() => {
    let cancelled = false;
    setVersions([]);
    setFilters(prev => ({ ...prev, version: '' }));
    const fetchVersions = filters.source === 'modrinth'
      ? modrinthService.fetchGameVersions()
      : curseforgeService.fetchGameVersions(filters.source);
    fetchVersions
      .then(releases => {
        if (cancelled) return;
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
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source]);

  // ── Core search ───────────────────────────────────────────────────────────

  const buildSearchKey = useCallback((query: string, snapshot: Filters, startOffset: number) => {
    const loaderScope = snapshot.contentType === 'mod'
      ? snapshot.loader
      : snapshot.contentType === 'shader'
        ? snapshot.shaderLoader ?? ''
        : snapshot.contentType === 'plugin'
          ? snapshot.pluginLoader ?? ''
          : '';
    return [
      snapshot.source,
      snapshot.contentType,
      snapshot.version,
      loaderScope,
      query,
      String(startOffset),
    ].join('|');
  }, []);

  const fetchSearchPage = useCallback(async (
    query: string,
    snapshot: Filters,
    startOffset: number,
    ctx: SearchFetchContext,
    meta: { cacheHit: boolean },
  ): Promise<SearchPage> => {
    const key = buildSearchKey(query, snapshot, startOffset);
    const now = Date.now();
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiresAt > now) {
      meta.cacheHit = true;
      return cached.page;
    }

    const inflight = inflightRef.current.get(key);
    if (inflight) {
      meta.cacheHit = true;
      return inflight;
    }

    const reqPromise = ctx.service
      .searchProjects(query, snapshot, startOffset, ctx.signal)
      .then(page => {
        cacheRef.current.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, page });
        return page;
      })
      .finally(() => {
        inflightRef.current.delete(key);
      });

    inflightRef.current.set(key, reqPromise);
    return reqPromise;
  }, [buildSearchKey]);

  const runSearch = useCallback(async (
    query:       string,
    snapshot:    Filters,
    startOffset: number,
    append:      boolean,
    interactionId: number,
  ) => {
    if (!snapshot.version) return;

    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    // Remove the inflight entry for this key so the aborted promise isn't reused
    // by this request. Without this, the new ctrl's fetch would receive the
    // AbortError from the previous ctrl and exit without setting results.
    inflightRef.current.delete(buildSearchKey(query, snapshot, startOffset));
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t0 = performance.now();

    if (!append) {
      const contextChanged =
        snapshot.source      !== activeRef.current.filters.source ||
        snapshot.contentType !== activeRef.current.filters.contentType;
      setIsSearching(true);
      if (contextChanged) setResults([]);
      setOffset(0);
      activeRef.current = { query, filters: snapshot };
      animatedIds.current.clear();
      setFallbackVersion(null);
      setSearchDebugMeta(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const service = snapshot.source === 'modrinth' ? modrinthService : curseforgeService;
      const signal = ctrl.signal;
      const fetchContext: SearchFetchContext = { service, signal };
      const fetchMeta = { cacheHit: false };
      let page      = await fetchSearchPage(query, snapshot, startOffset, fetchContext, fetchMeta);
      let usedVersion = snapshot.version;
      let executedQuery = query;
      let termSimplificationAttempts = 0;
      let versionFallbackAttempts = 0;
      const versionFallbackTried: string[] = [];
      let strategy: SearchFallbackDebugMeta['strategy'] = 'none';
      const canUseFallback = !append && !fallbackUsageByInteractionRef.current.get(interactionId);

      // Fallback 1: multi-word query with no hits → retry with longest single term (1 extra call)
      if (
        canUseFallback &&
        !append &&
        page.hits.length === 0 &&
        query.includes(' ') &&
        SEARCH_FALLBACK_LIMITS.maxTermSimplifications > 0
      ) {
        const term = query.split(/\s+/).sort((a, b) => b.length - a.length)[0];
        termSimplificationAttempts = 1;
        strategy = 'term-simplification';
        executedQuery = term;
        page = await fetchSearchPage(term, snapshot, 0, fetchContext, fetchMeta);
        fallbackUsageByInteractionRef.current.set(interactionId, true);
      }

      // Fallback 2: still no results → try configured amount of immediately older versions
      if (
        canUseFallback &&
        !fallbackUsageByInteractionRef.current.get(interactionId) &&
        !append &&
        page.hits.length === 0
      ) {
        const currentIdx = versions.indexOf(snapshot.version);
        const start = currentIdx >= 0 ? currentIdx + 1 : 0;
        const end = Math.min(start + SEARCH_FALLBACK_LIMITS.maxVersionFallbacks, versions.length);
        for (let i = start; i < end; i++) {
          const fallbackSnapshot = { ...snapshot, version: versions[i] };
          versionFallbackAttempts += 1;
          versionFallbackTried.push(versions[i]);
          page = await fetchSearchPage(executedQuery, fallbackSnapshot, 0, fetchContext, fetchMeta);
          if (page.hits.length > 0) {
            usedVersion = versions[i];
            setFallbackVersion(versions[i]);
            strategy = 'version-fallback';
            fallbackUsageByInteractionRef.current.set(interactionId, true);
            break;
          }
        }
      }

      if (abortRef.current !== ctrl || requestIdRef.current !== requestId) return;

      const durationMs = Math.round(performance.now() - t0);
      const loaderScope = snapshot.contentType === 'mod' ? snapshot.loader
        : snapshot.contentType === 'shader' ? snapshot.shaderLoader
        : snapshot.contentType === 'plugin' ? snapshot.pluginLoader
        : null;

      if (append) {
        setResults(prev => [...prev, ...page.hits]);
        const next = startOffset + page.hits.length;
        setOffset(next);
        setHasMore(next < page.totalHits);
        captureEvent({ type: 'load_more', ts: Date.now(), offset: startOffset, resultCount: page.hits.length, durationMs });
      } else {
        const appliedFilters = usedVersion !== snapshot.version
          ? { ...snapshot, version: usedVersion }
          : snapshot;
        const commitResults = () => {
          activeRef.current = { query: executedQuery, filters: appliedFilters };
          setResults(page.hits);
          setOffset(page.hits.length);
          setHasMore(page.hits.length < page.totalHits);
          setSearchDebugMeta({
            requestId,
            originalQuery: query,
            executedQuery,
            originalVersion: snapshot.version,
            usedVersion,
            termSimplificationAttempts,
            versionFallbackAttempts,
            versionFallbackTried,
            strategy,
            resultedInHits: page.hits.length > 0,
          });
        };
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
          (document as Document & { startViewTransition(cb: () => void): unknown })
            .startViewTransition(() => flushSync(commitResults));
        } else {
          commitResults();
        }

        captureEvent({
          type: 'search',
          ts: Date.now(),
          query: executedQuery,
          source: snapshot.source,
          version: usedVersion,
          contentType: snapshot.contentType,
          loader: loaderScope,
          durationMs,
          resultCount: page.hits.length,
          totalHits: page.totalHits,
          cacheHit: fetchMeta.cacheHit,
          fallbackStrategy: strategy,
          fallbackVersion: usedVersion !== snapshot.version ? usedVersion : null,
          append: false,
        });

        if (page.hits.length === 0) {
          captureEvent({
            type: 'zero_results',
            ts: Date.now(),
            query: executedQuery,
            source: snapshot.source,
            version: snapshot.version,
            contentType: snapshot.contentType,
            fallbacksTried: versionFallbackTried,
          });
        }
      }
      setHasError(false);
    } catch (e) {
      if (abortRef.current !== ctrl || requestIdRef.current !== requestId) return;
      if ((e as Error).name !== 'AbortError') {
        setHasError(true);
        captureEvent({
          type: 'search_error',
          ts: Date.now(),
          query,
          source: snapshot.source,
          version: snapshot.version,
          contentType: snapshot.contentType,
          message: (e as Error).message ?? 'unknown',
        });
      }
    } finally {
      if (abortRef.current === ctrl) {
        if (append) setIsLoadingMore(false);
        else        setIsSearching(false);
      }
    }
  }, [fetchSearchPage, versions]);

  // Re-fetch on filter change; clears query to show browse mode.
  useEffect(() => {
    if (!filters.version) return;
    setSearchQuery('');
    interactionIdRef.current += 1;
    fallbackUsageByInteractionRef.current.delete(interactionIdRef.current);
    void runSearch('', filters, 0, false, interactionIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source, filters.version, filters.contentType, filters.loader, filters.shaderLoader, filters.pluginLoader, runSearch]);

  // ── Search actions ────────────────────────────────────────────────────────

  const triggerSearch = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const trimmed = searchQuery.trim();
    if (trimmed && trimmed.length < MIN_QUERY_LENGTH) return;
    interactionIdRef.current += 1;
    fallbackUsageByInteractionRef.current.delete(interactionIdRef.current);
    void runSearch(trimmed, filters, 0, false, interactionIdRef.current);
  }, [runSearch, searchQuery, filters]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!filters.version) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const trimmed = val.trim();
    if (!trimmed) {
      if (activeRef.current.query === '') return;
      interactionIdRef.current += 1;
      fallbackUsageByInteractionRef.current.delete(interactionIdRef.current);
      void runSearch('', filters, 0, false, interactionIdRef.current);
    } else {
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const next = val.trim();
        if (!next || next.length < MIN_QUERY_LENGTH) return;
        interactionIdRef.current += 1;
        fallbackUsageByInteractionRef.current.delete(interactionIdRef.current);
        void runSearch(next, filters, 0, false, interactionIdRef.current);
      }, SEARCH_DEBOUNCE_MS);
    }
  }, [runSearch, filters]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') triggerSearch(); },
    [triggerSearch],
  );

  const clearSearch = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    setSearchQuery('');
    if (activeRef.current.query === '') return;
    interactionIdRef.current += 1;
    fallbackUsageByInteractionRef.current.delete(interactionIdRef.current);
    void runSearch('', filters, 0, false, interactionIdRef.current);
  }, [runSearch, filters]);

  const loadMore = useCallback(() => {
    const { query, filters: f } = activeRef.current;
    interactionIdRef.current += 1;
    fallbackUsageByInteractionRef.current.delete(interactionIdRef.current);
    void runSearch(query, f, offset, true, interactionIdRef.current);
  }, [runSearch, offset]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  // ── Filter setters ────────────────────────────────────────────────────────

  const setSource = useCallback((s: Source) => {
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'source', from: filtersRef.current.source, to: s });
    setFilters(prev => {
      const toBedrockBoundary   = s === 'curseforge-bedrock' && !BEDROCK_CONTENT_TYPES.has(prev.contentType);
      const fromBedrockBoundary = s !== 'curseforge-bedrock' &&  BEDROCK_CONTENT_TYPES.has(prev.contentType);
      const contentType = toBedrockBoundary ? 'addon' : fromBedrockBoundary ? 'mod' : prev.contentType;
      if (s !== 'curseforge-bedrock' && prev.source !== 'curseforge-bedrock' && prev.version) {
        preservedVersionRef.current = prev.version;
      }
      return { ...prev, source: s, contentType };
    });
  }, []);

  const dismissMobileSourceSuggestion = useCallback(() => {
    setShowMobileSourceSuggestion(false);
    try { localStorage.setItem('modrinth-dl:mobileSourceSuggestion', 'dismissed'); } catch { /* ignore */ }
  }, []);

  const acceptMobileSourceSuggestion = useCallback(() => {
    setShowMobileSourceSuggestion(false);
    try { localStorage.setItem('modrinth-dl:mobileSourceSuggestion', 'accepted'); } catch { /* ignore */ }
    setSource('curseforge-bedrock');
  }, [setSource]);

  const setVersion = useCallback((v: string) => {
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'version', from: filtersRef.current.version, to: v });
    setFilters(prev => ({ ...prev, version: v }));
  }, []);

  const setLoader = useCallback((l: Loader) => {
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'loader', from: filtersRef.current.loader, to: l });
    setFilters(prev => ({ ...prev, loader: l }));
  }, []);

  const toggleShaderLoader = useCallback((sl: ShaderLoader) => {
    const next = filtersRef.current.shaderLoader === sl ? null : sl;
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'shaderLoader', from: filtersRef.current.shaderLoader ?? 'none', to: next ?? 'none' });
    setFilters(prev => ({ ...prev, shaderLoader: prev.shaderLoader === sl ? null : sl }));
  }, []);

  const togglePluginLoader = useCallback((pl: PluginLoader) => {
    const next = filtersRef.current.pluginLoader === pl ? null : pl;
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'pluginLoader', from: filtersRef.current.pluginLoader ?? 'none', to: next ?? 'none' });
    setFilters(prev => ({ ...prev, pluginLoader: prev.pluginLoader === pl ? null : pl }));
  }, []);

  const setContentType = useCallback((ct: ContentType) => {
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'contentType', from: filtersRef.current.contentType, to: ct });
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
      setSnackbar(t.snackbar.datapacks);
      snackbarTimerRef.current = setTimeout(() => setSnackbar(null), 6000);
    }
  }, [filters.source, filters.contentType]);

  // ── Suggest Bedrock on first mobile access (skipped with share URL) ───────

  useEffect(() => {
    const hasShareData = new URLSearchParams(window.location.search).has('data');
    if (hasShareData) return;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!isMobile) return;
    let decision: string | null = null;
    try {
      decision = localStorage.getItem('modrinth-dl:mobileSourceSuggestion');
    } catch { /* ignore */ }
    if (decision === 'accepted') {
      setSource('curseforge-bedrock');
      return;
    }
    if (decision === 'dismissed') return;
    setShowMobileSourceSuggestion(true);
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
      filters.source,
      filters.contentType,
      queue.entries.filter(e => !e.isDependency).map(e => e.id),
      {
        loader: filters.loader,
        shaderLoader: filters.shaderLoader,
        pluginLoader: filters.pluginLoader,
      },
    ),
  [filters.version, filters.loader, filters.source, filters.contentType, filters.shaderLoader, filters.pluginLoader, queue.entries]);

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
      setImportError(t.snackbar.listTooLarge);
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
            {CONTENT_TYPES.filter(ct => ct.sources.includes(filters.source)).map(ct => (
              <button
                key={ct.id}
                onClick={() => setContentType(ct.id)}
                className={[
                  'px-0 py-2 text-xs font-medium border-b-2 transition-all duration-150 -mb-px whitespace-nowrap',
                  filters.contentType === ct.id
                    ? 'border-brand text-ink-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary',
                ].join(' ')}
              >
                {ct.label}
              </button>
            ))}
          </div>
          <a
            href="/rankings"
            className="ml-auto text-[11px] text-ink-secondary hover:text-ink-primary transition-colors whitespace-nowrap shrink-0"
          >
            Rankings
          </a>
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
                  onChange={handleQueryChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t.search.placeholder}
                  className="w-full h-7 pl-8 pr-2 rounded text-ink-primary text-xs placeholder:text-ink-tertiary transition-colors focus:ring-2 focus:ring-brand focus:outline-none bg-bg-surface"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                    title={t.search.clearTitle}
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={triggerSearch}
                disabled={isSearching || (!!searchQuery.trim() && searchQuery.trim().length < MIN_QUERY_LENGTH)}
                className="h-7 w-7 rounded-md bg-brand border border-brand text-brand-dark flex items-center justify-center shrink-0 transition-all hover:bg-brand-hover active:scale-95 disabled:opacity-50"
              >
                {isSearching
                  ? <Spinner size={11} />
                  : <MagnifyingGlassIcon className="w-[11px] h-[11px]" />
                }
              </button>
            </div>

            {showMobileSourceSuggestion && (
              <div className="w-full md:hidden rounded-md border border-brand/30 bg-brand-glow px-3 py-2 text-xs text-ink-secondary flex items-center justify-between gap-2">
                <span>{t.mobileSuggestion.text}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={dismissMobileSourceSuggestion}
                    className="text-ink-secondary hover:text-ink-primary transition-colors"
                  >
                    {t.mobileSuggestion.keep}
                  </button>
                  <button
                    onClick={acceptMobileSourceSuggestion}
                    className="h-6 px-2 rounded bg-brand border border-brand text-brand-dark hover:bg-brand-hover transition-colors"
                  >
                    {t.mobileSuggestion.switch}
                  </button>
                </div>
              </div>
            )}

            {!!searchQuery.trim() && searchQuery.trim().length < MIN_QUERY_LENGTH && (
              <div className="w-full text-[10px] text-ink-tertiary">
                {t.search.minLength.replace('{n}', String(MIN_QUERY_LENGTH))}
              </div>
            )}

          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto relative" style={{ viewTransitionName: 'results-list' }}>

            {fallbackVersion && !isSearching && (
              <div className="px-4 py-2 bg-brand-glow border-b border-brand/30 text-brand text-xs flex items-center gap-2">
                <InformationCircleIcon className="w-4 h-4 shrink-0" />
                <span>{t.fallback.banner
                  .replace('{type}', currentTypeInfo.label.toLowerCase())
                  .replace('{version}', filters.version)
                  .replace('{fallback}', fallbackVersion ?? '')
                }</span>
              </div>
            )}

            {isSearching && results.length === 0 && <SearchResultSkeletons />}

            {!isSearching && hasError && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs">
                <ExclamationTriangleIcon className="w-8 h-8 text-ink-primary" />
                {t.search.error}
              </div>
            )}

            {!isSearching && !hasError && results.length === 0 && filters.version && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs text-center">
                <MagnifyingGlassIcon className="w-8 h-8 text-ink-secondary opacity-50" />
                <span>
                  {t.search.noResultsFor}{' '}
                  <strong className="text-ink-primary">
                    {activeRef.current.query || currentTypeInfo.label}
                  </strong>
                  {activeRef.current.query && (
                    <><br />{t.search.withVersion} {filters.version}</>
                  )}
                </span>
                {searchDebugMeta && (
                  <div className="mt-2 rounded-md border border-line-subtle bg-bg-surface px-2 py-1 text-[10px] text-ink-tertiary">
                    debug: strategy={searchDebugMeta.strategy}, termFallbacks={searchDebugMeta.termSimplificationAttempts}, versionFallbacks={searchDebugMeta.versionFallbackAttempts}
                  </div>
                )}
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
                        disabled={queued}
                        onClick={() => {
                          queue.add(item.project_id, item.title, item.icon_url, filters);
                          captureEvent({ type: 'queue_add', ts: Date.now(), id: item.project_id, title: item.title, source: filters.source, contentType: filters.contentType });
                          if (addedSnackbarTimerRef.current) clearTimeout(addedSnackbarTimerRef.current);
                          setAddedSnackbar(true);
                          addedSnackbarTimerRef.current = setTimeout(() => setAddedSnackbar(false), 2000);
                        }}
                        className={[
                          'no-ring w-8 h-8 rounded-lg text-xs flex items-center justify-center shrink-0 transition-all duration-150 leading-none self-center',
                          queued && !isActive
                            ? 'bg-brand-glow text-brand cursor-default'
                            : isActive
                            ? 'bg-bg-card text-ink-tertiary cursor-wait'
                            : 'bg-bg-card text-ink-secondary hover:text-brand hover:bg-brand-glow active:scale-95',
                        ].join(' ')}
                        title={queued ? t.queue.inQueue : t.queue.addToQueue}
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
                      {isLoadingMore ? <><Spinner size={11} /> {t.search.loading}</> : t.search.loadMore}
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
              <span className="text-[13px] font-semibold">{t.queue.title}</span>
              <span className="min-w-[20px] h-5 px-1.5 bg-brand text-brand-dark text-[10px] font-bold rounded-full flex items-center justify-center font-mono">
                {queue.entries.length}
              </span>
            </div>
            {queue.entries.length > 0 && !queue.isDownloading && (
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
            {queue.entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-tertiary">
                <ArchiveBoxIcon className="w-8 h-8 text-ink-secondary opacity-40" />
                <span className="text-xs text-center leading-relaxed">
                  {t.queue.empty}<br />{t.queue.emptyHint}
                </span>
              </div>
            ) : (
              queue.entries.map((entry, i) => {
                const lbl         = loaderLabel(entry.filters);
                const isTransient = entry.status === 'pending' || entry.status === 'resolving';
                const isError     = entry.status === 'error';
                const slbl        = statusLabel(entry.status, t);
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
                      </div>

                      {/* Status / metadata line */}
                      {isTransient && (
                        <div className="text-[10px] text-ink-tertiary mt-0.5">{slbl}</div>
                      )}
                      {isError && (
                        <div className="text-[10px] text-red-err mt-0.5">
                          {entry.errorReason === 'no_compatible_version'
                            ? t.errors.noCompatibleVersion
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
                  <><Spinner size={11} /> {t.footer.restoring}</>
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

            {/* Partial restore failure */}
            {failedCount !== null && failedCount > 0 && (
              <div className="mb-2 text-[10px] text-amber-400 text-center">
                {(failedCount > 1 ? t.footer.failedModsPlural : t.footer.failedMods).replace('{n}', String(failedCount))}
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
                  ? <><Spinner size={13} /> {t.footer.downloading} {queue.zipProgress}%</>
                  : <><Spinner size={13} /> {t.footer.creatingArchive.replace('{format}', archiveFormat === 'tar.gz' ? '.tar.gz' : 'ZIP')} {queue.zipProgress}%</>
                }
              </button>
            ) : queue.readyCount > 1 ? (
              <div className="flex w-full h-10 rounded-lg overflow-hidden border border-brand">
                <button
                  onClick={() => { captureEvent({ type: 'queue_download', ts: Date.now(), itemCount: queue.readyCount, format: archiveFormat }); queue.downloadZip(archiveFormat); }}
                  className="flex-1 bg-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover active:scale-[0.98]"
                >
                  <ArrowDownTrayIcon className="w-[13px] h-[13px]" />
                  {t.footer.downloadFiles.replace('{n}', String(queue.readyCount))}
                </button>
                <button
                  onClick={() => setArchiveFormat(f => f === 'zip' ? 'tar.gz' : 'zip')}
                  title={t.footer.toggleFormat}
                  className="px-3 bg-brand text-brand-dark text-[10px] font-mono font-semibold border-l border-black/20 hover:bg-brand-hover transition-colors"
                >
                  .{archiveFormat}
                </button>
              </div>
            ) : (
              <button
                onClick={() => { captureEvent({ type: 'queue_download', ts: Date.now(), itemCount: queue.readyCount, format: archiveFormat }); queue.downloadZip(archiveFormat); }}
                disabled={queue.readyCount === 0}
                className="w-full h-10 rounded-lg bg-brand border border-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover hover:border-brand-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowDownTrayIcon className="w-[13px] h-[13px]" />
                {t.footer.downloadFile}
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
