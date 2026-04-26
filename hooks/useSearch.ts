'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { flushSync } from 'react-dom';
import * as modrinthService   from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import * as pvprpService      from '@/lib/scrapers/pvprp';
import * as optifineService   from '@/lib/scrapers/optifine';
import type { Filters, SearchPage, SearchResult } from '@/lib/modrinth/types';
import { captureEvent } from '@/lib/debugCapture';

export const PAGE_SIZE        = modrinthService.PAGE_SIZE;
export const MIN_QUERY_LENGTH = 2;

const SEARCH_FALLBACK_LIMITS = {
  maxTermSimplifications: 1,
  maxVersionFallbacks:    2,
} as const;

const SEARCH_DEBOUNCE_MS  = 400;
const SEARCH_CACHE_TTL_MS = 60_000;

type SearchFallbackDebugMeta = {
  requestId:                  number;
  originalQuery:              string;
  executedQuery:              string;
  originalVersion:            string;
  usedVersion:                string;
  termSimplificationAttempts: number;
  versionFallbackAttempts:    number;
  versionFallbackTried:       string[];
  strategy:                   'none' | 'term-simplification' | 'version-fallback';
  resultedInHits:             boolean;
};

type SearchFetchContext = {
  service: typeof modrinthService | typeof curseforgeService | typeof pvprpService | typeof optifineService;
  signal:  AbortSignal;
};

export interface UseSearchReturn {
  searchQuery:       string;
  isSearching:       boolean;
  isLoadingMore:     boolean;
  hasError:          boolean;
  results:           SearchResult[];
  offset:            number;
  hasMore:           boolean;
  fallbackVersion:   string | null;
  searchDebugMeta:   SearchFallbackDebugMeta | null;
  animatedIds:       MutableRefObject<Set<string>>;
  setSearchQuery:    (q: string) => void;
  triggerSearch:     () => void;
  handleQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown:     (e: React.KeyboardEvent<HTMLInputElement>) => void;
  clearSearch:       () => void;
  loadMore:          () => void;
}

