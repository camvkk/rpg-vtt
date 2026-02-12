import { useState, useRef } from 'react';
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
  
  // Custom system importer state
  const [documents, setDocuments] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedSystem, setParsedSystem] = useState(null);
  const [parseError, setParseError] = useState(null);
  const fileInputRef = useRef(null);

  // Get server URL
  const getServerUrl = () => {
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
    return window.location.origin;
  };

  // Add document to the list
  const addDocument = (name, text) => {
    const doc = { id: Date.now(), name, text };
    setDocuments(prev => [...prev, doc]);
    setTextInput('');
  };

  // Remove document from list
  const removeDocument = (id) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file) return;
    
    setIsUploading(true);
    setParseError(null);
    
    try {
      const formData = new FormData();
      formData.append('document', file);
      
      const serverUrl = getServerUrl();
      const response = await fetch(`${serverUrl}/api/upload-system-doc`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        addDocument(result.filename, result.text);
      } else {
        setParseError(result.error || 'Erro ao fazer upload do arquivo');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setParseError('Erro ao fazer upload do arquivo');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle text paste
  const handleTextPaste = () => {
    if (!textInput.trim()) return;
    addDocument('Texto Colado.txt', textInput.trim());
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFileUpload);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Parse system with OpenAI
  const handleParseSystem = async () => {
    if (documents.length === 0) {
      setParseError('Adicione pelo menos um documento antes de processar');
      return;
    }
    
    setIsParsing(true);
    setParseError(null);
    setParsedSystem(null);
    
    try {
      const serverUrl = getServerUrl();
      const response = await fetch(`${serverUrl}/api/parse-system`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaignId: 'preview', // Use preview for lobby parsing
          documents: documents.map(doc => ({ name: doc.name, text: doc.text }))
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setParsedSystem(result.systemData);
      } else {
        setParseError(result.error || 'Erro ao processar sistema');
      }
    } catch (err) {
      console.error('Parse error:', err);
      setParseError('Erro ao processar sistema com IA');
    } finally {
      setIsParsing(false);
    }
  };

  // Reset custom system state
  const resetCustomSystem = () => {
    setDocuments([]);
    setTextInput('');
    setParsedSystem(null);
    setParseError(null);
  };

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
        // For custom system, pass the parsed system data or documents
        const systemData = system === 'custom' ? (parsedSystem || { documents }) : null;
        await onCreateCampaign(campaignName.trim(), dmPassword, system, systemData || customRules || null);
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
                {/* 📚 Regras do Sistema section */}
                <div className="form-group rules-system-section">
                  <label className="form-label">📚 Regras do Sistema</label>
                  <div className="system-selection">
                    <div className="radio-group">
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="system"
                          value="dnd5e"
                          checked={system === 'dnd5e'}
                          onChange={(e) => {
                            setSystem(e.target.value);
                            if (e.target.value !== 'custom') resetCustomSystem();
                          }}
                        />
                        <span>D&D 5e (Padrão)</span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="system"
                          value="custom"
                          checked={system === 'custom'}
                          onChange={(e) => setSystem(e.target.value)}
                        />
                        <span>Sistema Customizado</span>
                      </label>
                    </div>
                  </div>

                  {system === 'custom' && (
                    <div className="custom-system-importer">
                      {!parsedSystem ? (
                        <>
                          {/* File Upload Area */}
                          <div className="upload-section">
                            <h4>Upload de Documentos</h4>
                            <div 
                              className="upload-area"
                              onDrop={handleDrop}
                              onDragOver={handleDragOver}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <div className="upload-content">
                                <div className="upload-icon">📁</div>
                                <p>Arraste arquivos aqui ou clique para selecionar</p>
                                <p className="upload-formats">Suporte: .txt, .md, .pdf, .csv, .json</p>
                              </div>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt,.md,.pdf,.csv,.json"
                                multiple
                                onChange={(e) => Array.from(e.target.files).forEach(handleFileUpload)}
                                style={{ display: 'none' }}
                              />
                            </div>
                            {isUploading && <div className="upload-status">📤 Fazendo upload...</div>}
                          </div>

                          {/* Text Paste Area */}
                          <div className="paste-section">
                            <h4>Colar Texto Diretamente</h4>
                            <textarea
                              className="text-paste-area"
                              placeholder="Cole aqui o texto do seu sistema de RPG..."
                              value={textInput}
                              onChange={(e) => setTextInput(e.target.value)}
                              rows={4}
                            />
                            <button 
                              type="button"
                              className="btn btn-secondary"
                              onClick={handleTextPaste}
                              disabled={!textInput.trim()}
                            >
                              Adicionar Texto
                            </button>
                          </div>

                          {/* Document List */}
                          {documents.length > 0 && (
                            <div className="documents-section">
                              <h4>Documentos Adicionados ({documents.length})</h4>
                              <div className="documents-list">
                                {documents.map(doc => (
                                  <div key={doc.id} className="document-item">
                                    <span className="doc-name">📄 {doc.name}</span>
                                    <span className="doc-size">({doc.text.length} caracteres)</span>
                                    <button 
                                      type="button"
                                      className="btn-remove"
                                      onClick={() => removeDocument(doc.id)}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* Process Button */}
                              <button
                                type="button"
                                className="btn btn-primary process-btn"
                                onClick={handleParseSystem}
                                disabled={isParsing}
                              >
                                {isParsing ? '🤖 IA analisando sistema...' : '🚀 Processar com IA'}
                              </button>
                              
                              {isParsing && (
                                <div className="parsing-status">
                                  <div className="spinner"></div>
                                  <p>Isso pode levar alguns segundos...</p>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        /* Parsed System Preview */
                        <div className="parsed-system-preview">
                          <h4>✅ Sistema Processado</h4>
                          
                          <div className="system-preview-card">
                            <div className="system-header">
                              <h5>📖 {parsedSystem.systemName || 'Sistema Customizado'}</h5>
                              {parsedSystem.description && (
                                <p className="system-description">{parsedSystem.description}</p>
                              )}
                            </div>

                            <div className="system-sections">
                              {parsedSystem.stats && (
                                <div className="section">
                                  <span className="section-label">📊 Atributos ({parsedSystem.stats.length})</span>
                                </div>
                              )}
                              {parsedSystem.races && (
                                <div className="section">
                                  <span className="section-label">👥 Raças ({parsedSystem.races.length})</span>
                                </div>
                              )}
                              {parsedSystem.classes && (
                                <div className="section">
                                  <span className="section-label">⚔️ Classes ({parsedSystem.classes.length})</span>
                                </div>
                              )}
                              {parsedSystem.skills && (
                                <div className="section">
                                  <span className="section-label">🎯 Perícias ({parsedSystem.skills.length})</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <button 
                            type="button"
                            className="btn btn-ghost reprocess-btn" 
                            onClick={() => setParsedSystem(null)}
                          >
                            🔄 Editar/Reprocessar
                          </button>
                        </div>
                      )}

                      {parseError && (
                        <div className="error-message">
                          ⚠️ {parseError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
