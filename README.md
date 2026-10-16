# RPG VTT v2 — Mesa Virtual Dark Fantasy

Mesa virtual para D&D 5e (SRD 5.1) feita para abrir e jogar: sem cadastro, em tempo real, no navegador (computador ou celular).

## O que tem

**Mapa vivo (PixiJS 8)**
- Iluminação dinâmica: tochas, lampiões, magias de luz e luar recortados por paredes, com chama tremulando e brilho colorido.
- Visão por jogador: cada um vê o que seus tokens veem (linha de visão + luz + visão no escuro), com memória das áreas já exploradas.
- Paredes, portas (abrir/fechar/trancar, portas secretas que parecem paredes), janelas e véus.
- Névoa manual do Mestre (retângulo, círculo, polígono), ciclo dia/noite, clima com partículas (chuva, tempestade com relâmpagos, neve, neblina, brasas, cinzas, folhas, areia).
- Grade quadrada ou hexagonal com alinhamento fino, régua compartilhada com as regras de diagonal do 5e, pings, desenhos e notas no mapa.
- Áreas de magia (esfera, cone, linha, cubo) que destacam as casas atingidas e já marcam os alvos.

**Regras automatizadas (5e)**
- Ficha completa com cálculo automático (modificadores, perícias, CA com armadura/escudo/Defesa sem Armadura, CD de magia) e rolagem com um clique (Shift = vantagem, Ctrl = desvantagem).
- Ataques contra a CA de cada alvo com card no chat (acerto/erro/crítico), dano dobrado no crítico e botão do Mestre para aplicar dano (½, ×1, ×2).
- Magias com espaços de magia, conjuração em nível superior, salvaguardas automáticas dos NPCs e pendentes para os jogadores.
- Combate com iniciativa, turnos, rodadas, condições com duração, testes de morte e lembrete de concentração.
- Compêndio SRD em PT-BR: 319 magias, monstros, itens, condições, raças, classes e antecedentes.

**Mesa**
- Dados 3D com física (o resultado vem do servidor e todos veem o mesmo rolar).
- Chat com comandos (`/r`, `/gr`, `/br`, `/w`, `/me`, `/ooc`, `/desc`), falar como personagem e sussurros.
- Diário/handouts com markdown, compartilhamento por jogador e "mostrar para todos".
- Áudio sincronizado: trilhas, ambientes procedurais (taverna, floresta, masmorra, tempestade…) e efeitos sonoros.
- Oráculo do Mestre (IA via Kimi): NPCs com ficha, descrição de cena, encontros balanceados, regras, resumo da sessão, nomes e tesouros.
- Sistema customizado: o Mestre envia as regras do próprio RPG (PDF, DOCX, TXT/MD ou texto colado), a IA monta atributos, perícias, raças, classes, equipamentos e mecânicas, e as fichas passam a rolar por essas regras (também importa/exporta JSON).

**Base sólida**
- Servidor autoritativo: toda ação passa por validação (zod) e checagem de permissão; jogadores recebem só o que podem ver.
- Reconexão automática com token de sessão; SQLite embutido do Node (sem dependências nativas); uploads verificados por assinatura de arquivo.

## Rodando

Requer **Node 24+**.

```bash
npm install
npm run dev
```

Abra http://localhost:5173. O servidor roda em :3001 (o Vite faz o proxy).

Para jogar com amigos pela internet a partir do seu PC:

```bash
npm run play
```

Isso compila o cliente e serve tudo em http://localhost:3001. Exponha a porta com um túnel (ex: `cloudflared tunnel --url http://localhost:3001`) e mande o link.

### IA (opcional)

Copie `.env.example` para `.env` e defina `MOONSHOT_API_KEY` ou `OPENROUTER_API_KEY`. Sem chave, tudo funciona e só o Oráculo e a importação de sistemas por IA ficam desligados (importar um sistema em JSON continua funcionando).

### Deploy

Um único serviço (cliente + API + WebSocket). Há `Dockerfile` e `render.yaml` (Render no plano grátis). Qualquer host que rode Docker serve.

Sem disco persistente (Render grátis), defina `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` de um bucket S3 (ex: Backblaze B2, 10 GB grátis): o banco é restaurado do bucket ao ligar, salvo lá a cada mudança (~30 s) e no desligamento, e os uploads vão direto pra lá. Nunca use o mesmo bucket em dois servidores ao mesmo tempo. Com disco/volume persistente em `DATA_DIR`, não precisa de bucket.

## Estrutura

```
shared/   tipos, protocolo, ações (schema + permissão + reducer), dados, geometria, regras 5e, compêndio
server/   Express + Socket.IO, salas, projeção por jogador, SQLite, uploads, IA
client/   React 19 + Vite, motor do mapa (Pixi), painéis, dados 3D, áudio
```

Testes: `npm test` · Tipos: `npm run typecheck`

Conteúdo de regras: System Reference Document 5.1 (CC-BY-4.0).
