# Pesquisa: Efeitos de Clima em Virtual Tabletops

## Resumo Executivo

**Problema identificado:** Partículas de clima (rain, snow, fog) são criadas no código mas não aparecem na tela usando Pixi.js v8.

**Causa provável:** O Pixi.js v8 mudou completamente a API de partículas. O antigo `@pixi/particle-emitter` **NÃO funciona com v8** sem adaptação. O novo sistema usa `ParticleContainer` + `Particle` com uma API totalmente diferente.

---

## 1. Como os Principais VTTs Implementam Weather Effects

### 🎲 Foundry VTT (FXMaster)
**Abordagem:** Sistema de partículas próprio + shaders WebGL

**Detalhes técnicos:**
- Usa uma camada dedicada `WeatherEffects` que extende `FullCanvasObject`
- Partículas são gerenciadas em um `Container<DisplayObject>`
- Usa masking para delimitar áreas (regiões/tiles)
- Shaders customizados para efeitos como fog e underwater
- Performance ajustada automaticamente baseado no "Performance Mode" do cliente

**Código relevante (API pública):**
```javascript
// Foundry expõe uma API para weather effects
canvas.weather.initializeEffects(weatherEffectsConfig);
canvas.weather.clearEffects();
```

**Lições:**
- Escala partículas baseado no tamanho da cena
- Ajusta quantidade de partículas pelo nível de performance do cliente
- Usa masking para controle granular de áreas

