# Como Iniciar o Servidor RPG VTT

## Método Recomendado (Windows)

```bash
# Navegar para o diretório
cd projects/rpg-vtt

# Executar diretamente com Node.js
node server/index.js
```

## Ou via npm (alternativo)

```bash
cd projects/rpg-vtt
npm run server
```

## URLs de Teste

Após iniciar o servidor:

- **Health Check**: http://localhost:3001/
- **Lista de Salas**: http://localhost:3001/api/rooms

## Status Esperado

```
✅ Database initialized successfully
🎲 RPG VTT Server running on port 3001
🌐 Health check: http://localhost:3001/
📊 Rooms API: http://localhost:3001/api/rooms
```

## Logs de Funcionamento

O servidor mostrará logs em tempo real:
- 🏠 Room created: [CODE] by [DM_NAME]
- 👤 [PLAYER] joined room [CODE]
- 🎭 Token added/moved/updated
- 🎲 Dice rolls
- 💬 Chat messages
- ⚡ Initiative rolls

## Para Parar

Pressione `Ctrl+C` no terminal onde o servidor está rodando.