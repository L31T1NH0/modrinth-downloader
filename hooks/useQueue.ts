import { useReducer, useEffect, useRef, useCallback } from 'react';
import * as modrinthService from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import { downloadAsZip, downloadAsTarGz, downloadSingleFile, type DownloadItem } from '@/lib/download';
import type { Filters, ResolvedVersion } from '@/lib/modrinth/types';

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
  id:            string;
  title:         string;
  iconUrl:       string | null;
  filters:       Filters;       // snapshot used for resolution and display
  status:        QueueItemStatus;
  resolved?:     ResolvedVersion;
  errorReason?:  'no_compatible_version' | 'network';
  /** Per-file download progress 0–100 (meaningful during 'downloading'). */
  progress:      number;
  isDependency:  boolean;
  dependencyOf?: string;        // project_id of the parent that introduced this dep
}

interface QueueState {
  entries:     QueueEntry[];
  isDownloading: boolean;
  zipProgress:   number;        // overall ZIP build progress 0–100
}

type QueueAction =
  | { type: 'ADD';              entry: Omit<QueueEntry, 'progress'> }
  | { type: 'REMOVE';           id: string }
  | { type: 'RESOLVE';          id: string; version: ResolvedVersion }
  | { type: 'ERROR';            id: string; reason: QueueEntry['errorReason'] }
  | { type: 'RETRY';            id: string }
  | { type: 'SET_STATUS';       id: string; status: QueueItemStatus }
  | { type: 'SET_PROGRESS';     id: string; progress: number }
  | { type: 'SET_DOWNLOADING';  value: boolean }
  | { type: 'SET_ZIP_PROGRESS'; progress: number }
  | { type: 'CLEAR' }
  | { type: 'RESTORE';          entries: QueueEntry[] };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function patchEntry(
  entries: QueueEntry[],
  id: string,
  patch: Partial<QueueEntry>,
): QueueEntry[] {
  return entries.map(e => (e.id === id ? { ...e, ...patch } : e));
}

function reducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'ADD':
      // Strict duplicate prevention: same project ID regardless of filters.
      if (state.entries.some(e => e.id === action.entry.id)) return state;
      return {
        ...state,
        entries: [...state.entries, { ...action.entry, progress: 0 }],
      };

    case 'REMOVE':
      return { ...state, entries: state.entries.filter(e => e.id !== action.id) };

    case 'RESOLVE':
      return {
        ...state,
        entries: patchEntry(state.entries, action.id, {
          status: 'ready', resolved: action.version, errorReason: undefined,
        }),
      };

    case 'ERROR':
      return {
        ...state,
        entries: patchEntry(state.entries, action.id, {
          status: 'error', errorReason: action.reason,
        }),
      };

    case 'RETRY':
      return {
        ...state,
        entries: patchEntry(state.entries, action.id, {
          status: 'pending', errorReason: undefined, progress: 0,
        }),
      };

    case 'SET_STATUS':
      return { ...state, entries: patchEntry(state.entries, action.id, { status: action.status }) };

    case 'SET_PROGRESS':
      return { ...state, entries: patchEntry(state.entries, action.id, { progress: action.progress }) };

    case 'SET_DOWNLOADING':
      return { ...state, isDownloading: action.value, zipProgress: action.value ? 0 : state.zipProgress };

    case 'SET_ZIP_PROGRESS':
      return { ...state, zipProgress: action.progress };

    case 'CLEAR':
      return { ...state, entries: [], zipProgress: 0 };

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
  entries:      QueueEntry[];
  isDownloading:boolean;
  zipProgress:  number;
  readyCount:   number;
  add:          (id: string, title: string, iconUrl: string | null, filters: Filters) => void;
  remove:       (id: string) => void;
  retry:        (id: string) => void;
  clear:        () => void;
  downloadZip:  (format?: 'zip' | 'tar.gz') => Promise<void>;
}