**Links:**
- [FXMaster GitHub](https://github.com/gambit07/fxmaster)
- [Foundry Weather API](https://foundryvtt.com/api/classes/foundry.canvas.layers.WeatherEffects.html)

---

### 🦉 Owlbear Rodeo 2.3+
**Abordagem:** GPU Shaders via "Warp Core" engine

**Detalhes técnicos:**
- Weather é uma extensão que usa **GPU shaders diretamente**
- Não usa partículas tradicionais - o efeito é calculado inteiramente na GPU
- Extremamente performático (sem overhead de CPU)
- Extensível via API de Effects

**Código:**
```javascript
// Owlbear usa seu próprio engine "Warp Core"
// Effects são programados via shaders GLSL
```

**Lições:**
- Para performance máxima, shaders puros são imbatíveis
- Requer conhecimento de GLSL

**Links:**
- [Owlbear Weather Extension](https://github.com/owlbear-rodeo/weather)
- [GPU Effects Blog Post](https://blog.owlbear.rodeo/owlbear-rodeo-2-3-release-week-day-4/)

---

### 🎯 Roll20
**Abordagem:** Limitada - overlays de vídeo/GIF

Roll20 não tem sistema nativo de weather effects. Usuários usam:
- Tokens transparentes com GIFs animados
- Overlays de vídeo
- Macros que alteram a iluminação

---

## 2. O Problema com Pixi.js v8 e Partículas

### ⚠️ BREAKING CHANGES no v8

O `@pixi/particle-emitter` oficial **NÃO FUNCIONA** com Pixi v8!

**Mudanças críticas:**
1. `ParticleContainer` agora usa `Particle` ao invés de `Sprite`
2. API completamente diferente: `addParticle()` ao invés de `addChild()`
3. Propriedades dinâmicas precisam ser declaradas explicitamente
4. Texturas devem vir do **mesmo spritesheet** (mesma TextureSource)

### ✅ Solução: Fork Compatível com v8

Existe um fork que funciona com Pixi v8:

```bash
npm install @spd789562/particle-emitter
```

**Uso correto com Pixi v8:**
```typescript
import { Emitter } from '@spd789562/particle-emitter';
import { ParticleContainer, Texture } from 'pixi.js';

// CRÍTICO: Criar ParticleContainer com as propriedades corretas
const particleContainer = new ParticleContainer({
  dynamicProperties: {
    uvs: true,       // Se usar múltiplas texturas do mesmo atlas
    vertex: true,    // Se texturas têm tamanhos diferentes
    position: true,  // Sempre true para movimento
    rotation: true,  // Se partículas rotacionam
    scale: true,     // Se partículas mudam de escala
    color: true,     // Se partículas mudam de cor/alpha
  },
});

// Criar emitter
const emitter = new Emitter(
  particleContainer,  // DEVE ser ParticleContainer, não Container
  {
    lifetime: { min: 0.5, max: 2 },
    frequency: 0.01,
    maxParticles: 1000,
    behaviors: [
      { type: 'textureSingle', config: { texture: Texture.from('raindrop.png') } },
      // ... outros behaviors
    ],
  }
);

// IMPORTANTE: Adicionar o container à cena
app.stage.addChild(particleContainer);

// Update loop
let elapsed = Date.now();
function update() {
  const now = Date.now();
  emitter.update((now - elapsed) * 0.001);
  elapsed = now;
  requestAnimationFrame(update);
}

emitter.emit = true;
update();
```

**Links:**
- [Fork para v8](https://jsr.io/@spd789562/particle-emitter)
- [Editor de Partículas v8](https://spd789562.github.io/pixi-v8-particle-emitter/)
- [Documentação ParticleContainer v8](https://pixijs.com/8.x/guides/components/scene-objects/particle-container)

---

## 3. Abordagens Alternativas

### Opção A: Pixi.js v8 com @spd789562/particle-emitter
**Prós:** Mantém stack atual, configs compatíveis com editor
**Contras:** Fork não-oficial, pode ficar desatualizado
**Dificuldade:** ⭐⭐ Fácil

### Opção B: Partículas manuais com ParticleContainer nativo
**Prós:** Zero dependências, controle total
**Contras:** Mais código, sem editor visual
**Dificuldade:** ⭐⭐⭐ Média

### Opção C: GPU Shaders (como Owlbear)
**Prós:** Performance máxima, efeitos mais realistas
**Contras:** Requer conhecimento de GLSL
**Dificuldade:** ⭐⭐⭐⭐⭐ Difícil

### Opção D: CSS Animations + Overlay
**Prós:** Simples, funciona em qualquer framework
**Contras:** Não integra com o canvas, limitado
**Dificuldade:** ⭐ Muito Fácil

### Opção E: Sparticles (Canvas 2D puro)
**Prós:** Leve, fácil de usar, React-friendly
**Contras:** Outro canvas separado do Pixi
**Dificuldade:** ⭐⭐ Fácil

---

## 4. Recomendação Técnica

### 🏆 Recomendação: Opção A (com fallback para B)

**Por quê:**
1. Menor mudança no código existente
2. Configs de partículas são JSON - fáceis de ajustar
3. Editor visual disponível
4. Se o fork parar de funcionar, migrar para B é simples

### Checklist de Debugging

Se as partículas ainda não aparecem após usar o fork correto:

1. ✅ **Container correto?** Deve ser `ParticleContainer`, não `Container`
2. ✅ **Adicionado à cena?** `app.stage.addChild(particleContainer)`
3. ✅ **Update loop rodando?** `emitter.update(delta)` a cada frame
4. ✅ **emitter.emit = true?** Emitter precisa estar ativo
5. ✅ **Textura carregada?** Verificar se a textura existe antes de criar emitter
6. ✅ **dynamicProperties corretos?** Se position não for dynamic, partículas não movem
7. ✅ **Z-index/ordem?** Container pode estar atrás de outros elementos
8. ✅ **Posição do emitter?** `emitter.updateOwnerPos(x, y)` ou spawn position
9. ✅ **Viewport visível?** Partículas podem estar fora da área visível

---

## 5. Código de Prova de Conceito

### Rain Effect para Pixi v8

```typescript
// weather-effects.ts
import { ParticleContainer, Texture, Application } from 'pixi.js';
import { Emitter } from '@spd789562/particle-emitter';

export function createRainEffect(app: Application, bounds: { width: number; height: number }) {
  // Container com propriedades dinâmicas necessárias
  const container = new ParticleContainer({
    dynamicProperties: {
      position: true,
      rotation: true,
      scale: true,
      color: true,
      vertex: false,
      uvs: false,
    },
  });

  // Criar textura de gota (pode ser um sprite 4x16 branco)
  const dropTexture = createDropTexture(app);

  const rainConfig = {
    lifetime: { min: 0.5, max: 1.5 },
    frequency: 0.001,
    spawnChance: 1,
    particlesPerWave: 5,
    maxParticles: 500,
    pos: { x: bounds.width / 2, y: -20 },
    behaviors: [
      {
        type: 'alpha',
        config: {
          alpha: {
            list: [
              { value: 0.7, time: 0 },
              { value: 0.3, time: 1 },
            ],
          },
        },
      },
      {
        type: 'scale',
        config: {
          scale: {
            list: [
              { value: 0.1, time: 0 },
              { value: 0.05, time: 1 },
            ],
          },
        },
      },
      {
        type: 'moveSpeed',
        config: {
          speed: {
            list: [
              { value: 800, time: 0 },
              { value: 1200, time: 1 },
            ],
          },
        },
      },
      {
        type: 'rotationStatic',
        config: { min: 80, max: 100 }, // Ângulo da chuva (quase vertical)
      },
      {
        type: 'spawnShape',
        config: {
          type: 'rect',
          data: {
            x: -bounds.width / 2,
            y: 0,
            w: bounds.width,
            h: 10,
          },
        },
      },
      {
        type: 'textureSingle',
        config: { texture: dropTexture },
      },
    ],
  };

  const emitter = new Emitter(container, rainConfig);
  emitter.emit = true;

  // Adicionar à cena
  app.stage.addChild(container);

  // Update function
  let elapsed = Date.now();
  const update = () => {
    const now = Date.now();
    emitter.update((now - elapsed) * 0.001);
    elapsed = now;
  };

  return {
    container,
    emitter,
    update,
    destroy: () => {
      emitter.destroy();
      container.destroy();
    },
  };
}

// Helper para criar textura de gota
function createDropTexture(app: Application): Texture {
  const graphics = new PIXI.Graphics();
  graphics.rect(0, 0, 2, 16);
  graphics.fill(0xffffff);
  return app.renderer.generateTexture(graphics);
}
```

### Snow Effect

```typescript
export function createSnowEffect(app: Application, bounds: { width: number; height: number }) {
  const container = new ParticleContainer({
    dynamicProperties: {
      position: true,
      rotation: true,
      scale: true,
      color: true,
    },
  });

  const snowConfig = {
    lifetime: { min: 3, max: 6 },
    frequency: 0.02,
    maxParticles: 200,
    pos: { x: bounds.width / 2, y: -10 },
    behaviors: [
      {
        type: 'alpha',
        config: {
          alpha: {
            list: [
              { value: 0, time: 0 },
              { value: 0.8, time: 0.1 },
              { value: 0.8, time: 0.9 },
              { value: 0, time: 1 },
            ],
          },
        },
      },
      {
        type: 'scale',
        config: {
          scale: {
            list: [
              { value: 0.05, time: 0 },
              { value: 0.1, time: 1 },
            ],
          },
          minMult: 0.5,
        },
      },
      {
        type: 'moveSpeed',
        config: {
          speed: {
            list: [
              { value: 50, time: 0 },
              { value: 100, time: 1 },
            ],
          },
        },
      },
      {
        type: 'rotationStatic',
        config: { min: 160, max: 200 },
      },
      {
        type: 'rotation',
        config: {
          accel: 0,
          minSpeed: 50,
          maxSpeed: 100,
          minStart: 0,
          maxStart: 360,
        },
      },
      {
        type: 'spawnShape',
        config: {
          type: 'rect',
          data: { x: -bounds.width / 2, y: 0, w: bounds.width, h: 10 },
        },
      },
      {
        type: 'textureSingle',
        config: { texture: Texture.from('snowflake.png') }, // Usar sprite de floco
      },
    ],
  };

  const emitter = new Emitter(container, snowConfig);
  emitter.emit = true;
  app.stage.addChild(container);

  let elapsed = Date.now();
  return {
    container,
    emitter,
    update: () => {
      const now = Date.now();
      emitter.update((now - elapsed) * 0.001);
      elapsed = now;
    },
    destroy: () => {
      emitter.destroy();
      container.destroy();
    },
  };
}
```

### Fog Effect (Shader approach)

```typescript
// Para fog, um shader é mais eficiente que partículas
export function createFogEffect(app: Application) {
  const fogContainer = new PIXI.Container();
  
  // Criar múltiplas camadas de fog com diferentes velocidades (parallax)
  const layers = [
    { alpha: 0.3, speed: 0.2, scale: 1.5 },
    { alpha: 0.2, speed: 0.4, scale: 1.2 },
    { alpha: 0.1, speed: 0.6, scale: 1.0 },
  ];

  const fogSprites: PIXI.TilingSprite[] = [];

  layers.forEach((layer, i) => {
    const fogSprite = new PIXI.TilingSprite({
      texture: Texture.from('fog-texture.png'), // Textura seamless de fog
      width: app.screen.width * layer.scale,
      height: app.screen.height * layer.scale,
    });
    fogSprite.alpha = layer.alpha;
    fogSprite.blendMode = 'add';
    fogContainer.addChild(fogSprite);
    fogSprites.push(fogSprite);
  });

  app.stage.addChild(fogContainer);

  return {
    container: fogContainer,
    update: (delta: number) => {
      fogSprites.forEach((sprite, i) => {
        sprite.tilePosition.x += layers[i].speed * delta;
        sprite.tilePosition.y += layers[i].speed * 0.3 * delta;
      });
    },
    destroy: () => {
      fogContainer.destroy({ children: true });
    },
  };
}
```

---

## 6. Links e Recursos

### Bibliotecas
- **@spd789562/particle-emitter** (Pixi v8): https://jsr.io/@spd789562/particle-emitter
- **Sparticles** (Canvas 2D puro): https://github.com/simeydotme/sparticles
- **react-weather-effects** (Three.js): https://github.com/rauschermate/react-weather-effects

### Editores de Partículas
- **Pixi v8 Particle Editor**: https://spd789562.github.io/pixi-v8-particle-emitter/
- **Editor Original (v7)**: https://userland.pixijs.io/particle-emitter-editor/

### Exemplos de Código
- **Rain effect original**: https://userland.pixijs.io/particle-emitter/examples/rain.html
- **Snow effect**: https://userland.pixijs.io/particle-emitter/examples/snow.html
- **CSS Rain**: https://codepen.io/arickle/pen/XKjMZY

### Documentação
- **Pixi v8 ParticleContainer**: https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- **Pixi v8 Migration Guide**: https://pixijs.com/8.x/guides/migrations/v8
- **FXMaster (Foundry)**: https://github.com/gambit07/fxmaster

---

## 7. Próximos Passos Sugeridos

1. **Instalar o fork correto:**
   ```bash
   npm install @spd789562/particle-emitter
   ```

2. **Atualizar o código de WeatherLayer** para usar `ParticleContainer` ao invés de `Container`

3. **Garantir que o update loop está rodando** no ticker do Pixi

4. **Testar com uma config simples** primeiro (ex: só position + textureSingle)

5. **Ajustar z-index** do layer de weather para ficar acima do mapa

---

*Pesquisa realizada em 14/02/2026*
