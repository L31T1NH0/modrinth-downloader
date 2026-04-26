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
    retryTitle:    'Erneut versuchen',
    removeTitle:   'Entfernen',
    conflictWith:  'Konflikt mit {title}',
    conflictBanner: '{n} Konflikt erkannt — trotzdem herunterladen?',
    conflictBannerPlural: '{n} Konflikte erkannt — trotzdem herunterladen?',
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

  migration: {
    prompt:      '{n} Mods von {from} — Versionsänderung erkannt',
    checking:    '{n} Mods für {to} werden geprüft…',
    compatible:  '{ok} kompatibel',
    incompatible: '{fail} inkompatibel für {to}',
    check:       'Für {to} prüfen',
    migrate:     'Migrieren',
    dismiss:     'Verwerfen',
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
      pvprp:      'pvprp.com',
      optifine:   'OptiFine',
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
    modTitle:            'Dynrinth Mod',
    modDescription:      'Modpacks per Code mit /dynrinth <code> installieren',
  },

  modPage: {
    source: 'Quelle',
    hero: {
      titleLine1:      'Modpacks installieren',
      titleLine2:      'mit einem Befehl',
      description:     'Teile eine Mod-Liste als 10-stelligen Code. Empfaenger geben',
      descriptionTail: 'im Spiel ein und alles wird automatisch heruntergeladen.',
    },
    download:   'Download',
    build:      'Modpack erstellen',
    howItWorks: 'So funktioniert es',
    callout: {
      title: 'Noch keinen Code?',
      body:  'Erstelle deine Mod-Liste auf dynrinth.vercel.app und teile sie in Sekunden.',
      open:  'Oeffnen',
    },
    steps: {
      buildTitle:   'Liste erstellen',
      buildBody:    'Suche und stelle Mods auf dynrinth.vercel.app zusammen und klicke dann auf "Share to Dynrinth".',
      runTitle:     'Befehl ausfuehren',
      runBody:      'Betritt eine Welt oder einen Server und tippe /dynrinth gefolgt von deinem 10-stelligen Code.',
      restartTitle: 'Neu starten & spielen',
      restartBody:  'Alles landet automatisch in /mods. Spiel neu starten und loslegen.',
    },
    commands: {
      title:   'Befehle',
      install: 'Modpack installieren',
      force:   'Versionspruefung ueberspringen',
      remove:  'Modpack deinstallieren',
    },
    platforms: {
      title:    'Unterstuetzte Plattformen',
      fabric:   'Fabric',
      neoForge: 'NeoForge',
      paper:    'Paper',
    },
    chat: {
      title:         'Dynrinth-Chat',
      fetching:      'Modpack wird geladen...',
      resolving:     '12 Mods fuer MC 1.21.1 werden aufgeloest...',
      downloadingA:  'Herunterladen (3/12) sodium-fabric-0.6.jar',
      downloadingB:  'Herunterladen (9/12) lithium-fabric-0.14.jar',
      done:          'Fertig! 12 Mod(s) installiert. Zum Aktivieren neu starten.',
    },
  },

  mobileSuggestion: {
    text:   'Auf Mobilgeräten funktioniert Bedrock meist besser. Jetzt wechseln?',
    keep:   'Behalten',
    switch: 'Wechseln',
  },

  minecraft: {
    share:      'Dynrinth',
    shareTitle: 'Code zum Installieren per Mod generieren',
    prompt:     'In Dynrinth eingeben:',
    command:    '/dynrinth {code}',
    copied:     'Kopiert!',
    generating: 'Wird generiert...',
    error:      'Fehler beim Generieren des Codes',
    preview:    'Vorschau',
  },
};
