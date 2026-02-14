# Redesign Visual - Inspirado no Owlbear Rodeo 2.0

## 📋 Resumo Executivo

Este documento propõe uma reformulação visual completa do nosso VTT, inspirada no design do Owlbear Rodeo 2.0, mantendo toda a lógica e funcionalidades existentes.

**Princípio:** Trocar a lataria, manter o motor.

---

## 🎯 Filosofia de Design do Owlbear

### 1. Design for Motion (Movimento)
- Animações pensadas desde o conceito, não como afterthought
- Elementos crescem/encolhem suavemente ao mudar de estado
- Transições fluidas entre telas e estados

### 2. Design for Fun (Diversão)
- Interações prazerosas (dados tremendo antes de rolar, etc)
- Feedback visual satisfatório
- "A diversão fica, custe o que custar" - outras coisas se adaptam

### 3. Design for Delight (Encantamento)
- Micro-interações que surpreendem
- Câmera que faz zoom em resultados importantes
- Elementos que "pulam" e "dançam"

### 4. Minimal UI
- Interface ocupa pouco espaço
- Foco no conteúdo (mapa)
- Informação aparece quando necessária, some quando não

---

## 🔍 Análise: Owlbear vs Nosso VTT Atual

| Aspecto | Owlbear 2.0 | Nosso VTT Atual |
|---------|-------------|-----------------|
| **Layout base** | Dock flutuante na parte inferior | Sidebars laterais fixas |
| **Toolbar** | Minimalista, ícones limpos | Botões tradicionais com texto |
| **Popovers** | Bubbles flutuantes que se adaptam | Modais/painéis fixos |
| **Animações** | Suaves, spring-based | Mínimas ou ausentes |
| **Mobile** | First-class citizen | Secundário |
| **Cores** | Tons escuros, acentos sutis | Tema variável mas menos polido |
| **Tipografia** | Moderna, hierarquia clara | Funcional |
| **Ícones** | Custom, consistentes | Mix de emojis e ícones |

---

## 🏗️ Arquitetura Proposta

### Camadas de Abstração (não mudam)
```
┌─────────────────────────────────────┐
│         NOVA UI (React)             │  ← MUDA
├─────────────────────────────────────┤
│      Hooks & Contexts (existentes)  │  ← MANTÉM
├─────────────────────────────────────┤
│      GameContext / Socket.io        │  ← MANTÉM
├─────────────────────────────────────┤
│         Backend (Node/Express)      │  ← MANTÉM
└─────────────────────────────────────┘
```

### Novo Sistema de Layout

