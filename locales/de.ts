import type { en } from './en';

export const de: typeof en = {
  status: {
    resolving:   'Wird aufgelöst...',
    pending:     'Wartend...',
    downloading: 'Wird heruntergeladen...',
    done:        'Abgeschlossen',
  },

  search: {
    placeholder:  'Elemente suchen...',
    clearTitle:   'Suche leeren',
    minLength:    'Mindestens {n} Zeichen zum Suchen eingeben.',
    loadMore:     'Mehr laden',
    loading:      'Lädt...',
    error:        'Suchfehler. Verbindung prüfen.',
    noResultsFor: 'Keine Ergebnisse für',
    withVersion:  'mit',
  },

  fallback: {
    banner: 'Keine {type} für {version}. Zeige Ergebnisse aus {fallback}.',
  },

  queue: {
    title:       'Download-Warteschlange',
    clear:       'Leeren',
    empty:       'Warteschlange leer.',
    emptyHint:   'Elemente aus der Suche hinzufügen.',
    addToQueue:  'Zur Warteschlange hinzufügen',
    inQueue:     'In der Warteschlange',
    dep:         'Abh.',
    retryTitle:  'Erneut versuchen',
    removeTitle: 'Entfernen',
  },

  errors: {
    noCompatibleVersion: 'Keine kompatible Version',
    batchLimitExceeded:  'Batch-Download-Limit überschritten',
    networkError:        'Netzwerkfehler',
  },

  footer: {
    export:           'Exportieren',
    exportTitle:      'Mod-Liste als JSON exportieren',
    import:           'Importieren',
    importTitle:      'Mod-Liste aus JSON importieren',
    restoring:        'Wird wiederhergestellt...',
    share:            'Teilen',
    shareTitle:       'Teilbaren Link kopieren',
    copySharePrompt:  'Diesen Freigabelink kopieren:',
    copied:           'Kopiert!',
    downloadFile:     'Datei herunterladen',
    downloadFiles:    '{n} Dateien herunterladen',
    toggleFormat:     'Archivformat wechseln',
    failedMods:       '{n} Mod konnte nicht geladen werden',
    failedModsPlural: '{n} Mods konnten nicht geladen werden',
    downloading:      'Wird heruntergeladen...',
    creatingArchive:  '{format} wird erstellt...',
  },

  summary: {
    resolving:   'wird aufgelöst',
    ready:       'bereit',
    downloaded:  'heruntergeladen',
    error:       'Fehler',
    errors:      'Fehler',
  },

  snackbar: {
    added:        'Zur Warteschlange hinzugefügt',
    datapacks:    'Verwende stattdessen CurseForge; Modrinth-Datenpakete sind unzuverlässig (können Mods herunterladen)',
    listTooLarge: 'Liste zu groß für eine URL — stattdessen Exportieren verwenden.',
  },

  nav: {
    search: 'Suche',
    queue:  'Warteschlange',
  },

  filters: {
    source:      'Quelle',
    version:     'Version',
    loader:      'Loader',
    renderer:    'Renderer',
    platform:    'Plattform',
    contentType: 'Inhaltstyp',
    sources: {
      modrinth:   'Modrinth',
      curseforge: 'CurseForge',
      bedrock:    'Bedrock',
    },
    contentTypes: {
      mod:            'Mods',
      plugin:         'Plugins',
      datapack:       'Datenpakete',
      resourcepack:   'Ressourcenpakete',
      shader:         'Shader',
      addon:          'Add-ons',
      map:            'Karten',
      'texture-pack': 'Texturpakete',
      script:         'Skripte',
      skin:           'Skins',
    },
  },

  rankings: {
    title:            'Rankings',
    mostDownloaded:   'Am meisten heruntergeladen',
    tracked:          'Erfasst',
    downloads:        'Downloads',
    loading:          'Rankings werden geladen...',
    empty:            'Noch keine Rankings fuer {type}',
    emptyHint:        'Lade etwas ueber Dynrinth herunter, um zu starten!',
    alreadyInQueue:   'Bereits in der Warteschlange',
    addToQueueTitle:  'Zur Warteschlange hinzufuegen - {version} - {loader}',
    openToSetVersion: 'Dynrinth oeffnen, um zuerst eine Minecraft-Version festzulegen',
    searchOnDynrinth: '"{name}" auf Dynrinth suchen',
    viewOnPlatform:   'Auf Plattform ansehen',
    tracking:         'Downloads ueber Dynrinth werden verfolgt',
  },

  importErrors: {
    noModrinthCdnFiles: 'Keine Modrinth-CDN-Dateien im Index gefunden.',
    unsupportedFormat:  'Nicht unterstuetztes Format. Erwartet wird ModListState v1/v2 oder kompatible Aliase.',
    invalidJson:        'Ungueltiges JSON.',
    fileReadFailed:     'Datei konnte nicht gelesen werden.',
    invalidStructure:   'ungueltige Struktur',
    detail:             'Detail: {detail}',
  },

  debug: {
    browse:    'browse',
    hits:      'Treffer',
    download:  'Download',
    files:     'Dateien',
    loadMore:  'mehr laden',
    open:      'Debug-Panel oeffnen (Ctrl+Shift+D)',
    hint:      'Ctrl+Shift+D - Zeile zum Aufklappen klicken - JSON zum Teilen kopieren',
    events:    'Ereignisse',
    copied:    'kopiert!',
    copyJson:  'JSON kopieren',
    clear:     'leeren',
    noEvents:  'noch keine Ereignisse',
  },

  meta: {
    homeDescription:     'Minecraft-Mods von Modrinth und CurseForge einfach suchen und herunterladen',
    rankingsTitle:       'Rankings - Dynrinth',
    rankingsDescription: 'Am meisten heruntergeladene Minecraft-Inhalte ueber Dynrinth',
  },

  mobileSuggestion: {
    text:   'Auf Mobilgeräten funktioniert Bedrock meist besser. Jetzt wechseln?',
    keep:   'Behalten',
    switch: 'Wechseln',
  },
};
