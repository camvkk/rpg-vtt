import { useState, lazy, Suspense } from 'react';
import { GameProvider, useGame } from './contexts/GameContext';
import Lobby from './components/Lobby';

const GameBoard = lazy(() => import('./components/GameBoard'));

function AppInner() {
  const { state, actions } = useGame();
  const [error, setError] = useState(null);

  const inGame = state.room.code !== null;

  const handleCreateRoom = async (playerName) => {
    try {
      setError(null);
      await actions.createRoom(playerName);
    } catch (err) {
      setError(err.message || 'Erro ao criar a sala');
    }
  };

  const handleJoinRoom = async (roomCode, playerName) => {
    try {
      setError(null);
      await actions.joinRoom(roomCode, playerName);
    } catch (err) {
      setError(err.message || 'Sala não encontrada');
    }
  };

  const handleCreateCampaign = async (name, dmPassword, system, customRules) => {
    try {
      setError(null);
      await actions.createCampaign(name, dmPassword, system, customRules);
    } catch (err) {
      setError(err.message || 'Erro ao criar a campanha');
    }
  };

  const handleJoinCampaign = async (campaignId, playerName, dmPassword) => {
    try {
      setError(null);
      await actions.joinCampaign(campaignId, playerName, dmPassword);
    } catch (err) {
      setError(err.message || 'Campanha não encontrada ou senha incorreta');
    }
  };

  const handleLeaveRoom = () => {
    actions.leaveRoom();
    setError(null);
  };

  // Connection lost overlay
  const showReconnecting = !state.connected && inGame;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      color: 'var(--color-text)',
      fontFamily: 'var(--font-body)',
    }}>
      {!inGame ? (
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onCreateCampaign={handleCreateCampaign}
          onJoinCampaign={handleJoinCampaign}
          isLoading={state.loading}
          error={error || state.error}
        />
      ) : (
        <Suspense fallback={
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100vh' 
          }}>
            Carregando...
          </div>
        }>
          <GameBoard onLeaveRoom={handleLeaveRoom} />
        </Suspense>
      )}

      {/* Reconnecting overlay */}
      {showReconnecting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,15,26,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(8px)',
        }}>
          <div className="panel" style={{ textAlign: 'center', maxWidth: 400 }}>
            <h2 className="heading-lg text-accent">Conexão Perdida</h2>
            <p className="text-dim" style={{ margin: '1rem 0' }}>Tentando reconectar...</p>
            <button className="btn btn-ghost" onClick={handleLeaveRoom}>
              Voltar ao Lobby
            </button>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {(error || state.error) && inGame && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,15,26,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998,
        }}>
          <div className="panel" style={{ textAlign: 'center', maxWidth: 400 }}>
            <h3 className="heading-md text-accent">Erro</h3>
            <p className="text-dim" style={{ margin: '1rem 0' }}>{error || state.error}</p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }}
                onClick={() => { setError(null); actions.clearError(); }}>
                OK
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }}
                onClick={handleLeaveRoom}>
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