```
┌─────────────────────────────────────────────────────┐
│  ┌─────┐                              ┌─────────┐  │
│  │MENU │         CANVAS/MAPA          │ PLAYERS │  │
│  │     │                              │ BUBBLES │  │
│  └─────┘                              └─────────┘  │
│                                                     │
│                                                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │              DOCK (expandível)                 │ │
│  │  [🎭] [📦] [🔍] [⚙️]    |  conteúdo dinâmico  │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 📦 Componentes Novos a Criar

### 1. **Dock** (Componente Principal)
- Barra inferior flutuante
- Tabs: Tokens, Items, Search, Settings
- Expande/colapsa com animação suave
- Keyboard shortcuts (1-6)

### 2. **Bubble System**
- Containers flutuantes para:
  - Dice roller
  - Chat
  - Initiative tracker
  - Player info
- Arrastáveis, minimizáveis
- Evitam colisão com UI existente

### 3. **ContextualToolbar**
- Toolbar minimalista no topo
- Mostra tools baseado no contexto
- Aparece/desaparece conforme seleção

### 4. **PlayerPresence**
- Avatares dos players no canto
- Indicador de quem está arrastando o quê
- Cursor compartilhado em tempo real

### 5. **AnimatedContainer**
- Wrapper que adiciona animações automáticas
- Spring-based physics (framer-motion ou react-spring)
- Usado em todos os elementos UI

---

## 🎨 Design System Novo

### Cores
```css
:root {
  /* Base */
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-surface: #1f2937;
  --bg-elevated: #374151;
  
  /* Text */
  --text-primary: #f3f4f6;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  
  /* Accent */
  --accent-primary: #6366f1;    /* Indigo */
  --accent-success: #10b981;    /* Emerald */
  --accent-warning: #f59e0b;    /* Amber */
  --accent-danger: #ef4444;     /* Red */
  
  /* Effects */
  --shadow-glow: 0 0 20px rgba(99, 102, 241, 0.3);
  --blur-glass: blur(12px);
}
```

### Tipografia
```css
:root {
  --font-sans: 'Inter', -apple-system, sans-serif;
  --font-display: 'Cinzel', serif;  /* Para títulos fantasy */
  
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
}
```

### Animações
```css
:root {
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
}
```

---

## 📋 Plano de Migração (Fases)

### Fase 1: Fundação (1-2 dias)
- [ ] Instalar framer-motion ou react-spring
- [ ] Criar novo design system (CSS variables)
- [ ] Criar componente AnimatedContainer
- [ ] Criar componente Bubble base

### Fase 2: Dock System (2-3 dias)
- [ ] Criar componente Dock
- [ ] Migrar ScenesPanel → Dock tab
- [ ] Migrar token sidebar → Dock tab
- [ ] Adicionar search na Dock
- [ ] Keyboard shortcuts

### Fase 3: Toolbar & Tools (1-2 dias)
- [ ] Criar ContextualToolbar
- [ ] Redesenhar tool selection
- [ ] Adicionar tooltips animados

### Fase 4: Bubbles & Popovers (2-3 dias)
- [ ] Migrar DiceRoller → Bubble
- [ ] Migrar ChatPanel → Bubble
- [ ] Migrar InitiativeTracker → Bubble
- [ ] Sistema de posicionamento inteligente

### Fase 5: Polish (2-3 dias)
- [ ] Adicionar micro-interações
- [ ] Melhorar feedback visual
- [ ] Otimizar mobile
- [ ] Ajustar todas as animações

### Fase 6: DM Dashboard (1-2 dias)
- [ ] Redesenhar DMDashboard
- [ ] Integrar com novo sistema

---

## 🔧 Dependências Novas

```json
{
  "framer-motion": "^11.x",      // Animações
  "lucide-react": "^0.x",        // Ícones consistentes
  "@radix-ui/react-*": "^1.x",   // Primitivos acessíveis (opcional)
  "tailwindcss": "^3.x"          // Utility classes (opcional)
}
```

---

## ⚠️ O Que NÃO Muda

- `GameContext.jsx` - toda lógica de estado
- `MapCanvas.jsx` - renderização Pixi.js (apenas o wrapper muda)
- Sistema de weather/partículas
- Fog of war
- Socket.io handlers
- Backend completo
- Estrutura de dados (tokens, walls, doors, etc)

---

## 🎬 Exemplo: Antes vs Depois

### Dice Roller - Antes
```
┌─────────────────┐
│  Roll Dice      │
│  [d4][d6][d8]   │
│  [d10][d12][d20]│
│  [Roll Button]  │
│  Result: 15     │
└─────────────────┘
```

### Dice Roller - Depois
```
┌─────────────────────────────────┐
│  🎲                              │
│     ⚄  ⚅  ⚂   (tremendo)       │
│                                  │
│  [━━━━━━━━━━○] segurar p/ rolar │
│                                  │
│  ✨ 15 ✨  (zoom + glow)         │
└─────────────────────────────────┘
```

---

## 📊 Estimativa de Tempo

| Fase | Tempo | Complexidade |
|------|-------|--------------|
| Fundação | 1-2 dias | Baixa |
| Dock System | 2-3 dias | Média |
| Toolbar | 1-2 dias | Baixa |
| Bubbles | 2-3 dias | Média |
| Polish | 2-3 dias | Média |
| DM Dashboard | 1-2 dias | Média |
| **Total** | **9-15 dias** | - |

---

## 🚀 Próximos Passos

1. **Aprovar este plano** - Cauê decide se segue
2. **Criar branch** - `feature/redesign-v2`
3. **Começar Fase 1** - Fundação do design system
4. **Iterar** - Mostrar progresso a cada fase

---

*Documento criado em 14/02/2026*
*Inspiração: Owlbear Rodeo 2.0*
