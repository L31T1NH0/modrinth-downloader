import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { Dispatch } from 'react';
import * as modrinthService   from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import {
  DownloadDomainError,
  downloadAsZip,
  downloadAsTarGz,
  downloadSingleFile,
  type DownloadItem,
} from '@/lib/download';
import type { FailureReason, Filters, ResolvedVersion } from '@/lib/modrinth/types';
import { trackDownload } from '@/lib/tracking';

function getService(filters: Filters) {
  return filters.source === 'modrinth' ? modrinthService : curseforgeService;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueueItemStatus =
  | 'pending'     // added; awaiting automatic resolution
  | 'resolving'   // currently fetching compatible version
  | 'ready'       // resolved; waiting for user to trigger download
  | 'downloading' // included in an active ZIP download
  | 'done'        // successfully downloaded
  | 'error';      // resolution or download failed

export interface QueueEntry {
  queueKey:      string;
  id:            string;
  title:         string;
  iconUrl:       string | null;
  filters:       Filters;
  status:        QueueItemStatus;
  resolved?:     ResolvedVersion;
  errorReason?:  'no_compatible_version' | FailureReason | 'threshold_exceeded';
  /** Per-file download progress 0–100 (meaningful during 'downloading'). */
  progress:      number;
  isDependency:  boolean;
  dependencyOf?: string;
}

export interface DependencyWarning {
  parentQueueKey: string;
  parentId:       string;
  dependencyId:   string;
  reason:         FailureReason;
}

export interface ConflictWarning {
  queueKeyA: string;
  titleA:    string;
  queueKeyB: string;
  titleB:    string;
}

interface QueueState {
  entries:            QueueEntry[];
  dependencyWarnings: DependencyWarning[];
  conflictWarnings:   ConflictWarning[];
  isDownloading:      boolean;
  zipProgress:        number;
}

type QueueAction =
  | { type: 'ADD';                   entry: Omit<QueueEntry, 'queueKey' | 'progress'> }
  | { type: 'REMOVE';                queueKey: string }
  | { type: 'RESOLVE';               queueKey: string; version: ResolvedVersion }
  | { type: 'ERROR';                 queueKey: string; reason: QueueEntry['errorReason'] }
  | { type: 'RETRY';                 queueKey: string }
  | { type: 'SET_STATUS';            queueKey: string; status: QueueItemStatus }
  | { type: 'SET_PROGRESS';          queueKey: string; progress: number }
  | { type: 'ADD_DEP_WARNING';       warning: DependencyWarning }
  | { type: 'CLEAR_DEP_WARNINGS';    parentQueueKey: string }
  | { type: 'ADD_CONFLICT_WARNING';  warning: ConflictWarning }
  | { type: 'CLEAR_CONFLICT_WARNINGS'; queueKey: string }
  | { type: 'SET_DOWNLOADING';       value: boolean }
  | { type: 'SET_ZIP_PROGRESS';      progress: number }
  | { type: 'CLEAR' }
  | { type: 'RESTORE';               entries: QueueEntry[] };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function patchEntry(
  entries: QueueEntry[],
  queueKey: string,
  patch: Partial<QueueEntry>,
): QueueEntry[] {
  return entries.map(e => (e.queueKey === queueKey ? { ...e, ...patch } : e));
}

function getRelevantLoader(filters: Filters): string {
  if (filters.contentType === 'mod')    return filters.loader;
  if (filters.contentType === 'shader') return filters.shaderLoader ?? 'none';
  if (filters.contentType === 'plugin') return filters.pluginLoader ?? 'none';
  return 'none';
}

function getCanonicalQueueKey(entry: Pick<QueueEntry, 'id' | 'filters'>): string {
  const { id, filters } = entry;
  return [id, filters.source, filters.contentType, filters.version, getRelevantLoader(filters)].join('::');
}

function inferFailureReason(error: unknown): FailureReason {
  const asAny = error as { status?: number; message?: string } | null;
  const status = typeof asAny?.status === 'number'
    ? asAny.status
    : (() => {
        if (typeof asAny?.message !== 'string') return undefined;
        const match = asAny.message.match(/\bHTTP\s+(\d{3})\b/i);
        return match ? Number(match[1]) : undefined;
      })();
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'network';
}

function inferDownloadErrorReason(error: unknown): FailureReason | 'threshold_exceeded' {
  if (error instanceof DownloadDomainError) return 'threshold_exceeded';
  return 'network';
}

function reducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'ADD': {
      const queueKey = getCanonicalQueueKey(action.entry);
      if (state.entries.some(e => e.queueKey === queueKey)) return state;
      return { ...state, entries: [...state.entries, { ...action.entry, queueKey, progress: 0 }] };
    }
    case 'REMOVE':
      return {
        ...state,
        entries: state.entries.filter(e => e.queueKey !== action.queueKey),
        dependencyWarnings: state.dependencyWarnings.filter(w => w.parentQueueKey !== action.queueKey),
        conflictWarnings: state.conflictWarnings.filter(
          w => w.queueKeyA !== action.queueKey && w.queueKeyB !== action.queueKey,
        ),
      };
    case 'RESOLVE':
      return {
        ...state,
        entries: patchEntry(state.entries, action.queueKey, {
          status: 'ready', resolved: action.version, errorReason: undefined,
        }),
      };
    case 'ERROR':
      return {
        ...state,
        entries: patchEntry(state.entries, action.queueKey, { status: 'error', errorReason: action.reason }),
      };
    case 'RETRY':
      return {
        ...state,
        entries: patchEntry(state.entries, action.queueKey, { status: 'pending', errorReason: undefined, progress: 0 }),
        dependencyWarnings: state.dependencyWarnings.filter(w => w.parentQueueKey !== action.queueKey),
      };
    case 'SET_STATUS':
      return { ...state, entries: patchEntry(state.entries, action.queueKey, { status: action.status }) };
    case 'SET_PROGRESS':
      return { ...state, entries: patchEntry(state.entries, action.queueKey, { progress: action.progress }) };
    case 'ADD_DEP_WARNING':
      return { ...state, dependencyWarnings: [...state.dependencyWarnings, action.warning] };
    case 'CLEAR_DEP_WARNINGS':
      return { ...state, dependencyWarnings: state.dependencyWarnings.filter(w => w.parentQueueKey !== action.parentQueueKey) };
    case 'ADD_CONFLICT_WARNING':
      return { ...state, conflictWarnings: [...state.conflictWarnings, action.warning] };
    case 'CLEAR_CONFLICT_WARNINGS':
      return {
        ...state,
        conflictWarnings: state.conflictWarnings.filter(
          w => w.queueKeyA !== action.queueKey && w.queueKeyB !== action.queueKey,
        ),
      };
    case 'SET_DOWNLOADING':
      return { ...state, isDownloading: action.value, zipProgress: action.value ? 0 : state.zipProgress };
    case 'SET_ZIP_PROGRESS':
      return { ...state, zipProgress: action.progress };
    case 'CLEAR':
      return { ...state, entries: [], dependencyWarnings: [], conflictWarnings: [], zipProgress: 0 };
    case 'RESTORE':
      return { ...state, entries: action.entries, conflictWarnings: [] };
    default:
      return state;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'modrinth-queue-v4';

function persist(entries: QueueEntry[]): void {
  try {
    const saveable = entries.filter(e => e.status !== 'resolving');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable));
  } catch { /* quota or private-browsing — silently ignore */ }
}

