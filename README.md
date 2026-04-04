# Modrinth Downloader

Uma aplicação web moderna para buscar, resolver dependências e baixar mods, shaders, plugins e outros conteúdos do Modrinth e CurseForge de forma centralizada.

## ✨ Funcionalidades

- **Suporte a múltiplas fontes**: Busque e baixe conteúdos do Modrinth e CurseForge
- **Busca inteligente**: Procure por mods, shaders, plugins, datapacks, resourcepacks e outros conteúdos
- **Filtros avançados**: Filtre por versão do Minecraft, loader, versão de shader, plataforma de plugin, etc.
- **Resolução de dependências**: Detecte automaticamente as dependências de cada projeto
- **Download em lote**: Selecione múltiplos arquivos e baixe tudo em um único ZIP
- **Acompanhamento de progresso**: Veja o progresso em tempo real para cada arquivo e progresso geral
- **Interface intuitiva**: Design responsivo e moderno com Tailwind CSS
- **Seletor de versões otimizado**: Menu de versões com altura limitada e scroll para melhor navegação

## 🚀 Início Rápido

### Requisitos

- Node.js 20+
- npm ou yarn

### Instalação

```bash
# Clone o repositório
git clone https://github.com/l31t1nh0/modrinth-downloader.git
cd modrinth-downloader

# Instale as dependências
npm install
```

### Desenvolvimento

```bash
# Inicie o servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em [http://localhost:3000](http://localhost:3000)

### Build para Produção

```bash
# Build da aplicação
npm run build

# Inicie o servidor de produção
npm start
```

## 📁 Estrutura do Projeto

```text
modrinth-downloader/
├── app/                     # Rotas e UI (App Router), incluindo API routes
├── components/              # Componentes React reutilizáveis
├── hooks/                   # Hooks customizados para estado e fluxo
├── lib/                     # Serviços, utilitários e integrações externas
├── package.json             # Scripts e dependências do projeto
├── tsconfig.json            # Configuração TypeScript
└── next.config.ts           # Configuração do Next.js
```

Arquivos críticos:

- `app/page.tsx`: tela principal e fluxo de busca/download.
- `app/api/curseforge/route.ts`: proxy de busca para a API CurseForge.
- `lib/modrinth/service.ts` e `lib/curseforge/service.ts`: integração com APIs externas.
- `lib/download.ts`: preparo e empacotamento dos downloads em ZIP.

> Observação: a estrutura detalhada pode ser consultada via `rg --files`.

## 🛠 Tecnologias

- **Next.js 16** - Framework React moderno
- **React 19** (`react` + `react-dom`) - Biblioteca UI
- **TypeScript 6** - Tipagem estática
- **Tailwind CSS 4** (`tailwindcss` + `@tailwindcss/postcss`) - Estilização utilitária
- **PostCSS 8** - Pipeline CSS
- **fflate 0** - Compressão ZIP em tempo real
- **lz-string 1** - Compactação de strings para payloads/client state
- **@heroicons/react 2** - Ícones SVG para interface
- **API Modrinth v2** - Integração com Modrinth
- **API CurseForge** - Integração com CurseForge

## 🔁 Matriz de Compatibilidade

- **Runtime Node suportado**: **Node.js 20+**.
- **Stack principal**: **Next.js 16** + **React 19** (`react-dom` 19).
- **Última revisão da documentação**: **2026-04-04**.

## 📚 Como Usar

### 1. Buscar Projetos

- Acesse a página inicial
- Selecione a fonte: Modrinth ou CurseForge
- Digite o nome do projeto que procura no campo de busca
- Selecione o tipo de conteúdo: Mod, Shader, Plugin, Datapack, Resourcepack, etc.
- Escolha a versão do Minecraft desejada
- Configure filtros adicionais conforme o tipo de conteúdo (loader para mods, renderer para shaders, etc.)
- Clique em "Buscar"

### 2. Resolver Dependências

- Selecione um projeto da lista de resultados
- As dependências serão automaticamente detectadas
- Uma lista mostrará todos os arquivos necessários com suas dependências

### 3. Baixar em Lote

- Selecione os arquivos que deseja baixar
- Clique em "Baixar como ZIP"
- Todos os arquivos serão compactados em um único ZIP
- O navegador iniciará o download automaticamente

## 🔧 API Modrinth

### Endpoints Utilizados

- `GET /tag/game_version` - Listar versões do Minecraft
- `GET /search` - Buscar projetos
- `GET /project/{id}/version` - Obter versões de um projeto
- `GET /project/{id}` - Obter informações do projeto

**Base URL**: `https://api.modrinth.com/v2`

## 📝 Configuração de Filtros

### Fonte de Conteúdo
- **Modrinth**: Acesso completo a todos os tipos de conteúdo
- **CurseForge**: Suporte para mods e plugins

### Tipos de Conteúdo e Filtros Específicos
- **Mods**: Loader (Fabric, Forge)
- **Shaders**: Renderer (Iris, OptiFine) - disponível apenas no Modrinth
- **Plugins**: Plataforma (Paper, Spigot, Bukkit)
- **Datapacks**: Apenas versão do Minecraft
- **Resourcepacks**: Apenas versão do Minecraft


## ⚙️ Operação: IP real atrás de proxy/CDN

As rotas da CurseForge (`/api/curseforge` e `/api/curseforge/download`) aplicam rate limit por IP do cliente.
Para isso, o backend considera **apenas headers de IP confiáveis** nesta ordem:

1. `cf-connecting-ip`
2. `true-client-ip`
3. `x-real-ip`
4. `x-forwarded-for` (primeiro IP da lista)

Configure sua borda para encaminhar o IP real e remover valores forjados vindos do cliente.

### Proxies/CDNs recomendados

- **Cloudflare**: encaminhar `CF-Connecting-IP` (padrão da plataforma).
- **Fastly / Akamai**: encaminhar `True-Client-IP` (quando habilitado).
- **Nginx / Ingress Nginx / Traefik / HAProxy / ALB**: definir `X-Real-IP` e cadeia `X-Forwarded-For` corretamente.
- **Vercel / Reverse proxy interno**: garantir que o proxy de borda preserve `X-Forwarded-For` e que a aplicação não fique exposta diretamente sem esse proxy.

> Se nenhum header confiável estiver presente, o sistema usa `unknown` como origem para rate limit.

## 🎨 Customização

### Tema Tailwind

Edite `tailwind.config.ts` para customizar cores, fontes e outros estilos.

### Configuração Next.js

Ajuste `next.config.ts` conforme necessário para suas necessidades específicas.

## 🐛 Tratamento de Erros

- **Falha de rede**: A aplicação detecta erros de conectividade e exibe mensagens apropriadas
- **Arquivo não disponível**: Se um arquivo não estiver disponível, ele é excluído do ZIP
- **Versão incompatível**: Mensagens claras indicam quando não há versões compatíveis

## 📄 Licença

Este projeto está licenciado sob a **MIT License**.  
Consulte o arquivo [LICENSE](./LICENSE) para o texto completo.

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se livre para abrir issues e pull requests.
Ao enviar contribuições, você concorda que seu código será disponibilizado sob a mesma **MIT License** deste projeto.

### Checklist de PR

- [ ] Atualizou documentação de stack se houve mudança de versão major.

## 📮 Suporte

Para questões ou problemas, abra uma issue no repositório.
