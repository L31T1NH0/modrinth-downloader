export const en = {
  status: {
    resolving:   'Resolving...',
    pending:     'Awaiting...',
    downloading: 'Downloading...',
    done:        'Completed',
  },

  search: {
    placeholder:  'Search items...',
    clearTitle:   'Clear search',
    minLength:    'Type at least {n} characters to search.',
    loadMore:     'Load more',
    loading:      'Loading...',
    error:        'Error searching. Check your connection.',
    noResultsFor: 'No results for',
    withVersion:  'with',
  },

  fallback: {
    banner: 'No {type} for {version}. Showing results from {fallback} instead.',
  },

  queue: {
    title:       'Download queue',
    clear:       'Clear',
    empty:       'Queue empty.',
    emptyHint:   'Add items from search.',
    addToQueue:  'Add to queue',
    inQueue:     'In queue',
    dep:         'dep',
    retryTitle:    'Try again',
    removeTitle:   'Remove',
    conflictWith:  'Conflicts with {title}',
    conflictBanner: '{n} conflict detected — download anyway?',
    conflictBannerPlural: '{n} conflicts detected — download anyway?',
  },

  errors: {
    noCompatibleVersion: 'No compatible version',
    batchLimitExceeded:  'Batch download limit exceeded',
    networkError:        'Network error',
  },

  footer: {
    export:             'Export',
    exportTitle:        'Export mod list as JSON',
    import:             'Import',
    importTitle:        'Import mod list from JSON',
    restoring:          'Restoring...',
    share:              'Share',
    shareTitle:         'Copy shareable URL',
    copySharePrompt:    'Copy this share URL:',
    copied:             'Copied!',
    downloadFile:       'Download file',
    downloadFiles:      'Download {n} files',
    toggleFormat:       'Toggle archive format',
    failedMods:         '{n} mod could not be loaded',
    failedModsPlural:   '{n} mods could not be loaded',
    downloading:        'Downloading...',
    creatingArchive:    'Creating {format}...',
  },

  summary: {
    resolving:   'resolving',
    ready:       'ready',
    downloaded:  'downloaded',
    error:       'error',
    errors:      'errors',
  },

  snackbar: {
    added:        'Added to queue',
    datapacks:    'Use CurseForge instead; Modrinth datapacks are unreliable (may download mods instead)',
    listTooLarge: 'List too large for a URL — use Export instead.',
  },

  migration: {
    prompt:      '{n} mods from {from} — version change detected',
    checking:    'Checking {n} mods for {to}…',
    compatible:  '{ok} compatible',
    incompatible: '{fail} incompatible for {to}',
    check:       'Verify for {to}',
    migrate:     'Migrate',
    dismiss:     'Dismiss',
  },

  nav: {
    search: 'Search',
    queue:  'Queue',
  },

  filters: {
    source:      'Source',
    version:     'Version',
    loader:      'Loader',
    renderer:    'Renderer',
    platform:    'Platform',
    contentType: 'Content type',
    sources: {
      modrinth:   'Modrinth',
      curseforge: 'CurseForge',
      bedrock:    'Bedrock',
    },
    contentTypes: {
      mod:            'Mods',
      plugin:         'Plugins',
      datapack:       'Datapacks',
      resourcepack:   'Resourcepacks',
      shader:         'Shaders',
      addon:          'Addons',
      map:            'Maps',
      'texture-pack': 'Texture Packs',
      script:         'Scripts',
      skin:           'Skins',
    },
  },

  rankings: {
    title:            'Rankings',
    mostDownloaded:   'Most Downloaded',
    tracked:          'Tracked',
    downloads:        'Downloads',
    loading:          'Loading rankings...',
    empty:            'No {type} rankings yet',
    emptyHint:        'Download some through Dynrinth to get started!',
    alreadyInQueue:   'Already in queue',
    addToQueueTitle:  'Add to queue - {version} - {loader}',
    openToSetVersion: 'Open Dynrinth to set a Minecraft version first',
    searchOnDynrinth: 'Search "{name}" on Dynrinth',
    viewOnPlatform:   'View on platform',
    tracking:         'Tracking downloads through Dynrinth',
  },

  importErrors: {
    noModrinthCdnFiles: 'No Modrinth CDN files found in the index.',
    unsupportedFormat:  'Unsupported format. Expected ModListState v1/v2 or compatible aliases.',
    invalidJson:        'Invalid JSON.',
    fileReadFailed:     'File read failed.',
    invalidStructure:   'invalid structure',
    detail:             'Detail: {detail}',
  },

  debug: {
    browse:    'browse',
    hits:      'hits',
    download:  'download',
    files:     'files',
    loadMore:  'load more',
    open:      'Open debug panel (Ctrl+Shift+D)',
    hint:      'Ctrl+Shift+D - click row to expand - copy JSON to share',
    events:    'events',
    copied:    'copied!',
    copyJson:  'copy JSON',
    clear:     'clear',
    noEvents:  'no events yet',
  },

  meta: {
    homeDescription:     'Easy search and download Minecraft mods from Modrinth & CurseForge',
    rankingsTitle:       'Rankings - Dynrinth',
    rankingsDescription: 'Most downloaded Minecraft content through Dynrinth',
  },

  mobileSuggestion: {
    text:   'On mobile, Bedrock usually works better. Switch now?',
    keep:   'Keep',
    switch: 'Switch',
  },

  minecraft: {
    share:      'Minecraft',
    shareTitle: 'Generate code to install via mod',
    prompt:     'Type in Minecraft:',
    command:    '/dynrinth {code}',
    copied:     'Copied!',
    generating: 'Generating...',
    error:      'Failed to generate code',
    preview:    'Preview',
  },
};
