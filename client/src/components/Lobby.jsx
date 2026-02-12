import { useState } from 'react';
import '../styles/Lobby.css';

export default function Lobby({ onCreateRoom, onJoinRoom, onCreateCampaign, onJoinCampaign, isLoading, error }) {
  const [mode, setMode] = useState('join-campaign');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [dmPassword, setDmPassword] = useState('');
  const [system, setSystem] = useState('dnd5e');
  const [customRules, setCustomRules] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    switch (mode) {
      case 'create-room':
        await onCreateRoom(playerName.trim(), system);
        break;
      case 'join-room':
        if (!roomCode.trim()) return;
        await onJoinRoom(roomCode.trim().toUpperCase(), playerName.trim());
        break;
      case 'create-campaign':
        if (!campaignName.trim() || !dmPassword.trim()) return;
        await onCreateCampaign(campaignName.trim(), dmPassword, system, customRules || null);
        break;
      case 'join-campaign':
        if (!campaignId.trim()) return;
        await onJoinCampaign(campaignId.trim().toUpperCase(), playerName.trim(), dmPassword || null);
        break;
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
              className={`lobby-tab ${mode === 'join-campaign' ? 'active' : ''}`}
              onClick={() => setMode('join-campaign')}
            >
              📚 Entrar em Campanha
            </button>
            <button
              className={`lobby-tab ${mode === 'create-campaign' ? 'active' : ''}`}
              onClick={() => setMode('create-campaign')}
            >
              ⚔️ Nova Campanha
            </button>
            <button
              className={`lobby-tab ${mode === 'join-room' ? 'active' : ''}`}
              onClick={() => setMode('join-room')}
            >
              🎲 Sala Rápida
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

            {mode === 'create-campaign' && (
              <>
                <div className="form-group">
                  <label className="form-label">Nome da Campanha</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="A Maldição de Strahd"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Senha do Mestre</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Senha para acessar como DM"
                    value={dmPassword}
                    onChange={(e) => setDmPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sistema de RPG</label>
                  <select
                    className="input"
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                  >
                    <option value="dnd5e">D&D 5e</option>
                    <option value="generic">Genérico</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                {system === 'custom' && (
                  <div className="form-group">
                    <label className="form-label">Regras Customizadas</label>
                    <textarea
                      className="input"
                      placeholder="Descreva as regras especiais desta campanha..."
                      value={customRules}
                      onChange={(e) => setCustomRules(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </>
            )}

            {mode === 'join-campaign' && (
              <>
                <div className="form-group">
                  <label className="form-label">Código da Campanha</label>
                  <input
                    type="text"
                    className="input lobby-code-input"
                    placeholder="ABCD1234"
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value.toUpperCase())}
                    maxLength={8}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Senha do Mestre (opcional)</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Deixe vazio para entrar como jogador"
                    value={dmPassword}
                    onChange={(e) => setDmPassword(e.target.value)}
                  />
                  <small className="text-dim">Preencha apenas se for o Mestre da campanha</small>
                </div>
              </>
            )}

            {mode === 'join-room' && (
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
              className={`btn ${mode.includes('create') ? 'btn-primary' : 'btn-secondary'} lobby-submit`}
              disabled={isLoading}
            >
              {isLoading ? (
                mode === 'create-campaign' ? '⏳ Criando Campanha...' :
                mode === 'join-campaign' ? '⏳ Entrando na Campanha...' :
                '⏳ Entrando...'
              ) : (
                mode === 'create-campaign' ? '📚 Criar Nova Campanha' :
                mode === 'join-campaign' ? '⚡ Entrar na Campanha' :
                '🎲 Entrar na Sala Rápida'
              )}
            </button>
          </form>

          {/* Description */}
          <div className="lobby-desc">
            {mode === 'create-campaign' ? (
              <>
                <h3 className="heading-sm text-primary">Nova Campanha</h3>
                <p className="text-dim">Crie uma campanha persistente para múltiplas sessões.</p>
                <ul className="lobby-features">
                  <li>💾 Fichas de personagens salvas automaticamente</li>
                  <li>📚 Histórico de chat persistente</li>
                  <li>📄 Integração com Google Docs</li>
                  <li>🎯 Link permanente para a campanha</li>
                  <li>⚔️ Todas as funcionalidades de DM</li>
                </ul>
              </>
            ) : mode === 'join-campaign' ? (
              <>
                <h3 className="heading-sm text-secondary">Entrar em Campanha</h3>
                <p className="text-dim">Continue sua aventura em uma campanha existente.</p>
                <ul className="lobby-features">
                  <li>📋 Sua ficha será carregada automaticamente</li>
                  <li>💬 Acesso ao histórico de conversa</li>
                  <li>📄 Documentos compartilhados da campanha</li>
                  <li>🏛️ Continuidade entre sessões</li>
                </ul>
              </>
            ) : (
              <>
                <h3 className="heading-sm text-accent">Sala Rápida</h3>
                <p className="text-dim">Mesa rápida para one-shots e testes.</p>
                <ul className="lobby-features">
                  <li>🚀 Sem cadastro, entre direto</li>
                  <li>🎲 Perfeito para sessões únicas</li>
                  <li>⚡ Criação instantânea</li>
                  <li>💬 Chat e dados em tempo real</li>
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
