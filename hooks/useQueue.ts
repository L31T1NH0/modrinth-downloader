import { useReducer, useEffect, useRef, useCallback } from 'react';
import * as modrinthService from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import {
  DownloadDomainError,
  downloadAsZip,
  downloadAsTarGz,
  downloadSingleFile,
  type DownloadItem,
} from '@/lib/download';
import type { FailureReason, Filters, ResolvedVersion } from '@/lib/modrinth/types';

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
  filters:       Filters;       // snapshot used for resolution and display
  status:        QueueItemStatus;
  resolved?:     ResolvedVersion;
  errorReason?:  'no_compatible_version' | FailureReason | 'threshold_exceeded';
  /** Per-file download progress 0–100 (meaningful during 'downloading'). */
  progress:      number;
  isDependency:  boolean;
  dependencyOf?: string;        // project_id of the parent that introduced this dep
}

export interface DependencyWarning {
  parentQueueKey: string;
  parentId:       string;
  dependencyId:   string;
  reason:         FailureReason;
}

interface QueueState {
  entries:             QueueEntry[];
  dependencyWarnings:  DependencyWarning[];
  isDownloading:       boolean;
  zipProgress:         number;        // overall ZIP build progress 0–100
}

type QueueAction =
  | { type: 'ADD';              entry: Omit<QueueEntry, 'queueKey' | 'progress'> }
  | { type: 'REMOVE';           queueKey: string }
  | { type: 'RESOLVE';          queueKey: string; version: ResolvedVersion }
  | { type: 'ERROR';            queueKey: string; reason: QueueEntry['errorReason'] }
  | { type: 'RETRY';            queueKey: string }
  | { type: 'SET_STATUS';       queueKey: string; status: QueueItemStatus }
  | { type: 'SET_PROGRESS';     queueKey: string; progress: number }
  | { type: 'ADD_DEP_WARNING';  warning: DependencyWarning }
  | { type: 'CLEAR_DEP_WARNINGS'; parentQueueKey: string }
  | { type: 'SET_DOWNLOADING';  value: boolean }
  | { type: 'SET_ZIP_PROGRESS'; progress: number }
  | { type: 'CLEAR' }
  | { type: 'RESTORE';          entries: QueueEntry[] };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function patchEntry(
  entries: QueueEntry[],
  queueKey: string,
  patch: Partial<QueueEntry>,
): QueueEntry[] {
  return entries.map(e => (e.queueKey === queueKey ? { ...e, ...patch } : e));
}

function getRelevantLoader(filters: Filters): string {
  if (filters.contentType === 'mod') return filters.loader;
  if (filters.contentType === 'shader') return filters.shaderLoader ?? 'none';
  if (filters.contentType === 'plugin') return filters.pluginLoader ?? 'none';
  return 'none';
}

