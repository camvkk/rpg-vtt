# RPG VTT — Virtual Tabletop Premium

## Visão
Um Roll20 moderno, bonito e funcional. Dark fantasy UI, real-time multiplayer, zero cadastro.

## Stack
- **Frontend:** React 18 + Vite + Pixi.js 8 (canvas) + Socket.io-client
- **Backend:** Node.js + Express + Socket.io + SQLite (better-sqlite3)
- **Auth:** Sala com código de 6 caracteres, sem login
- **Deploy:** Local dev primeiro, depois Vercel (front) + Railway (back)

## Estrutura
```
rpg-vtt/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── db.js             # SQLite setup
│   ├── rooms.js          # Room management
│   ├── game-state.js     # State sync engine
│   └── dice.js           # Dice parser & roller
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Lobby.jsx         # Create/Join room
│   │   │   ├── GameBoard.jsx     # Main game view
│   │   │   ├── MapCanvas.jsx     # Pixi.js map + grid + tokens
│   │   │   ├── TokenLayer.jsx    # Token management
│   │   │   ├── FogOfWar.jsx      # Fog overlay
│   │   │   ├── DiceRoller.jsx    # Dice UI + animations
│   │   │   ├── ChatPanel.jsx     # Chat + dice log
│   │   │   ├── Initiative.jsx    # Initiative tracker
│   │   │   ├── CharSheet.jsx     # Character sheet D&D 5e
│   │   │   ├── Toolbar.jsx       # DM tools
│   │   │   └── Ambiance.jsx      # Music/SFX controls
│   │   ├── hooks/
│   │   │   ├── useSocket.js      # Socket.io hook
│   │   │   └── useGameState.js   # Shared state hook
│   │   ├── utils/
│   │   │   ├── diceParser.js     # Parse "2d20+5"
│   │   │   └── gridUtils.js      # Grid math
│   │   └── styles/
│   │       └── theme.css         # Dark fantasy theme
│   ├── public/
│   │   └── assets/               # Default tokens, maps
│   ├── index.html
│   └── vite.config.js
├── package.json
└── README.md
```

## Features MVP

### 1. Lobby
- DM clica "Criar Sala" → gera código de 6 chars
- Jogadores entram com código + nome + avatar
- DM vê lista de jogadores conectados
- Botão "Iniciar Aventura"

### 2. Mapa (Pixi.js)
- Grid quadrado (padrão 5ft)
- Zoom (scroll) + Pan (drag com botão do meio ou espaço)
- DM pode fazer upload de imagem como mapa
- Mapas pré-carregados (taverna, dungeon, floresta, etc)
- Camadas: mapa → grid → fog → tokens → UI

### 3. Tokens
- DM arrasta tokens pro mapa
- Cada jogador controla seu token
- Tokens com HP bar, nome, conditions
- Snap-to-grid
- Seleção com highlight

### 4. Fog of War
- Tela inteira coberta por padrão
- DM revela áreas (brush circular ou retangular)
- Jogadores só veem áreas reveladas

### 5. Dice Roller
- Input: /roll 2d20+5, /roll 4d6kh3 (keep highest 3)
- Animação de dados 3D (CSS)
- Resultado aparece no chat pra todos
- Rolagem secreta do DM (/gmroll)
- Cores diferentes por tipo: ataque, dano, save, skill

### 6. Chat
- Mensagens de texto
- Log de dice rolls com formatação
- Mensagens de sistema (X entrou, combate iniciado)
- Whisper (/w nome mensagem)

### 7. Iniciativa
- DM clica "Rolar Iniciativa"
- Cada jogador rola ou DM rola por todos
- Lista ordenada com turno atual destacado
- Botão "Próximo Turno"
- Conditions com ícones (stunned, poisoned, etc)

### 8. Ficha D&D 5e (simplificada)
- Nome, Classe, Nível, Raça
- 6 Atributos + Modificadores
- HP atual/máximo + HP temporário
- AC, Initiative bonus, Speed
- Skills com proficiency
- Ataques rápidos (botão que rola direto)
- Painel lateral colapsável

### 9. Ambientação
- Player de música com presets (taverna, batalha, floresta, dungeon)
- Controle de volume
- SFX rápidos (espada, magia, porta)
- DM controla, todos ouvem

### 10. UI/UX
- Dark theme com tons de dourado/âmbar (#1a1a2e, #16213e, #e2b714)
- Fonte medieval/fantasy para títulos (Cinzel)
- Fonte clean para corpo (Inter)
- Painel lateral direito: chat + dice
- Painel lateral esquerdo: ficha + iniciativa (colapsável)
- Toolbar superior: ferramentas do DM
- Responsivo (funciona em tablet)
- Transições suaves, micro-animações

## Eventos Socket.io

### Server → Client
- `room:joined` — jogador entrou
- `room:state` — estado completo da sala
- `map:update` — mudança no mapa
- `token:move` — token moveu
- `token:update` — token HP/condition mudou
- `fog:reveal` — área revelada
- `dice:result` — resultado de rolagem
- `chat:message` — mensagem no chat
- `initiative:update` — mudança na iniciativa
- `ambiance:change` — música mudou

### Client → Server
- `room:create` — criar sala
- `room:join` — entrar na sala
- `token:move` — mover token
- `token:add` — adicionar token (DM)
- `fog:reveal` — revelar fog (DM)
- `dice:roll` — rolar dados
- `chat:send` — enviar mensagem
- `initiative:roll` — rolar iniciativa
- `initiative:next` — próximo turno
- `ambiance:set` — mudar música (DM)

## Paleta de Cores
- Background: #0f0f1a
- Surface: #1a1a2e
- Surface Light: #16213e
- Primary: #e2b714 (dourado)
- Secondary: #c77dff (roxo mágico)
- Accent: #ff6b6b (vermelho perigo)
- Success: #51cf66
- Text: #e8e8e8
- Text Dim: #8888aa
- Border: #2a2a4a