export function useSearch(filters: Filters, versions: string[]): UseSearchReturn {
  const [searchQuery,     setSearchQuery]     = useState('');
  const [isSearching,     setIsSearching]     = useState(false);
  const [isLoadingMore,   setIsLoadingMore]   = useState(false);
  const [hasError,        setHasError]        = useState(false);
  const [results,         setResults]         = useState<SearchResult[]>([]);
  const [offset,          setOffset]          = useState(0);
  const [hasMore,         setHasMore]         = useState(false);
  const [fallbackVersion, setFallbackVersion] = useState<string | null>(null);
  const [searchDebugMeta, setSearchDebugMeta] = useState<SearchFallbackDebugMeta | null>(null);

  const activeRef        = useRef<{ query: string; filters: Filters }>({ query: '', filters });
  const abortRef         = useRef<AbortController | null>(null);
  const requestIdRef     = useRef(0);
  const debounceRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef         = useRef<Map<string, { expiresAt: number; page: SearchPage }>>(new Map());
  const inflightRef      = useRef<Map<string, Promise<SearchPage>>>(new Map());
  const fallbackUsageRef = useRef<Map<number, boolean>>(new Map());
  const interactionIdRef = useRef(0);
  const animatedIds      = useRef<Set<string>>(new Set());
  const initialQueryRef  = useRef<string | null>(null);

  // ── Read ?q= URL param on mount ───────────────────────────────────────────
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (!q) return;
    initialQueryRef.current = decodeURIComponent(q);
    window.history.replaceState({}, '', window.location.pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core search ───────────────────────────────────────────────────────────

  const buildSearchKey = useCallback((query: string, snapshot: Filters, startOffset: number) => {
    const loaderScope = snapshot.contentType === 'mod'
      ? snapshot.loader
      : snapshot.contentType === 'shader'
        ? snapshot.shaderLoader ?? ''
        : snapshot.contentType === 'plugin'
          ? snapshot.pluginLoader ?? ''
          : '';
    return [snapshot.source, snapshot.contentType, snapshot.version, loaderScope, query, String(startOffset)].join('|');
  }, []);

  const fetchSearchPage = useCallback(async (
    query:       string,
    snapshot:    Filters,
    startOffset: number,
    ctx:         SearchFetchContext,
    meta:        { cacheHit: boolean },
  ): Promise<SearchPage> => {
    const key    = buildSearchKey(query, snapshot, startOffset);
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiresAt > Date.now()) { meta.cacheHit = true; return cached.page; }

    const inflight = inflightRef.current.get(key);
    if (inflight) { meta.cacheHit = true; return inflight; }

    const req = ctx.service.searchProjects(query, snapshot, startOffset, ctx.signal)
      .then(page => {
        cacheRef.current.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, page });
        return page;
      })
      .finally(() => { inflightRef.current.delete(key); });

    inflightRef.current.set(key, req);
    return req;
  }, [buildSearchKey]);

  const runSearch = useCallback(async (
    query:         string,
    snapshot:      Filters,
    startOffset:   number,
    append:        boolean,
    interactionId: number,
  ) => {
    if (!snapshot.version) return;

    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    // Remove inflight entry for this key so the aborted promise isn't reused.
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
      const service = (() => {
        switch (snapshot.source) {
          case 'modrinth':  return modrinthService;
          case 'pvprp':     return pvprpService;
          case 'optifine':  return optifineService;
          default:          return curseforgeService;
        }
      })();
      const fetchCtx: SearchFetchContext = { service, signal: ctrl.signal };
      const fetchMeta = { cacheHit: false };
      let page     = await fetchSearchPage(query, snapshot, startOffset, fetchCtx, fetchMeta);
      let usedVersion = snapshot.version;
      let executedQuery = query;
      let termSimplificationAttempts = 0;
      let versionFallbackAttempts = 0;
      const versionFallbackTried: string[] = [];
      let strategy: SearchFallbackDebugMeta['strategy'] = 'none';
      const canUseFallback = !append && !fallbackUsageRef.current.get(interactionId);

      // Fallback 1: multi-word query with no hits → retry with longest single term (1 extra call)
      if (
        canUseFallback && !append &&
        page.hits.length === 0 && query.includes(' ') &&
        SEARCH_FALLBACK_LIMITS.maxTermSimplifications > 0
      ) {
        const term = query.split(/\s+/).sort((a, b) => b.length - a.length)[0];
        termSimplificationAttempts = 1;
        strategy      = 'term-simplification';
        executedQuery = term;
        page = await fetchSearchPage(term, snapshot, 0, fetchCtx, fetchMeta);
        fallbackUsageRef.current.set(interactionId, true);
      }

      // Fallback 2: still no results → try configured amount of immediately older versions
      if (
        canUseFallback && !fallbackUsageRef.current.get(interactionId) &&
        !append && page.hits.length === 0
      ) {
        const currentIdx = versions.indexOf(snapshot.version);
        const start = currentIdx >= 0 ? currentIdx + 1 : 0;
        const end   = Math.min(start + SEARCH_FALLBACK_LIMITS.maxVersionFallbacks, versions.length);
        for (let i = start; i < end; i++) {
          const fallbackSnapshot = { ...snapshot, version: versions[i] };
          versionFallbackAttempts += 1;
          versionFallbackTried.push(versions[i]);
          page = await fetchSearchPage(executedQuery, fallbackSnapshot, 0, fetchCtx, fetchMeta);
          if (page.hits.length > 0) {
            usedVersion = versions[i];
            setFallbackVersion(versions[i]);
            strategy = 'version-fallback';
            fallbackUsageRef.current.set(interactionId, true);
            break;
          }
        }
      }

      if (abortRef.current !== ctrl || requestIdRef.current !== requestId) return;

      const durationMs  = Math.round(performance.now() - t0);
      const loaderScope = snapshot.contentType === 'mod'    ? snapshot.loader
        : snapshot.contentType === 'shader'  ? snapshot.shaderLoader
        : snapshot.contentType === 'plugin'  ? snapshot.pluginLoader
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
            requestId, originalQuery: query, executedQuery,
            originalVersion: snapshot.version, usedVersion,
            termSimplificationAttempts, versionFallbackAttempts, versionFallbackTried,
            strategy, resultedInHits: page.hits.length > 0,
          });
        };
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
          (document as Document & { startViewTransition(cb: () => void): unknown })
            .startViewTransition(() => flushSync(commitResults));
        } else {
          commitResults();
        }
        captureEvent({
          type: 'search', ts: Date.now(), query: executedQuery,
          source: snapshot.source, version: usedVersion,
          contentType: snapshot.contentType, loader: loaderScope, durationMs,
          resultCount: page.hits.length, totalHits: page.totalHits,
          cacheHit: fetchMeta.cacheHit, fallbackStrategy: strategy,
          fallbackVersion: usedVersion !== snapshot.version ? usedVersion : null,
          append: false,
        });
        if (page.hits.length === 0) {
          captureEvent({
            type: 'zero_results', ts: Date.now(), query: executedQuery,
            source: snapshot.source, version: snapshot.version,
            contentType: snapshot.contentType, fallbacksTried: versionFallbackTried,
          });
        }
      }
      setHasError(false);
    } catch (e) {
      if (abortRef.current !== ctrl || requestIdRef.current !== requestId) return;
      if ((e as Error).name !== 'AbortError') {
        setHasError(true);
        captureEvent({
          type: 'search_error', ts: Date.now(), query,
          source: snapshot.source, version: snapshot.version,
          contentType: snapshot.contentType, message: (e as Error).message ?? 'unknown',
        });
      }
    } finally {
      if (abortRef.current === ctrl) {
        if (append) setIsLoadingMore(false);
        else        setIsSearching(false);
      }
    }
  }, [fetchSearchPage, versions, buildSearchKey]);

  // ── Re-fetch when filters change ──────────────────────────────────────────
  useEffect(() => {
    if (!filters.version) return;
    const q = initialQueryRef.current ?? '';
    initialQueryRef.current = null;
    setSearchQuery(q);
    interactionIdRef.current += 1;
    fallbackUsageRef.current.delete(interactionIdRef.current);
    void runSearch(q, filters, 0, false, interactionIdRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source, filters.version, filters.contentType, filters.loader, filters.shaderLoader, filters.pluginLoader, runSearch]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  // ── Search actions ────────────────────────────────────────────────────────

  const triggerSearch = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const trimmed = searchQuery.trim();
    if (trimmed && trimmed.length < MIN_QUERY_LENGTH) return;
    interactionIdRef.current += 1;
    fallbackUsageRef.current.delete(interactionIdRef.current);
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
      fallbackUsageRef.current.delete(interactionIdRef.current);
      void runSearch('', filters, 0, false, interactionIdRef.current);
    } else {
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const next = val.trim();
        if (!next || next.length < MIN_QUERY_LENGTH) return;
        interactionIdRef.current += 1;
        fallbackUsageRef.current.delete(interactionIdRef.current);
        void runSearch(next, filters, 0, false, interactionIdRef.current);
      }, SEARCH_DEBOUNCE_MS);
    }
  }, [runSearch, filters]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') triggerSearch(); },
    [triggerSearch],
  );

  const clearSearch = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    setSearchQuery('');
    if (activeRef.current.query === '') return;
    interactionIdRef.current += 1;
    fallbackUsageRef.current.delete(interactionIdRef.current);
    void runSearch('', filters, 0, false, interactionIdRef.current);
  }, [runSearch, filters]);

  const loadMore = useCallback(() => {
    const { query, filters: f } = activeRef.current;
    interactionIdRef.current += 1;
    fallbackUsageRef.current.delete(interactionIdRef.current);
    void runSearch(query, f, offset, true, interactionIdRef.current);
  }, [runSearch, offset]);

  return {
    searchQuery, isSearching, isLoadingMore, hasError, results, offset, hasMore,
    fallbackVersion, searchDebugMeta, animatedIds,
    setSearchQuery, triggerSearch, handleQueryChange, handleKeyDown, clearSearch, loadMore,
  };
}
