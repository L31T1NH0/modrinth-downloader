'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import * as modrinthService   from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import * as pvprpService      from '@/lib/scrapers/pvprp';
import * as optifineService   from '@/lib/scrapers/optifine';
import type { ContentType, Filters, Loader, PluginLoader, ShaderLoader, Source } from '@/lib/modrinth/types';
import { captureEvent } from '@/lib/debugCapture';
import { BEDROCK_CONTENT_TYPES, DEFAULT_FILTERS } from '@/lib/filterConfig';

export interface UseFiltersReturn {
  filters:                       Filters;
  versions:                      string[];
  filtersRef:                    MutableRefObject<Filters>;
  showMobileSourceSuggestion:    boolean;
  setFilters:                    Dispatch<SetStateAction<Filters>>;
  lockRestoredVersion:           (v: string) => void;
  setSource:                     (s: Source) => void;
  setVersion:                    (v: string) => void;
  setLoader:                     (l: Loader) => void;
  toggleShaderLoader:            (sl: ShaderLoader) => void;
  togglePluginLoader:            (pl: PluginLoader) => void;
  setContentType:                (ct: ContentType) => void;
  dismissMobileSourceSuggestion: () => void;
  acceptMobileSourceSuggestion:  () => void;
}

export function useFilters(): UseFiltersReturn {
  const [filters,  setFilters]  = useState<Filters>(DEFAULT_FILTERS);
  const [versions, setVersions] = useState<string[]>([]);
  const [showMobileSourceSuggestion, setShowMobileSourceSuggestion] = useState(false);

  const filtersRef          = useRef(filters);
  filtersRef.current        = filters;
  const restoredVersionRef  = useRef<string | null>(null);
  const preservedVersionRef = useRef<string | null>(null);

  // ── Persist filters ───────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('modrinth-dl:filters', JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  // ── Restore persisted filters on mount ───────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('modrinth-dl:filters');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Filters>;
        preservedVersionRef.current = parsed.version ?? null;
        setFilters(prev => ({ ...prev, ...parsed, version: '' }));
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load MC versions when source changes ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setVersions([]);
    setFilters(prev => ({ ...prev, version: '' }));
    const fetchVersions = (() => {
      switch (filters.source) {
        case 'modrinth':  return modrinthService.fetchGameVersions();
        case 'pvprp':     return pvprpService.fetchGameVersions();
        case 'optifine':  return optifineService.fetchGameVersions();
        default:          return curseforgeService.fetchGameVersions(filters.source);
      }
    })();
    fetchVersions
      .then(releases => {
        if (cancelled) return;
        setVersions(releases);
        if (releases.length) {
          const locked    = restoredVersionRef.current;
          restoredVersionRef.current = null;
          const preserved = preservedVersionRef.current;
          preservedVersionRef.current = null;
          const preferred = locked ?? (preserved && releases.includes(preserved) ? preserved : null) ?? releases[0];
          setFilters(prev => ({ ...prev, version: preferred }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source]);

  // ── Suggest Bedrock on first mobile access ────────────────────────────────
  useEffect(() => {
    const hasShareData = new URLSearchParams(window.location.search).has('data');
    if (hasShareData) return;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!isMobile) return;
    let decision: string | null = null;
    try { decision = localStorage.getItem('modrinth-dl:mobileSourceSuggestion'); } catch { /* ignore */ }
    if (decision === 'accepted') { setSource('curseforge-bedrock'); return; }
    if (decision === 'dismissed') return;
    setShowMobileSourceSuggestion(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const lockRestoredVersion = useCallback((v: string) => {
    restoredVersionRef.current = v;
  }, []);

  const setSource = useCallback((s: Source) => {
    captureEvent({ type: 'filter_change', ts: Date.now(), field: 'source', from: filtersRef.current.source, to: s });
    setFilters(prev => {
      const toBedrockBoundary   = s === 'curseforge-bedrock' && !BEDROCK_CONTENT_TYPES.has(prev.contentType);
      const fromBedrockBoundary = s !== 'curseforge-bedrock' &&  BEDROCK_CONTENT_TYPES.has(prev.contentType);
      const contentType =
        s === 'pvprp'    && prev.contentType !== 'resourcepack' ? 'resourcepack' :
        s === 'optifine' && prev.contentType !== 'mod'          ? 'mod' :
        toBedrockBoundary   ? 'addon' :
        fromBedrockBoundary ? 'mod' :
        prev.contentType;
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

  return {
    filters, versions, filtersRef, showMobileSourceSuggestion,
    setFilters, lockRestoredVersion,
    setSource, setVersion, setLoader, toggleShaderLoader, togglePluginLoader,
    setContentType, dismissMobileSourceSuggestion, acceptMobileSourceSuggestion,
  };
}
