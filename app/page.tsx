'use client';

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';

const API = 'https://api.modrinth.com/v2';

// ─── Types ────────────────────────────────────────────────────────────────────

type Loader = 'fabric' | 'forge';
type ShaderLoader = 'iris' | 'optifine';
type ContentType = 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader';
type DlStatus = 'pending' | 'downloading' | 'done' | 'error';
type AddStatus = 'loading' | 'done' | 'error';

interface ModResult {
  project_id: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
}

interface ModFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

interface QueueItem {
  id: string;
  title: string;
  iconUrl: string | null;
  file: ModFile;
  versionName: string;
  sizeKb: number | null;
  contentType: ContentType;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOADERS: { id: Loader; label: string }[] = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
];

const CONTENT_TYPES: { id: ContentType; label: string; usesLoader: boolean }[] = [
  { id: 'mod',         label: 'Mods',          usesLoader: true  },
  { id: 'plugin',      label: 'Plugins',       usesLoader: false },
  { id: 'datapack',    label: 'Datapacks',     usesLoader: false },
  { id: 'resourcepack',label: 'Resourcepacks', usesLoader: false },
  { id: 'shader',      label: 'Shaders',       usesLoader: false },
];

const SHADER_LOADERS: { id: ShaderLoader; label: string }[] = [
  { id: 'iris',     label: 'Iris'     },
  { id: 'optifine', label: 'OptiFine' },
];

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}

function fmtSize(kb: number): string {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb + ' KB';
}

/** Build Modrinth search facets for the given filters. */
function buildFacets(type: ContentType, loader: Loader, shaderLoader: ShaderLoader | null, version: string): string[][] {
  const base: string[][] = [[`project_type:${type}`], [`versions:${version}`]];
  if (type === 'mod') base.splice(1, 0, [`categories:${loader}`]);
  if (type === 'shader' && shaderLoader) base.splice(1, 0, [`categories:${shaderLoader}`]);
  return base;
}

