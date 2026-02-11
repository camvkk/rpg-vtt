import { useState } from 'react';
import '../styles/Lobby.css';

export default function Lobby({ onCreateRoom, onJoinRoom, isLoading, error }) {
  const [mode, setMode] = useState('join');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    if (mode === 'create') {
      await onCreateRoom(playerName.trim());
    } else {
      if (!roomCode.trim()) return;
      await onJoinRoom(roomCode.trim().toUpperCase(), playerName.trim());
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-bg" />

      <div className="lobby-content fade-in">
        <header className="lobby-header">
          <h1 className="heading-xl">RPG VTT</h1>
          <p className="text-dim" style={{ marginTop: 8, fontSize: '1.1rem', letterSpacing: '0.05em' }}>
            Virtual Tabletop • Dark Fantasy Edition
          </p>
        </header>

        <div className="panel lobby-card">
          {/* Tabs */}
          <div className="lobby-tabs">
            <button
              className={`lobby-tab ${mode === 'join' ? 'active' : ''}`}
              onClick={() => setMode('join')}
            >
              🏠 Entrar na Mesa
            </button>
            <button
              className={`lobby-tab ${mode === 'create' ? 'active' : ''}`}
              onClick={() => setMode('create')}
            >
              ⚔️ Mestre da Mesa
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Seu Nome</label>
              <input
                type="text"
                className="input"
                placeholder="Digite seu nome de aventureiro..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                required
              />
            </div>

            {mode === 'join' && (
              <div className="form-group">
                <label className="form-label">Código da Mesa</label>
                <input
                  type="text"
                  className="input lobby-code-input"
                  placeholder="ABCD12"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  required
                />
              </div>
            )}

            {error && (
              <div className="lobby-error">⚠️ {error}</div>
            )}

            <button
              type="submit"
              className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-secondary'} lobby-submit`}
              disabled={isLoading}
            >
              {isLoading
                ? (mode === 'create' ? '⏳ Criando...' : '⏳ Entrando...')
                : (mode === 'create' ? '🎲 Criar Nova Mesa' : '⚡ Entrar na Aventura')
              }
            </button>
          </form>

          {/* Description */}
          <div className="lobby-desc">
            {mode === 'create' ? (
              <>
                <h3 className="heading-sm text-primary">Mestres da Masmorra</h3>
                <p className="text-dim">Controle o mundo, NPCs e a narrativa.</p>
                <ul className="lobby-features">
                  <li>✨ Upload de mapas personalizados</li>
                  <li>🎭 Controle total de tokens e NPCs</li>
                  <li>🌫️ Sistema de Fog of War</li>
                  <li>🎵 Controle de ambientação sonora</li>
                </ul>
              </>
            ) : (
              <>
                <h3 className="heading-sm text-secondary">Aventureiros</h3>
                <p className="text-dim">Entre na aventura com seus amigos!</p>
                <ul className="lobby-features">
                  <li>🏃‍♂️ Mova seu personagem pelo mapa</li>
                  <li>🎲 Sistema completo de dados</li>
                  <li>💬 Chat integrado com o grupo</li>
                  <li>📋 Ficha de personagem D&D 5e</li>
                </ul>
              </>
            )}
          </div>
        </div>

        <footer className="text-dim" style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.85rem' }}>
          Baseado em D&D 5e • Zero cadastro • Real-time multiplayer
        </footer>
      </div>
    </div>
  );
}