export function useQueue(): UseQueueReturn {
  const [state, dispatch] = useReducer(reducer, { entries: [], isDownloading: false, zipProgress: 0 });

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
  // `resolvingRef` tracks IDs currently in-flight so the effect never starts
  // duplicate resolution when entries change for unrelated reasons.
  const resolvingRef = useRef(new Set<string>());

  useEffect(() => {
    for (const entry of state.entries) {
      if (entry.status !== 'pending') continue;
      if (resolvingRef.current.has(entry.id)) continue;

      resolvingRef.current.add(entry.id);
      dispatch({ type: 'SET_STATUS', id: entry.id, status: 'resolving' });

      const service = getService(entry.filters);
      service.resolveProjectVersion(entry.id, entry.filters)
        .then(async result => {
          if (!result.ok) {
            dispatch({ type: 'ERROR', id: entry.id, reason: result.reason });
            return;
          }

          dispatch({ type: 'RESOLVE', id: entry.id, version: result.version });

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
            } catch { /* skip deps whose info can't be fetched */ }
          }
        })
        .finally(() => {
          resolvingRef.current.delete(entry.id);
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

  const remove = useCallback((id: string) => {
    resolvingRef.current.delete(id);
    dispatch({ type: 'REMOVE', id });
  }, []);

  const retry = useCallback((id: string) => {
    dispatch({ type: 'RETRY', id });
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
    ready.forEach(e => dispatch({ type: 'SET_STATUS', id: e.id, status: 'downloading' }));

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
    const allFailed:  string[] = [];

    for (const [key, groupEntries] of groups) {
      const items: DownloadItem[] = groupEntries.map(e => ({
        id:       e.id,
        filename: e.resolved.file.filename,
        url:      e.resolved.file.url,
        sizeBytes: e.resolved.file.size,
      }));

      if (items.length === 1) {
        // Single file in this group — download directly, no archive.
        const entry = groupEntries[0];
        const ok = await downloadSingleFile(
          items[0],
          (id, pct) => {
            dispatch({ type: 'SET_PROGRESS', id, progress: pct });
            const overall = Math.round(((filesComplete + pct / 100) / totalFiles) * 100);
            dispatch({ type: 'SET_ZIP_PROGRESS', progress: overall });
          },
        );
        if (!ok) allFailed.push(entry.id);
        filesComplete += 1;
        dispatch({ type: 'SET_ZIP_PROGRESS', progress: Math.round((filesComplete / totalFiles) * 100) });
      } else {
        // Multiple files in this group — bundle into an archive.
        const archiveName = `${key}s`; // e.g. "modrinth-mods"
        const downloadFn  = format === 'tar.gz' ? downloadAsTarGz : downloadAsZip;

        const failed = await downloadFn(
          items,
          archiveName,
          (id, pct) => dispatch({ type: 'SET_PROGRESS', id, progress: pct }),
          (pct) => {
            const groupProgress = (pct / 100) * items.length;
            const overall = Math.round(((filesComplete + groupProgress) / totalFiles) * 100);
            dispatch({ type: 'SET_ZIP_PROGRESS', progress: overall });
          },
        );
        allFailed.push(...failed);
        filesComplete += items.length;
      }
    }

    ready.forEach(e => {
      if (allFailed.includes(e.id)) {
        dispatch({ type: 'ERROR', id: e.id, reason: 'network' });
      } else {
        dispatch({ type: 'SET_STATUS', id: e.id, status: 'done' });
      }
    });

    dispatch({ type: 'SET_DOWNLOADING', value: false });
  // entries + isDownloading are the only runtime deps needed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.entries, state.isDownloading]);

  const readyCount = state.entries.filter(e => e.status === 'ready').length;

  return {
    entries:       state.entries,
    isDownloading: state.isDownloading,
    zipProgress:   state.zipProgress,
    readyCount,
    add, remove, retry, clear, downloadZip,
  };
}