/** Build the version-fetch URL for adding to queue. */
function versionUrl(projectId: string, type: ContentType, loader: Loader, version: string): string {
  const params = new URLSearchParams({ game_versions: JSON.stringify([version]) });
  if (type === 'mod') params.set('loaders', JSON.stringify([loader]));
  return `${API}/project/${projectId}/version?${params}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-[1.5px] border-line-strong border-t-brand animate-spin flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

function ModIcon({ url, title }: { url: string | null; title: string }) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return (
      <div className="w-10 h-10 rounded-lg bg-bg-surface border border-line-subtle flex items-center justify-center text-lg text-ink-muted flex-shrink-0 select-none">
        ⬡
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      onError={() => setErrored(true)}
      className="w-10 h-10 rounded-lg border border-line-subtle object-cover flex-shrink-0 bg-bg-surface"
    />
  );
}

function StatusDot({ status }: { status: DlStatus }) {
  const base = 'w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300';
  if (status === 'done')        return <span className={`${base} bg-brand`} />;
  if (status === 'downloading') return <span className={`${base} bg-amber-pulse animate-pulse`} />;
  if (status === 'error')       return <span className={`${base} bg-red-err`} />;
  return <span className={`${base} bg-line-strong`} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  // ── Filter state ─────────────────────────────────────────────────────────
  const [versions, setVersions]         = useState<string[]>([]);
  const [versionCount, setVersionCount] = useState<number | null>(null);
  const [versionError, setVersionError] = useState(false);
  const [selectedVersion, setSelectedVersion]   = useState('');
  const [selectedLoader, setSelectedLoader]     = useState<Loader>('fabric');
  const [contentType, setContentType]           = useState<ContentType>('mod');
  const [shaderLoader, setShaderLoader]         = useState<ShaderLoader | null>(null);

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [activeQuery,   setActiveQuery]   = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError,      setHasError]      = useState(false);
  const [results,       setResults]       = useState<ModResult[]>([]);
  const [offset,        setOffset]        = useState(0);
  const [hasMore,       setHasMore]       = useState(false);

  // ── Queue state ───────────────────────────────────────────────────────────
  const [queue,         setQueue]         = useState<QueueItem[]>([]);
  const [addStatus,     setAddStatus]     = useState<Record<string, AddStatus>>({});
  const [dlStatus,      setDlStatus]      = useState<Record<string, DlStatus>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [progressText,  setProgressText]  = useState('');

  const abortRef = useRef<AbortController | null>(null);

  // ── Load MC versions ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/tag/game_version`)
      .then(r => r.json())
      .then((data: Array<{ version: string; version_type: string }>) => {
        const releases = data.filter(v => v.version_type === 'release').map(v => v.version);
        setVersions(releases);
        setVersionCount(releases.length);
        if (releases.length) setSelectedVersion(releases[0]);
      })
      .catch(() => setVersionError(true));
  }, []);

  // ── Auto-fetch when filters change ────────────────────────────────────────

  const fetchResults = useCallback(async (
    query: string,
    type: ContentType,
    loader: Loader,
    sLoader: ShaderLoader | null,
    version: string,
    startOffset: number,
    append: boolean,
  ) => {
    if (!version) return;

    if (!append) {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsLoading(true);
      setHasError(false);
      setActiveQuery(query);
      setOffset(0);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const facets = buildFacets(type, loader, sLoader, version);
      const params = new URLSearchParams({
        facets:  JSON.stringify(facets),
        limit:   String(PAGE_SIZE),
        offset:  String(startOffset),
        index:   query ? 'relevance' : 'downloads',
      });
      if (query) params.set('query', query);

      const signal = append ? undefined : abortRef.current?.signal;
      const r = await fetch(`${API}/search?${params}`, { signal });
      const data = await r.json();
      const hits: ModResult[] = data.hits ?? [];
      const total: number = data.total_hits ?? 0;

      if (append) {
        setResults(prev => [...prev, ...hits]);
        const newOffset = startOffset + hits.length;
        setOffset(newOffset);
        setHasMore(newOffset < total);
      } else {
        setResults(hits);
        setOffset(hits.length);
        setHasMore(hits.length < total);
      }
      setHasError(false);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setHasError(true);
    } finally {
      if (append) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  }, []);

  // Re-fetch when version / loader / shaderLoader / contentType changes
  useEffect(() => {
    if (!selectedVersion) return;
    fetchResults(searchQuery, contentType, selectedLoader, shaderLoader, selectedVersion, 0, false);
    // searchQuery intentionally excluded — only re-fetches on filter change, not every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion, selectedLoader, shaderLoader, contentType, fetchResults]);

  // ── Search (explicit) ─────────────────────────────────────────────────────

  const triggerSearch = useCallback(() => {
    fetchResults(searchQuery, contentType, selectedLoader, shaderLoader, selectedVersion, 0, false);
  }, [fetchResults, searchQuery, contentType, selectedLoader, shaderLoader, selectedVersion]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') triggerSearch(); },
    [triggerSearch]
  );

  const loadMore = useCallback(() => {
    fetchResults(searchQuery, contentType, selectedLoader, shaderLoader, selectedVersion, offset, true);
  }, [fetchResults, searchQuery, contentType, selectedLoader, shaderLoader, selectedVersion, offset]);

  // Clear query and show default list
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    fetchResults('', contentType, selectedLoader, shaderLoader, selectedVersion, 0, false);
  }, [fetchResults, contentType, selectedLoader, shaderLoader, selectedVersion]);

  // ── Add to queue ──────────────────────────────────────────────────────────

  const addItem = useCallback(
    async (projectId: string, title: string, iconUrl: string | null, type: ContentType) => {
      if (addStatus[projectId] || queue.some(q => q.id === projectId)) return;
      setAddStatus(prev => ({ ...prev, [projectId]: 'loading' }));
      try {
        const url = versionUrl(projectId, type, selectedLoader, selectedVersion);
        const r = await fetch(url);
        const vers = await r.json();
        if (!Array.isArray(vers) || !vers.length) {
          setAddStatus(prev => ({ ...prev, [projectId]: 'error' }));
          setTimeout(
            () => setAddStatus(prev => { const n = { ...prev }; delete n[projectId]; return n; }),
            2000
          );
          return;
        }
        const latest = vers[0];
        const file: ModFile = latest.files.find((f: ModFile) => f.primary) ?? latest.files[0];
        if (!file) { setAddStatus(prev => { const n = { ...prev }; delete n[projectId]; return n; }); return; }
        const sizeKb = file.size ? Math.round(file.size / 1024) : null;
        setQueue(prev => [...prev, { id: projectId, title, iconUrl, file, versionName: latest.version_number, sizeKb, contentType: type }]);
        setAddStatus(prev => ({ ...prev, [projectId]: 'done' }));
      } catch {
        setAddStatus(prev => { const n = { ...prev }; delete n[projectId]; return n; });
      }
    },
    [addStatus, queue, selectedLoader, selectedVersion]
  );

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
    setDlStatus(prev => { const n = { ...prev }; delete n[id]; return n; });
    setAddStatus(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setDlStatus({});
    setAddStatus({});
    setProgressText('');
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────

  const downloadAll = useCallback(async () => {
    if (!queue.length || isDownloading) return;
    setIsDownloading(true);
    setProgressText('');
    let done = 0;
    for (const item of queue) {
      setDlStatus(prev => ({ ...prev, [item.id]: 'downloading' }));
      setProgressText(`Baixando ${done + 1} de ${queue.length}: ${item.title}`);
      try {
        const r = await fetch(item.file.url);
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = item.file.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch {
        const a = document.createElement('a');
        a.href = item.file.url; a.target = '_blank'; a.download = item.file.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      setDlStatus(prev => ({ ...prev, [item.id]: 'done' }));
      done++;
      await new Promise(res => setTimeout(res, 800));
    }
    setIsDownloading(false);
    setProgressText(`✓ ${done} item${done > 1 ? 's' : ''} baixado${done > 1 ? 's' : ''}!`);
  }, [queue, isDownloading]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const currentTypeInfo = CONTENT_TYPES.find(t => t.id === contentType)!;

  const handleSetContentType = useCallback((t: ContentType) => {
    setContentType(t);
    if (t !== 'shader') setShaderLoader(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-bg-base text-ink-primary overflow-hidden select-none">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-5 py-3.5 border-b border-line-subtle flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#0a2e18">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2V8h-2v8zm-3 0h2V8H8v8zm6 0h2V8h-2v8z"/>
          </svg>
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Modrinth Downloader</span>
        <span className="ml-auto text-xs font-mono text-ink-tertiary">
          {versionError ? 'Erro ao carregar versões'
            : versionCount === null ? 'Carregando versões...'
            : `${versionCount} versões disponíveis`}
        </span>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col border-r border-line-subtle overflow-hidden min-w-0">

          {/* Content type tabs */}
          <div className="px-4 pt-3 pb-0 border-b border-line-subtle flex-shrink-0">
            <div className="flex gap-0">
              {CONTENT_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSetContentType(t.id)}
                  className={[
                    'px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all duration-150 -mb-px',
                    contentType === t.id
                      ? 'border-brand text-brand'
                      : 'border-transparent text-ink-secondary hover:text-ink-primary',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Version + loader row */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line-subtle flex-shrink-0">
            <select
              value={selectedVersion}
              onChange={e => setSelectedVersion(e.target.value)}
              className="h-7 px-2.5 rounded-md border border-line-DEFAULT bg-bg-surface text-ink-primary text-[11px] font-mono cursor-pointer transition-colors hover:border-line-strong focus:border-brand focus:shadow-[0_0_0_2px_rgba(27,217,106,0.15)] w-28 flex-shrink-0"
            >
              {!versions.length && <option value="">...</option>}
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>

            {currentTypeInfo.usesLoader && (
              <div className="flex gap-1.5">
                {LOADERS.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLoader(l.id)}
                    className={[
                      'h-7 px-3 rounded-md text-[11px] border transition-all duration-150 font-medium',
                      selectedLoader === l.id
                        ? 'bg-brand-glow border-brand text-brand'
                        : 'bg-bg-surface border-line-DEFAULT text-ink-secondary hover:border-line-strong hover:text-ink-primary',
                    ].join(' ')}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}

            {contentType === 'shader' && (
              <div className="flex gap-1.5">
                {SHADER_LOADERS.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setShaderLoader(prev => prev === l.id ? null : l.id)}
                    className={[
                      'h-7 px-3 rounded-md text-[11px] border transition-all duration-150 font-medium',
                      shaderLoader === l.id
                        ? 'bg-brand-glow border-brand text-brand'
                        : 'bg-bg-surface border-line-DEFAULT text-ink-secondary hover:border-line-strong hover:text-ink-primary',
                    ].join(' ')}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}

            {/* Search input — right-aligned, expands */}
            <div className="flex gap-1.5 ml-auto flex-1 max-w-[260px]">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Buscar ${currentTypeInfo.label.toLowerCase()}...`}
                  className="w-full h-7 pl-2.5 pr-7 rounded-md border border-line-DEFAULT bg-bg-surface text-ink-primary text-[11px] placeholder:text-ink-tertiary transition-colors hover:border-line-strong focus:border-brand focus:shadow-[0_0_0_2px_rgba(27,217,106,0.15)] outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-secondary text-xs leading-none"
                    title="Limpar busca"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={triggerSearch}
                disabled={isLoading}
                className="h-7 w-7 rounded-md bg-brand border border-brand text-brand-dark flex items-center justify-center flex-shrink-0 transition-all hover:bg-brand-hover active:scale-95 disabled:opacity-50"
              >
                {isLoading
                  ? <Spinner size={11} />
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
                }
              </button>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto relative">

            {/* Loading overlay (shows spinner over stale results) */}
            {isLoading && results.length > 0 && (
              <div className="absolute inset-0 bg-bg-base/60 flex items-start justify-center pt-10 z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-ink-secondary text-xs bg-bg-surface border border-line-subtle rounded-lg px-3 py-2 shadow-lg">
                  <Spinner size={12} /> Atualizando...
                </div>
              </div>
            )}

            {/* Full-page loading (first load) */}
            {isLoading && results.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-16 text-ink-secondary text-xs">
                <Spinner /> Carregando {currentTypeInfo.label.toLowerCase()}...
              </div>
            )}

            {/* Error */}
            {!isLoading && hasError && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs">
                <span className="text-2xl">⚠️</span>
                Erro ao buscar. Verifique sua conexão.
              </div>
            )}

            {/* No results */}
            {!isLoading && !hasError && results.length === 0 && selectedVersion && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-secondary text-xs text-center">
                <span className="text-2xl opacity-40">🔍</span>
                <span>
                  Nenhum resultado para{' '}
                  <strong className="text-ink-primary">{activeQuery || currentTypeInfo.label}</strong>
                  {activeQuery && <><br />com {currentTypeInfo.usesLoader ? `${selectedLoader} ` : ''}{selectedVersion}</>}
                </span>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div>
                {results.map((item, i) => {
                  // only animate newly appended items
                  const isNew = i >= offset - PAGE_SIZE;
                  const status = addStatus[item.project_id];
                  const added  = queue.some(q => q.id === item.project_id) || status === 'done';
                  return (
                    <div
                      key={item.project_id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-line-subtle hover:bg-bg-hover transition-colors cursor-default${isNew ? ' animate-fadeIn' : ''}`}
                      style={isNew ? { animationDelay: `${(i % PAGE_SIZE) * 20}ms` } : undefined}
                    >
                      <ModIcon url={item.icon_url} title={item.title} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate leading-tight">{item.title}</div>
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
                        disabled={added || status === 'loading'}
                        onClick={() => addItem(item.project_id, item.title, item.icon_url, contentType)}
                        className={[
                          'w-8 h-8 rounded-lg border text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all duration-150',
                          added
                            ? 'border-brand/40 bg-brand-glow text-brand cursor-default'
                            : status === 'error'
                            ? 'border-red-err/40 bg-red-err/10 text-red-err cursor-default'
                            : status === 'loading'
                            ? 'border-line-DEFAULT bg-bg-surface text-ink-secondary cursor-wait'
                            : 'border-line-DEFAULT bg-bg-surface text-ink-secondary hover:border-brand hover:text-brand hover:bg-brand-glow active:scale-95',
                        ].join(' ')}
                        title={added ? 'Na fila' : status === 'error' ? 'Sem versão compatível' : 'Adicionar à fila'}
                      >
                        {status === 'loading' ? <Spinner size={12} />
                          : added ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : status === 'error' ? '✗'
                          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        }
                      </button>
                    </div>
                  );
                })}

                {/* Load more */}
                {(hasMore || isLoadingMore) && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="h-8 px-5 rounded-lg border border-line-DEFAULT bg-bg-surface text-ink-secondary text-xs font-medium flex items-center gap-2 transition-all hover:border-line-strong hover:text-ink-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMore ? <><Spinner size={11} /> Carregando...</> : 'Carregar mais'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel (queue) ─────────────────────────────────────────── */}
        <div className="w-[280px] flex flex-col flex-shrink-0">

          <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">Fila de download</span>
              <span className="min-w-[20px] h-5 px-1.5 bg-brand text-brand-dark text-[10px] font-bold rounded-full flex items-center justify-center font-mono">
                {queue.length}
              </span>
            </div>
            {queue.length > 0 && !isDownloading && (
              <button
                onClick={clearQueue}
                className="text-[11px] text-ink-tertiary hover:text-ink-secondary transition-colors px-2 py-1 rounded hover:bg-bg-hover"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-tertiary">
                <span className="text-3xl opacity-25">📦</span>
                <span className="text-xs text-center leading-relaxed">
                  Fila vazia.<br />Adicione itens da busca.
                </span>
              </div>
            ) : (
              queue.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-4 py-2.5 border-b border-line-subtle hover:bg-bg-hover transition-colors animate-slideIn"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <StatusDot status={dlStatus[item.id] ?? 'pending'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{item.title}</div>
                    <div className="text-[10px] font-mono text-ink-tertiary mt-0.5">
                      {item.versionName}{item.sizeKb ? ` · ${fmtSize(item.sizeKb)}` : ''}
                    </div>
                  </div>
                  {!isDownloading && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="text-ink-muted hover:text-ink-secondary text-base w-5 h-5 flex items-center justify-center rounded hover:bg-bg-hover transition-colors leading-none"
                      title="Remover"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-3.5 border-t border-line-subtle flex-shrink-0">
            <button
              onClick={downloadAll}
              disabled={queue.length === 0 || isDownloading}
              className="w-full h-10 rounded-lg bg-brand border border-brand text-brand-dark text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-brand-hover hover:border-brand-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <><Spinner size={13} /> Baixando...</>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Baixar todos ({queue.length})
                </>
              )}
            </button>
            {progressText && (
              <p className="text-[11px] font-mono text-ink-secondary text-center mt-2 truncate">
                {progressText}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
