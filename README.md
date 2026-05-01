# Dynrinth

Dynrinth e uma aplicacao web em `Next.js` para montar listas de mods e outros conteudos de Minecraft a partir de `Modrinth`, `CurseForge` e `CurseForge Bedrock`, resolver dependencias e baixar tudo em um unico arquivo.

## Visao Geral

- Busca projetos em `Modrinth`, `CurseForge` e `CurseForge Bedrock`.
- Resolve dependencias obrigatorias automaticamente antes do download.
- Mantem uma fila de itens com progresso individual e geral.
- Exporta a fila como `.zip`, `.tar.gz` e, quando possivel, `.mrpack`.
- Importa listas salvas em `JSON` e modpacks `.mrpack`.
- Compartilha listas por URL compactada e por codigo curto de instalacao.
- Exibe rankings de downloads quando ha backend KV configurado.
- Suporta interface em `en`, `pt-BR`, `de` e `tr`.

## Recursos

- Fontes suportadas: `Modrinth`, `CurseForge` (Java) e `CurseForge Bedrock`.
- Tipos de conteudo Java: `mod`, `plugin`, `datapack`, `resourcepack`, `shader`.
- Tipos de conteudo Bedrock: `addon`, `map`, `texture-pack`, `script`, `skin`.
- Filtros por versao do Minecraft.
- Filtros por loader: `Fabric`, `Forge`, `NeoForge`, `Quilt`.
- Filtros por renderer de shader: `Iris`, `OptiFine`.
- Filtros por plataforma de plugin: `Paper`, `Spigot`, `Bukkit`, `Purpur`, `Folia`, `Velocity`, `BungeeCord`, `Sponge`.
- Filtros de compatibilidade client/server para mods no Modrinth.
- Compartilhamento por URL compactada.
- Compartilhamento por codigo curto de 10 caracteres para o fluxo `/dynrinth <code>` quando o backend KV esta configurado.
- Pagina `/rankings` para os downloads mais usados.
- Pagina `/install` com instrucoes do mod/plugin companheiro do Dynrinth.

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript 6`
- `Tailwind CSS 4`
- `fflate` para geracao de ZIP e leitura de `.mrpack`
- `lz-string` para compactar o estado na URL
- `@vercel/analytics` e `@vercel/speed-insights`

## Requisitos

- `Node.js 20+`
- `npm`

## Instalacao

```bash
git clone https://github.com/L31T1NH0/Dynrinth.git
cd Dynrinth
npm install
```

## Variaveis De Ambiente

```bash
CURSEFORGE_API_KEY=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- `CURSEFORGE_API_KEY`: necessario para habilitar buscas e resolucao de arquivos via CurseForge, incluindo Bedrock.
- `KV_REST_API_URL` e `KV_REST_API_TOKEN`: opcionais, mas necessarios para persistir codigos curtos, alimentar rankings e usar rate limit com KV em producao.

Sem `CURSEFORGE_API_KEY`, a aplicacao continua funcionando para `Modrinth`.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

Aplicacao local: `http://localhost:3000`

## Fluxos Principais

### Buscar E Baixar

1. Escolha a fonte.
2. Defina versao, tipo de conteudo e filtros extras.
3. Busque projetos.
4. Adicione itens a fila.
5. Baixe a fila como `.zip` ou `.tar.gz`.

### Exportar E Importar

- Exporta `JSON` com o estado atual da lista.
- Exporta `.mrpack` quando os itens forem do `Modrinth` e tiverem hashes disponiveis.
- Importa arquivos `JSON` do proprio app.
- Importa arquivos `.mrpack` com `modrinth.index.json`.

### Compartilhar

- URL com estado compactado em `?data=`.
- Codigo curto via `POST /api/codes`.
- Pagina publica do pacote em `/pack/[code]`.

## Rotas

- `/`: busca, filtros, fila, importacao, exportacao e download.
- `/rankings`: ranking de downloads por fonte, tipo e versao.
- `/install`: landing page do mod/plugin companheiro para instalacao por codigo.
- `/mod`: redireciona permanentemente para `/install`.
- `/pack/[code]`: pagina publica de uma lista compartilhada por codigo.

## API Interna

- `GET /api/curseforge`: proxy com allowlist de endpoints e query params do CurseForge.
- `GET /api/curseforge/download`: proxy/stream validado para downloads do CurseForge.
- `POST /api/codes`: valida o estado da lista e retorna um codigo curto; com KV configurado, persiste o estado para recuperacao posterior.
- `GET /api/codes/[code]`: recupera uma lista salva a partir do codigo quando o backend KV esta disponivel.
- `POST /api/track-download`: incrementa contadores usados no ranking quando o backend KV esta disponivel.
- `GET /api/rankings`: retorna ranking agregado de downloads.

## Operacao

### Rate Limit

- Janela atual: `400` requisicoes por `60s` por IP e por rota.
- Em desenvolvimento, o armazenamento e em memoria.
- Em producao, com `KV_REST_API_URL` e `KV_REST_API_TOKEN`, o rate limit usa KV remoto.

### IP Do Cliente Atras De Proxy

O backend usa esta ordem para identificar o IP:

1. `cf-connecting-ip`
2. `x-real-ip`
3. `x-forwarded-for` (ultimo IP da cadeia)

Se nenhum header confiavel estiver presente, o valor usado e `unknown`.

### Download Proxy Do CurseForge

`/api/curseforge/download` aceita apenas hosts permitidos e faz o stream do arquivo pelo proprio backend:

- `edge.forgecdn.net`
- `mediafilez.forgecdn.net`
- `media.forgecdn.net`
- `cdn.forgecdn.net`

## Estrutura Do Projeto

```text
Dynrinth/
├── app/          # App Router, paginas e API routes
├── components/   # Componentes de UI reutilizaveis
├── hooks/        # Hooks de busca, filtros, fila e restauracao
├── lib/          # Integracoes, serializacao, rate limit e utilitarios
├── locales/      # Traducoes
├── public/       # Assets estaticos
├── package.json
└── README.md
```

Arquivos centrais:

- `app/page.tsx`: fluxo principal de busca, fila, importacao, exportacao e download.
- `app/install/page.tsx`: pagina do mod/plugin companheiro do Dynrinth.
- `app/rankings/RankingsClient.tsx`: interface do leaderboard.
- `lib/modrinth/service.ts`: integracao direta com a API do Modrinth.
- `lib/curseforge/service.ts`: integracao com o proxy server-side do CurseForge.
- `lib/stateUtils.ts`: serializacao, compartilhamento por URL e import/export.
- `lib/mrpack.ts`: leitura e geracao de `.mrpack`.

## Observacoes De Desenvolvimento

- `npm run build` foi validado neste repositorio.
- O script `npm run lint` presente em `package.json` ainda precisa ser ajustado para o fluxo atual do `Next.js 16`.

## Licenca

Este projeto esta sob a licenca `MIT`. Veja `LICENSE`.

## Contribuicao

Issues e pull requests sao bem-vindos.
