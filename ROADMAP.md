# 🎮 RPG VTT — Roadmap "Foundry 2.0"

> **Visão:** Poder do Foundry, simplicidade do Roll20, zero setup.
> **Tagline:** "O VTT que você abre e joga."

---

## 📊 Comparativo: Foundry vs Nosso VTT

| Feature | Foundry | Roll20 | Nós (Atual) | Prioridade |
|---------|---------|--------|-------------|------------|
| **Zero setup (browser)** | ❌ (self-host) | ✅ | ✅ | — |
| **App local (offline)** | ✅ (Electron) | ❌ | 🔜 Electron+P2P | 🔴 Alta |
| **Sistema customizável** | ✅ (módulos) | ❌ | ✅ (System Importer + IA) | — |
| **Lighting dinâmico** | ✅ | 💰 (pago) | ✅ (raycasting) | — |
| **Grid + mapa** | ✅ | ✅ | ⚠️ Básico | 🔴 Alta |
| **Fog of War** | ✅ | ✅ | ✅ (reveal areas) | — |
| **Tokens com HP/condições** | ✅ | ✅ | ✅ (HP bars, conditions) | — |
| **AoE/Spells visuais** | ✅ (módulo) | ❌ | ✅ (30+ magias D&D) | — |
| **Chat + dados** | ✅ | ✅ | ✅ | — |
| **Ficha de personagem** | ✅ | ✅ | ✅ (wizard 8 passos) | — |
| **Iniciativa tracker** | ✅ | ✅ | ✅ | — |
| **Journal/Handouts** | ✅ | ✅ | ⚠️ Google Docs embed | 🟡 Média |
| **Regras automatizadas** | ✅ | ❌ | ❌ | 🔴 Alta |
| **Macros** | ✅ | ✅ | ❌ | 🟡 Média |
| **Compendium (SRD)** | ✅ | 💰 | ❌ | 🟡 Média |
| **Multiplayer real-time** | ✅ | ✅ | ✅ (Socket.io) | — |
| **Música/ambience** | ✅ (módulo) | 💰 | ✅ (Web Audio API) | — |
| **Arrastar tokens no mapa** | ✅ | ✅ | ⚠️ Bugado | 🔴 Alta |
| **Medição de distância** | ✅ | ✅ | ✅ | — |
| **Desenho livre** | ✅ | ✅ | ✅ | — |
| **Importar mapas** | ✅ | ✅ | ✅ (URL + upload + built-in) | — |
| **Templates de mapa** | ✅ (módulo) | ❌ | ✅ (3 built-in) | 🟢 Baixa |
| **Line of Sight** | ✅ | 💰 | ✅ (walls + raycasting) | — |
| **Multi-sistema (não só D&D)** | ✅ | ⚠️ | ✅ (System Importer) | — |
| **Marketplace/módulos** | ✅ | ✅ | ❌ | 🟢 Futuro |
| **Mobile friendly** | ❌ | ⚠️ | ❌ | 🟡 Média |
| **IA integrada** | ❌ | ❌ | ✅ (Kimi K2.5 parsing) | — |
| **Preço** | $50 único | Grátis/Sub | **Grátis** | — |

---

## 🗺️ Fases de Desenvolvimento

### Fase 1 — Fundação Sólida (ATUAL → 2 semanas)
Polir o que já existe até ser usável de verdade.

- [ ] **Fix tokens no mapa** — arrastar, mover, snap to grid sem bugs
- [ ] **Navegação do mapa** — pan/zoom suave, minimap
- [ ] **Grid configurável** — hex/square, tamanho ajustável, snap toggle
- [ ] **Polish geral** — responsividade, loading states, error handling
- [ ] **Persistência robusta** — tokens, fog, drawings salvos no servidor

### Fase 2 — Motor de Regras (2-4 semanas)
O que transforma de "mapa bonito" em "VTT de verdade".

- [ ] **Regras automatizadas** — rolagem de ataque, dano, saving throws
- [ ] **Condições automáticas** — prone, stunned, etc afetam rolls
- [ ] **Turnos de combate** — tracker automático, next turn, delay, ready
- [ ] **HP automático** — dano/cura aplicados, death saves
- [ ] **Auras e efeitos** — paladin aura, bless, etc com range visual
- [ ] **Compendium SRD** — magias, itens, monstros do D&D 5e (conteúdo livre)

### Fase 3 — Journal & Narrativa (2-3 semanas)
Ferramentas do mestre pra contar história.

- [ ] **Journal nativo** — editor markdown, handouts pros jogadores
- [ ] **Notas no mapa** — pins clicáveis com texto/imagem
- [ ] **NPCs com ficha** — fichas de NPC/monstro com statblock
- [ ] **Encontros prontos** — CR calculator, loot tables
- [ ] **Whisper/secret rolls** — rolagens secretas do mestre
- [ ] **Macros simples** — botões customizáveis ("/roll 2d6+5 Fireball!")

### Fase 4 — App Desktop + P2P (3-4 semanas)
**A killer feature.** Jogue sem internet, sem servidor, sem latência.

- [ ] **Electron wrapper** — app instalável (Windows/Mac/Linux)
- [ ] **P2P via WebRTC/PeerJS** — mestre hospeda, jogadores conectam direto
- [ ] **Modo offline** — mestre prepara sessão sem internet
- [ ] **Sync local** — SQLite local, sync quando reconectar
- [ ] **Auto-update** — atualizações automáticas via electron-updater
- [ ] **Performance** — sem cold start do Render, zero latência

### Fase 5 — Ecossistema (futuro)
Quando tiver userbase.

- [ ] **Marketplace de módulos** — comunidade cria extensões
- [ ] **Templates de campanha** — "Maldição de Strahd starter pack"
- [ ] **Compartilhar sistemas** — mestres publicam seus sistemas custom
- [ ] **Mobile companion** — app mobile pra jogador (ficha + dados)
- [ ] **Streaming mode** — OBS overlay, twitch integration
- [ ] **IA narrativa** — NPC com IA, gerador de encontros/masmorras

---

## 💰 Modelo de Negócio (ideias)

| Tier | Preço | Features |
|------|-------|----------|
| **Free** | R$0 | Tudo que o Roll20 free faz + mais |
| **Pro** | R$19/mês | Storage ilimitado, IA avançada, prioridade no servidor |
| **App Desktop** | R$49 único | Electron app, P2P, modo offline |
| **Marketplace** | 70/30 | Criadores vendem módulos/mapas/sistemas |

**Diferencial competitivo principal:** Foundry cobra $50 e ainda precisa hospedar. A gente dá o web de graça e cobra $49 pelo app que é MELHOR que o Foundry (P2P nativo, zero config).

---

## 🎯 Norte

1. **Web grátis** = aquisição (todo mundo pode experimentar)
2. **System Importer** = retenção (mestre investe regras dele)
3. **App Desktop** = monetização (quem ama, paga)
4. **Marketplace** = ecossistema (comunidade cria valor)

---

*Criado em 12/02/2026*