function restore(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries: QueueEntry[] = JSON.parse(raw);
    return entries.map(e => ({
      ...e,
      queueKey: e.queueKey ?? getCanonicalQueueKey(e),
      progress: 0,
      // Normalize transient states interrupted mid-session back to recoverable states.
      status: e.status === 'downloading' ? 'ready'
            : e.status === 'resolving'   ? 'pending'
            : e.status,
    }));
  } catch {
    return [];
  }
}

// ─── Async resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a single pending entry: fetches the compatible version, dispatches
 * the result, and auto-adds any required dependencies.
 * Must only be called once per entry (tracked by the caller via resolvingSet).
 */
async function resolveEntry(
  entry:        QueueEntry,
  resolvingSet: Set<string>,
  dispatch:     Dispatch<QueueAction>,
  getEntries:   () => QueueEntry[],
): Promise<void> {
  dispatch({ type: 'SET_STATUS', queueKey: entry.queueKey, status: 'resolving' });
  const service = getService(entry.filters);

  try {
    const result = await service.resolveProjectVersion(entry.id, entry.filters);

    if (!result.ok) {
      dispatch({ type: 'ERROR', queueKey: entry.queueKey, reason: result.reason });
      return;
    }

    dispatch({ type: 'RESOLVE', queueKey: entry.queueKey, version: result.version });
    dispatch({ type: 'CLEAR_DEP_WARNINGS',     parentQueueKey: entry.queueKey });
    dispatch({ type: 'CLEAR_CONFLICT_WARNINGS', queueKey:      entry.queueKey });

    // Check for incompatible mods already in the queue.
    const currentEntries = getEntries();
    for (const dep of result.version.dependencies) {
      if (dep.dependencyType !== 'incompatible') continue;
      const conflicting = currentEntries.find(e => e.id === dep.projectId && !e.isDependency);
      if (conflicting) {
        dispatch({
          type: 'ADD_CONFLICT_WARNING',
          warning: {
            queueKeyA: entry.queueKey,
            titleA:    entry.title,
            queueKeyB: conflicting.queueKey,
            titleB:    conflicting.title,
          },
        });
      }
    }

    // Auto-add required dependencies; ADD reducer deduplicates.
    const required = result.version.dependencies.filter(d => d.dependencyType === 'required');
    for (const dep of required) {
      try {
        const info = await service.fetchProjectInfo(dep.projectId);
        dispatch({
          type: 'ADD',
          entry: {
            id: dep.projectId, title: info.title, iconUrl: info.iconUrl,
            filters: entry.filters, status: 'pending',
            isDependency: true, dependencyOf: entry.id,
          },
        });
      } catch (error) {
        dispatch({
          type: 'ADD_DEP_WARNING',
          warning: {
            parentQueueKey: entry.queueKey, parentId: entry.id,
            dependencyId: dep.projectId, reason: inferFailureReason(error),
          },
        });
      }
    }
  } finally {
    resolvingSet.delete(entry.queueKey);
  }
}

