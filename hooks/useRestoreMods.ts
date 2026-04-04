import { useState, useRef, useCallback } from 'react';
import * as modrinthService   from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import type { Filters, Loader } from '@/lib/modrinth/types';
import type { UseQueueReturn } from './useQueue';
import type { ModListState } from '@/lib/stateUtils';

// ─── Concurrency helper ───────────────────────────────────────────────────────

/**
 * Maximum number of simultaneous fetchProjectInfo requests during restoration.
 * Balances speed against API rate-limiting and client-side memory pressure.
 * Large lists are processed in rolling windows of this size rather than all at once.
 */
const FETCH_CONCURRENCY = 5;

/**
 * Runs `fn` on each item with at most `limit` concurrent executions.
 * Returns results in input order, equivalent in shape to Promise.allSettled.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn:    (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx], idx) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  // Spawn `limit` workers (or fewer if the list is smaller)
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseRestoreModsReturn {
  isRestoring: boolean;
  /** null = no restore attempted yet; 0 = all succeeded; >0 = partial failure */
  failedCount: number | null;
  restoreMods: (state: ModListState) => Promise<void>;
}

export function useRestoreMods(
  queue:      UseQueueReturn,
  setFilters: React.Dispatch<React.SetStateAction<Filters>>,
): UseRestoreModsReturn {
  const [isRestoring, setIsRestoring] = useState(false);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const inProgressRef = useRef(false); // prevents overlapping restore calls

  const restoreMods = useCallback(async (state: ModListState) => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;

    try {
      const loader: Loader = state.loader === 'forge' ? 'forge' : 'fabric';
      const restoredFilters: Filters = {
        source:       state.source,
        version:      state.version,
        contentType:  state.contentType,
        loader,
        shaderLoader: state.contentType === 'shader' ? (state.shaderLoader ?? 'iris') : null,
        pluginLoader: state.contentType === 'plugin' ? (state.pluginLoader ?? 'paper') : null,
      };

      // Apply filters and clear queue before starting async work so the UI
      // immediately reflects the new context even while metadata is loading.
      setFilters(restoredFilters);
      queue.clear();
      setIsRestoring(true);
      setFailedCount(null);

      const service = state.source === 'modrinth' ? modrinthService : curseforgeService;

      // Work exclusively from incoming state.mods — not from current queue entries,
      // which were just cleared and could be stale under any concurrent scenario.
      const results = await mapWithConcurrency(
        state.mods,
        FETCH_CONCURRENCY,
        id => service.fetchProjectInfo(id),
      );

      let failed = 0;
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { title, iconUrl } = result.value;
          // queue.add deduplicates by project ID — safe to call unconditionally
          queue.add(state.mods[i], title, iconUrl, restoredFilters);
        } else {
          failed++;
        }
      });

      setFailedCount(failed);
      setIsRestoring(false);
    } catch {
      setIsRestoring(false);
      setFailedCount(prev => prev ?? state.mods.length);
    } finally {
      inProgressRef.current = false;
    }
  }, [queue, setFilters]);

  return { isRestoring, failedCount, restoreMods };
}