function getCanonicalQueueKey(entry: Pick<QueueEntry, 'id' | 'filters'>): string {
  const { id, filters } = entry;
  return [
    id,
    filters.source,
    filters.contentType,
    filters.version,
    getRelevantLoader(filters),
  ].join('::');
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

function inferDownloadErrorReason(
  error: unknown,
): FailureReason | 'threshold_exceeded' {
  if (error instanceof DownloadDomainError) return 'threshold_exceeded';
  return 'network';
}

function reducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'ADD':
      // Duplicate prevention uses a stable, filter-aware key.
      {
        const queueKey = getCanonicalQueueKey(action.entry);
        if (state.entries.some(e => e.queueKey === queueKey)) return state;
        return {
          ...state,
          entries: [...state.entries, { ...action.entry, queueKey, progress: 0 }],
        };
      }

    case 'REMOVE':
      return {
        ...state,
        entries: state.entries.filter(e => e.queueKey !== action.queueKey),
        dependencyWarnings: state.dependencyWarnings.filter(w => w.parentQueueKey !== action.queueKey),
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
        entries: patchEntry(state.entries, action.queueKey, {
          status: 'error', errorReason: action.reason,
        }),
      };

    case 'RETRY':
      return {
        ...state,
        entries: patchEntry(state.entries, action.queueKey, {
          status: 'pending', errorReason: undefined, progress: 0,
        }),
        dependencyWarnings: state.dependencyWarnings.filter(w => w.parentQueueKey !== action.queueKey),
      };

    case 'SET_STATUS':
      return { ...state, entries: patchEntry(state.entries, action.queueKey, { status: action.status }) };

    case 'SET_PROGRESS':
      return { ...state, entries: patchEntry(state.entries, action.queueKey, { progress: action.progress }) };

    case 'ADD_DEP_WARNING':
      return {
        ...state,
        dependencyWarnings: [...state.dependencyWarnings, action.warning],
      };

    case 'CLEAR_DEP_WARNINGS':
      return {
        ...state,
        dependencyWarnings: state.dependencyWarnings.filter(w => w.parentQueueKey !== action.parentQueueKey),
      };

    case 'SET_DOWNLOADING':
      return { ...state, isDownloading: action.value, zipProgress: action.value ? 0 : state.zipProgress };

    case 'SET_ZIP_PROGRESS':
      return { ...state, zipProgress: action.progress };

    case 'CLEAR':
      return { ...state, entries: [], dependencyWarnings: [], zipProgress: 0 };

    case 'RESTORE':
      return { ...state, entries: action.entries };

    default:
      return state;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'modrinth-queue-v4';

function persist(entries: QueueEntry[]): void {
  try {
    // Skip entries that have no useful state to restore.
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
      // Normalize transient states: items interrupted mid-download or
      // mid-resolve are set back to their closest recoverable state.
      status: e.status === 'downloading'
        ? 'ready'
        : e.status === 'resolving'
        ? 'pending'
        : e.status,
    }));
  } catch {
    return [];
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseQueueReturn {
  entries:             QueueEntry[];
  dependencyWarnings:  DependencyWarning[];
  isDownloading:       boolean;
  zipProgress:         number;
  readyCount:          number;
  add:                 (id: string, title: string, iconUrl: string | null, filters: Filters) => void;
  remove:              (queueKey: string) => void;
  retry:               (queueKey: string) => void;
  clear:               () => void;
  downloadZip:         (format?: 'zip' | 'tar.gz') => Promise<void>;
}

export function useQueue(): UseQueueReturn {
  const [state, dispatch] = useReducer(reducer, {
    entries: [],
    dependencyWarnings: [],
    isDownloading: false,
    zipProgress: 0,
  });

  // ── Restore from localStorage on mount (client-only) ─────────────────────
  useEffect(() => {
    const saved = restore();
    if (saved.length) dispatch({ type: 'RESTORE', entries: saved });
  }, []);

  // ── Persist on every queue change ────────────────────────────────────────
  useEffect(() => {
    persist(state.entries);
  }, [state.entries]);

  // ── Auto-resolve pending entries ──────────────────────────────────────────
  // `resolvingRef` tracks queue keys currently in-flight so the effect never starts
  // duplicate resolution when entries change for unrelated reasons.
  const resolvingRef = useRef(new Set<string>());

  useEffect(() => {
    for (const entry of state.entries) {
      if (entry.status !== 'pending') continue;
      if (resolvingRef.current.has(entry.queueKey)) continue;

      resolvingRef.current.add(entry.queueKey);
      dispatch({ type: 'SET_STATUS', queueKey: entry.queueKey, status: 'resolving' });

      const service = getService(entry.filters);
      service.resolveProjectVersion(entry.id, entry.filters)
        .then(async result => {
          if (!result.ok) {
            dispatch({ type: 'ERROR', queueKey: entry.queueKey, reason: result.reason });
            return;
          }

          dispatch({ type: 'RESOLVE', queueKey: entry.queueKey, version: result.version });
          dispatch({ type: 'CLEAR_DEP_WARNINGS', parentQueueKey: entry.queueKey });

          // Auto-add required dependencies. The ADD reducer action deduplicates,
          // so already-queued deps are silently skipped.
          const required = result.version.dependencies.filter(
            d => d.dependencyType === 'required',
          );
          for (const dep of required) {
            try {
              const info = await service.fetchProjectInfo(dep.projectId);
              dispatch({
                type: 'ADD',
                entry: {
                  id:           dep.projectId,
                  title:        info.title,
                  iconUrl:      info.iconUrl,
                  filters:      entry.filters,
                  status:       'pending',
                  isDependency: true,
                  dependencyOf: entry.id,
                },
              });
            } catch (error) {
              dispatch({
                type: 'ADD_DEP_WARNING',
                warning: {
                  parentQueueKey: entry.queueKey,
                  parentId: entry.id,
                  dependencyId: dep.projectId,
                  reason: inferFailureReason(error),
                },
              });
            }
          }
        })
        .finally(() => {
          resolvingRef.current.delete(entry.queueKey);
        });
    }
  // We intentionally only depend on entries to react to new pending items.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.entries]);

  // ── Public API ────────────────────────────────────────────────────────────

  const add = useCallback(
    (id: string, title: string, iconUrl: string | null, filters: Filters) => {
      dispatch({
        type: 'ADD',
        entry: { id, title, iconUrl, filters, status: 'pending', isDependency: false },
      });
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
      (e): e is QueueEntry & { resolved: ResolvedVersion } =>
        e.status === 'ready' && e.resolved !== undefined,
    ).sort((a, b) => a.resolved.file.size - b.resolved.file.size);
    if (!ready.length || state.isDownloading) return;

    dispatch({ type: 'SET_DOWNLOADING', value: true });
    ready.forEach(e => dispatch({ type: 'SET_STATUS', queueKey: e.queueKey, status: 'downloading' }));

    // Group entries by source + contentType so files from different tabs
    // are never bundled into the same archive.
    const groups = new Map<string, (QueueEntry & { resolved: ResolvedVersion })[]>();
    for (const entry of ready) {
      const key = `${entry.filters.source}-${entry.filters.contentType}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const totalFiles  = ready.length;
    let filesComplete = 0;
    const failedReasons = new Map<string, QueueEntry['errorReason']>();

    for (const [key, groupEntries] of groups) {
      const items: DownloadItem[] = groupEntries.map(e => ({
        id:       e.queueKey,
        filename: e.resolved.file.filename,
        url:      e.resolved.file.url,
        sizeBytes: e.resolved.file.size,
      }));

      if (items.length === 1) {
        // Single file in this group — download directly, no archive.
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
        // Multiple files in this group — bundle into an archive.
        const archiveName = `${key}s`; // e.g. "modrinth-mods"
        const downloadFn  = format === 'tar.gz' ? downloadAsTarGz : downloadAsZip;

        try {
          const failed = await downloadFn(
            items,
            archiveName,
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
          groupEntries.forEach((entry) => {
            dispatch({ type: 'ERROR', queueKey: entry.queueKey, reason });
            failedReasons.set(entry.queueKey, reason);
          });
          filesComplete += items.length;
        }
      }
    }

    ready.forEach(e => {
      const reason = failedReasons.get(e.queueKey);
      if (reason) {
        dispatch({ type: 'ERROR', queueKey: e.queueKey, reason });
      } else {
        dispatch({ type: 'SET_STATUS', queueKey: e.queueKey, status: 'done' });
      }
    });

    const succeeded = ready.filter(e => !failedReasons.has(e.queueKey));
    if (succeeded.length > 0) {
      fetch('/api/track-download', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mods: succeeded.map(e => ({
            id:          e.id,
            name:        e.title,
            source:      e.filters.source,
            iconUrl:     e.iconUrl ?? undefined,
            contentType: e.filters.contentType,
            version:     e.filters.version || undefined,
          })),
        }),
      }).catch(() => { /* tracking failure never affects downloads */ });
    }

    dispatch({ type: 'SET_DOWNLOADING', value: false });
  // entries + isDownloading are the only runtime deps needed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.entries, state.isDownloading]);

  const readyCount = state.entries.filter(e => e.status === 'ready').length;

  return {
    entries:             state.entries,
    dependencyWarnings:  state.dependencyWarnings,
    isDownloading:       state.isDownloading,
    zipProgress:         state.zipProgress,
    readyCount,
    add, remove, retry, clear, downloadZip,
  };
}
