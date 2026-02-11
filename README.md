# RPG VTT Backend

A modern Virtual Tabletop backend for D&D and other tabletop RPGs. Built with Node.js, Express, Socket.io, and SQLite.

## Features

- **Room Management**: Create and join rooms with 6-character codes
- **Real-time Multiplayer**: WebSocket-based synchronization
- **Token System**: Add, move, and manage character/monster tokens
- **Map Support**: Upload and change battle maps
- **Fog of War**: Reveal areas as players explore
- **Advanced Dice Roller**: Supports complex notation (2d20kh1, 4d6kh3, etc.)
- **Initiative Tracker**: Roll initiative and track turn order
- **Chat System**: In-game chat with whisper support
- **Ambiance Control**: Background music and sound effects

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

Server runs on port 3001 by default.

## API Endpoints

### Health Checks
- `GET /` - Server status and health check
- `GET /api/rooms` - List all active rooms (for debugging)

## Socket.io Events

### Client → Server

#### Room Management
- `room:create` - Create a new room
  ```js
  socket.emit('room:create', { dmName: 'GameMaster' }, (response) => {
    // response.success, response.room
  });
  ```

- `room:join` - Join an existing room
  ```js
  socket.emit('room:join', { 
    code: 'ABC123', 
    playerName: 'Player1', 
    avatar: 'wizard.png' 
  }, (response) => {
    // response.success, response.room
  });
  ```

#### Token Management
- `token:add` - Add new token to map (DM only)
  ```js
  socket.emit('token:add', {
    name: 'Goblin',
    x: 100,
    y: 150,
    image_url: '/tokens/goblin.png',
    hp_current: 25,
    hp_max: 25
  });
  ```

- `token:move` - Move token on map
  ```js
  socket.emit('token:move', {
    tokenId: 'token-uuid',
    x: 200,
    y: 300
  });
  ```

- `token:update` - Update token properties
  ```js
  socket.emit('token:update', {
    tokenId: 'token-uuid',
    updates: {
      hp_current: 15,
      conditions: ['poisoned', 'prone']
    }
  });
  ```

- `token:remove` - Remove token from map
  ```js
  socket.emit('token:remove', { tokenId: 'token-uuid' });
  ```

#### Map Control
- `map:set` - Change active map (DM only)
  ```js
  socket.emit('map:set', { mapUrl: '/maps/dungeon.jpg' });
  ```

#### Fog of War
- `fog:reveal` - Reveal area of map (DM only)
  ```js
  socket.emit('fog:reveal', {
    x: 250,
    y: 300,
    radius: 100
  });
  ```

- `fog:clear` - Clear all fog (DM only)
  ```js
  socket.emit('fog:clear');
  ```

#### Dice Rolling
- `dice:roll` - Roll dice
  ```js
  socket.emit('dice:roll', {
    notation: '1d20+5',
    isSecret: false  // DM can roll secretly
  });
  ```

#### Chat
- `chat:send` - Send chat message
  ```js
  socket.emit('chat:send', {
    message: 'Hello everyone!',
    isWhisper: false,
    targetPlayer: null  // for whispers
  });
  ```

#### Initiative Tracking
- `initiative:roll` - Roll initiative for player
  ```js
  socket.emit('initiative:roll', {
    playerId: 'player-uuid',  // optional, defaults to current player
    modifier: 3
  });
  ```

- `initiative:next` - Advance to next turn (DM only)
  ```js
  socket.emit('initiative:next');
  ```

- `initiative:clear` - Clear initiative tracker (DM only)
  ```js
  socket.emit('initiative:clear');
  ```

#### Ambiance
- `ambiance:set` - Set background music (DM only)
  ```js
  socket.emit('ambiance:set', {
    trackUrl: '/music/tavern.mp3'
  });
  ```

### Server → Client

#### Room Events
- `room:joined` - Player joined room
- `room:left` - Player left room
- `room:state` - Complete room state update

#### Game State Events
- `token:add` - Token added to map
- `token:move` - Token moved
- `token:update` - Token updated
- `token:remove` - Token removed
- `map:update` - Map changed
- `fog:reveal` - Fog area revealed
- `fog:clear` - All fog cleared

#### Dice & Chat
- `dice:result` - Dice roll result
- `chat:message` - Chat message received

#### Initiative
- `initiative:update` - Initiative tracker updated

#### Ambiance
- `ambiance:change` - Background music changed

## Dice Notation

The system supports advanced dice notation:

### Basic Rolls
- `1d20` - Single twenty-sided die
- `2d6` - Two six-sided dice
- `1d8+3` - One eight-sided die plus 3

### Advantage/Disadvantage
- `2d20kh1` - Roll 2d20, keep highest (advantage)
- `2d20kl1` - Roll 2d20, keep lowest (disadvantage)

### Drop/Keep Modifiers
- `4d6kh3` - Roll 4d6, keep highest 3 (ability scores)
- `4d6dl1` - Roll 4d6, drop lowest 1 (same as above)

### Rerolls
- `1d20r1` - Reroll 1s
- `1d20r<=2` - Reroll 2 or lower

### Exploding Dice
- `1d6x` - Explode on 6 (roll additional die)
- `1d10x8` - Explode on 8+ (roll additional die)

### Complex Examples
- `8d6r1` - Fireball with reroll 1s
- `2d20kh1+5` - Attack with advantage and +5 bonus
- `4d6kh3+2d8+1d4` - Multiple dice types

## Database Schema

The backend uses SQLite with the following tables:

### rooms
- id, code, dm_name, created_at, is_active
- current_map, ambiance_track, initiative_turn

### players
- id, room_id, name, avatar, is_dm, socket_id
- joined_at, is_connected

### tokens
- id, room_id, owner_id, name, x, y
- image_url, size, hp_current, hp_max
- conditions, initiative, is_visible

### maps
- id, room_id, name, image_url
- width, height, grid_size, is_active

### chat_messages
- id, room_id, player_id, player_name
- message, message_type, is_whisper, target_player

### fog_of_war
- id, room_id, x, y, radius, revealed_at

## Architecture

```
server/
├── index.js          # Main Express + Socket.io server
├── db.js             # SQLite database setup and helpers
├── rooms.js          # Room management (create, join, leave)
├── game-state.js     # Game state synchronization
└── dice.js           # Advanced dice parsing and rolling
```

## Development

The server automatically creates a SQLite database in `server/data/rpg-vtt.db` on first run.

For development, use `npm run dev` which enables auto-restart on file changes.

## Frontend Integration

This backend is designed to work with a React frontend using Socket.io client. The frontend should connect to `http://localhost:3001` and implement the corresponding client-side event handlers.

Example client connection:
```js
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

// Join room
socket.emit('room:join', {
  code: roomCode,
  playerName: name,
  avatar: selectedAvatar
}, (response) => {
  if (response.success) {
    // Update UI with room state
    setRoomState(response.room);
  }
});

// Listen for game events
socket.on('token:move', (data) => {
  // Update token position in UI
});

socket.on('dice:result', (result) => {
  // Display dice result
});
```

## License

MIT License