// ─── Async download orchestration ─────────────────────────────────────────────

type ReadyEntry = QueueEntry & { resolved: ResolvedVersion };

/**
 * Downloads all groups of ready entries, reporting progress via dispatch.
 * Returns a map of queueKey → errorReason for any entries that failed.
 */
async function runDownloadGroups(
  groups:     Map<string, ReadyEntry[]>,
  totalFiles: number,
  format:     'zip' | 'tar.gz',
  dispatch:   Dispatch<QueueAction>,
): Promise<Map<string, QueueEntry['errorReason']>> {
  let filesComplete = 0;
  const failedReasons = new Map<string, QueueEntry['errorReason']>();

  for (const [key, groupEntries] of groups) {
    const items: DownloadItem[] = groupEntries.map(e => ({
      id:        e.queueKey,
      filename:  e.resolved.file.filename,
      url:       e.resolved.file.url,
      sizeBytes: e.resolved.file.size,
    }));

    if (items.length === 1) {
      const entry = groupEntries[0];
      const ok = await downloadSingleFile(
        items[0],
        (queueKey, pct) => {
          dispatch({ type: 'SET_PROGRESS', queueKey, progress: pct });
          const overall = Math.round(((filesComplete + pct / 100) / totalFiles) * 100);
          dispatch({ type: 'SET_ZIP_PROGRESS', progress: overall });
        },
      );
      if (!ok) failedReasons.set(entry.queueKey, 'network');
      filesComplete += 1;
      dispatch({ type: 'SET_ZIP_PROGRESS', progress: Math.round((filesComplete / totalFiles) * 100) });
    } else {
      const downloadFn = format === 'tar.gz' ? downloadAsTarGz : downloadAsZip;
      try {
        const failed = await downloadFn(
          items,
          `${key}s`, // e.g. "modrinth-mods"
          (queueKey, pct) => dispatch({ type: 'SET_PROGRESS', queueKey, progress: pct }),
          (pct) => {
            const groupProgress = (pct / 100) * items.length;
            const overall = Math.round(((filesComplete + groupProgress) / totalFiles) * 100);
            dispatch({ type: 'SET_ZIP_PROGRESS', progress: overall });
          },
        );
        failed.forEach(queueKey => failedReasons.set(queueKey, 'network'));
        filesComplete += items.length;
      } catch (error) {
        const reason = inferDownloadErrorReason(error);
        groupEntries.forEach(entry => {
          dispatch({ type: 'ERROR', queueKey: entry.queueKey, reason });
          failedReasons.set(entry.queueKey, reason);
        });
        filesComplete += items.length;
      }
    }
  }

  return failedReasons;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseQueueReturn {
  entries:            QueueEntry[];
  dependencyWarnings: DependencyWarning[];
  conflictWarnings:   ConflictWarning[];
  isDownloading:      boolean;
  zipProgress:        number;
  readyCount:         number;
  add:                (id: string, title: string, iconUrl: string | null, filters: Filters) => void;
  remove:             (queueKey: string) => void;
  retry:              (queueKey: string) => void;
  clear:              () => void;
  downloadZip:        (format?: 'zip' | 'tar.gz') => Promise<void>;
}

export function useQueue(): UseQueueReturn {
  const [state, dispatch] = useReducer(reducer, {
    entries: [], dependencyWarnings: [], conflictWarnings: [], isDownloading: false, zipProgress: 0,
  });

  // ── Restore from localStorage on mount ───────────────────────────────────
  useEffect(() => {
    const saved = restore();
    if (saved.length) dispatch({ type: 'RESTORE', entries: saved });
  }, []);

  // ── Persist on every queue change ────────────────────────────────────────
  useEffect(() => {
    persist(state.entries);
  }, [state.entries]);

  // ── Auto-resolve pending entries ──────────────────────────────────────────
  // resolvingRef tracks in-flight keys so the effect never starts duplicate
  // resolution when entries change for unrelated reasons.
  const resolvingRef  = useRef(new Set<string>());
  const entriesRef    = useRef(state.entries);
  entriesRef.current  = state.entries;

  useEffect(() => {
    for (const entry of state.entries) {
      if (entry.status !== 'pending') continue;
      if (resolvingRef.current.has(entry.queueKey)) continue;
      resolvingRef.current.add(entry.queueKey);
      void resolveEntry(entry, resolvingRef.current, dispatch, () => entriesRef.current);
    }
  // We intentionally only depend on entries to react to new pending items.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.entries]);

  // ── Public API ────────────────────────────────────────────────────────────

  const add = useCallback(
    (id: string, title: string, iconUrl: string | null, filters: Filters) => {
      dispatch({ type: 'ADD', entry: { id, title, iconUrl, filters, status: 'pending', isDependency: false } });
    },
    [],
  );

  const remove = useCallback((queueKey: string) => {
    resolvingRef.current.delete(queueKey);
    dispatch({ type: 'REMOVE', queueKey });
  }, []);

  const retry = useCallback((queueKey: string) => {
    dispatch({ type: 'RETRY', queueKey });
  }, []);

  const clear = useCallback(() => {
    resolvingRef.current.clear();
    dispatch({ type: 'CLEAR' });
  }, []);

  const downloadZip = useCallback(async (format: 'zip' | 'tar.gz' = 'zip') => {
    const ready = state.entries.filter(
      (e): e is ReadyEntry => e.status === 'ready' && e.resolved !== undefined,
    ).sort((a, b) => a.resolved.file.size - b.resolved.file.size);
    if (!ready.length || state.isDownloading) return;

    dispatch({ type: 'SET_DOWNLOADING', value: true });
    ready.forEach(e => dispatch({ type: 'SET_STATUS', queueKey: e.queueKey, status: 'downloading' }));

    // Group by source + contentType so files from different contexts aren't bundled together.
    const groups = new Map<string, ReadyEntry[]>();
    for (const entry of ready) {
      const key = `${entry.filters.source}-${entry.filters.contentType}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const failedReasons = await runDownloadGroups(groups, ready.length, format, dispatch);

    ready.forEach(e => {
      const reason = failedReasons.get(e.queueKey);
      if (reason) dispatch({ type: 'ERROR', queueKey: e.queueKey, reason });
      else         dispatch({ type: 'SET_STATUS', queueKey: e.queueKey, status: 'done' });
    });

    trackDownload(
      ready
        .filter(e => !failedReasons.has(e.queueKey))
        .map(e => ({
          id:          e.id,
          name:        e.title,
          source:      e.filters.source,
          iconUrl:     e.iconUrl ?? undefined,
          contentType: e.filters.contentType,
          version:     e.filters.version || undefined,
        })),
    );

    dispatch({ type: 'SET_DOWNLOADING', value: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.entries, state.isDownloading]);

  const readyCount = state.entries.filter(e => e.status === 'ready').length;

  return {
    entries: state.entries, dependencyWarnings: state.dependencyWarnings,
    conflictWarnings: state.conflictWarnings,
    isDownloading: state.isDownloading, zipProgress: state.zipProgress,
    readyCount, add, remove, retry, clear, downloadZip,
  };
}
