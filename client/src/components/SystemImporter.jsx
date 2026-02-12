import React, { useState, useRef } from 'react';
import { useGame } from '../contexts/GameContext';

const SystemImporter = ({ isOpen, onClose, campaignId }) => {
  const { actions } = useGame();
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedSystem, setParsedSystem] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState(null);
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [isFetchingGdrive, setIsFetchingGdrive] = useState(false);
  const fileInputRef = useRef(null);

  // Auto-detect backend URL
  const getServerUrl = () => {
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
    return window.location.origin;
  };

  const addDocument = (name, text) => {
    const doc = { id: Date.now(), name, text };
    setDocuments(prev => [...prev, doc]);
    setTextInput('');
  };

  const removeDocument = (id) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    
    setIsUploading(true);
    setError(null);
    
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
        setError(result.error || 'Erro ao fazer upload do arquivo');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Erro ao fazer upload do arquivo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTextPaste = () => {
    if (!textInput.trim()) return;
    
    addDocument('Texto Colado.txt', textInput.trim());
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFileUpload);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleGdriveImport = async () => {
    if (!gdriveUrl.trim()) return;
    setIsFetchingGdrive(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const response = await fetch(`${serverUrl}/api/fetch-gdrive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gdriveUrl.trim() })
      });
      const result = await response.json();
      if (result.success) {
        addDocument(result.filename, result.text);
        setGdriveUrl('');
      } else {
        setError(result.error || 'Erro ao importar do Google Drive');
      }
    } catch (err) {
      console.error('Google Drive import error:', err);
      setError('Erro ao importar do Google Drive');
    } finally {
      setIsFetchingGdrive(false);
    }
  };

  const handleParseSystem = async () => {
    if (documents.length === 0) {
      setError('Adicione pelo menos um documento antes de processar');
      return;
    }
    
    setIsParsing(true);
    setError(null);
    setParsedSystem(null);
    
    try {
      const serverUrl = getServerUrl();
      const response = await fetch(`${serverUrl}/api/parse-system`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaignId,
          documents: documents.map(doc => ({ name: doc.name, text: doc.text }))
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setParsedSystem(result.systemData);
        
        // The system data is already saved in the database by the API
        // No need for additional socket broadcast since it's saved on parse
      } else {
        setError(result.error || 'Erro ao processar sistema');
      }
    } catch (err) {
      console.error('Parse error:', err);
      setError('Erro ao processar sistema com IA');
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = () => {
    // System is already saved in database, just close
    onClose();
    setParsedSystem(null);
  };

  const handleReprocess = () => {
    setParsedSystem(null);
    handleParseSystem();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content system-importer" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📖 Importar Sistema Customizado</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="system-importer-content">
          {!parsedSystem ? (
            <>
              {/* File Upload Area */}
              <div className="upload-section">
                <h3>1. Upload de Documentos</h3>
                <div 
                  className="upload-area"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-content">
                    <div className="upload-icon">📁</div>
                    <p>Arraste arquivos aqui ou clique para selecionar</p>
                    <p className="upload-formats">Suporte: .txt, .md, .pdf, .docx</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.pdf,.docx"
                    multiple
                    onChange={(e) => Array.from(e.target.files).forEach(handleFileUpload)}
                    style={{ display: 'none' }}
                  />
                </div>
                {isUploading && <div className="upload-status">📤 Fazendo upload...</div>}
              </div>

              {/* Google Drive Import */}
              <div className="gdrive-section" style={{ marginBottom: '1rem' }}>
                <h3>2. Importar do Google Drive</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="text-paste-area"
                    style={{ flex: 1, minHeight: 'auto', padding: '0.6rem 0.8rem', resize: 'none' }}
                    placeholder="Cole o link do Google Drive aqui..."
                    value={gdriveUrl}
                    onChange={(e) => setGdriveUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGdriveImport()}
                  />
                  <button
                    className="btn-primary"
                    onClick={handleGdriveImport}
                    disabled={!gdriveUrl.trim() || isFetchingGdrive}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isFetchingGdrive ? '⏳ Importando...' : '📥 Importar'}
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.3rem' }}>
                  O arquivo deve estar compartilhado publicamente.
                </p>
              </div>

              {/* Text Paste Area */}
              <div className="paste-section">
                <h3>3. Colar Texto</h3>
                <textarea
                  className="text-paste-area"
                  placeholder="Cole aqui o texto do seu sistema de RPG..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={6}
                />
                <button 
                  className="btn-primary"
                  onClick={handleTextPaste}
                  disabled={!textInput.trim()}
                >
                  Adicionar Texto
                </button>
              </div>

              {/* Document List */}
              {documents.length > 0 && (
                <div className="documents-section">
                  <h3>4. Documentos Adicionados ({documents.length})</h3>
                  <div className="documents-list">
                    {documents.map(doc => (
                      <div key={doc.id} className="document-item">
                        <span className="doc-name">📄 {doc.name}</span>
                        <span className="doc-size">({doc.text.length} caracteres)</span>
                        <button 
                          className="btn-remove"
                          onClick={() => removeDocument(doc.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Process Button */}
              <div className="process-section">
                <button
                  className="btn-process"
                  onClick={handleParseSystem}
                  disabled={documents.length === 0 || isParsing}
                >
                  {isParsing ? '🤖 A IA está analisando seu sistema...' : '🚀 Processar Sistema'}
                </button>
                
                {isParsing && (
                  <div className="parsing-status">
                    <div className="spinner"></div>
                    <p>Isso pode levar alguns segundos...</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Results Preview */
            <div className="results-section">
              <h3>✅ Sistema Processado com Sucesso!</h3>
              
              <div className="system-preview">
                <div className="system-header">
                  <h4>📖 {parsedSystem.systemName || 'Sistema Customizado'}</h4>
                  {parsedSystem.description && (
                    <p className="system-description">{parsedSystem.description}</p>
                  )}
                </div>

                <div className="system-sections">
                  {parsedSystem.stats && (
                    <div className="section">
                      <h5>📊 Atributos ({parsedSystem.stats.length})</h5>
                      <div className="section-preview">
                        {parsedSystem.stats.slice(0, 3).map(stat => stat.name || stat.key).join(', ')}
                        {parsedSystem.stats.length > 3 && '...'}
                      </div>
                    </div>
                  )}

                  {parsedSystem.races && (
                    <div className="section">
                      <h5>👥 Raças ({parsedSystem.races.length})</h5>
                      <div className="section-preview">
                        {parsedSystem.races.slice(0, 3).map(race => race.name).join(', ')}
                        {parsedSystem.races.length > 3 && '...'}
                      </div>
                    </div>
                  )}

                  {parsedSystem.classes && (
                    <div className="section">
                      <h5>⚔️ Classes ({parsedSystem.classes.length})</h5>
                      <div className="section-preview">
                        {parsedSystem.classes.slice(0, 3).map(cls => cls.name).join(', ')}
                        {parsedSystem.classes.length > 3 && '...'}
                      </div>
                    </div>
                  )}

                  {parsedSystem.skills && (
                    <div className="section">
                      <h5>🎯 Perícias ({parsedSystem.skills.length})</h5>
                      <div className="section-preview">
                        {parsedSystem.skills.slice(0, 3).map(skill => skill.name).join(', ')}
                        {parsedSystem.skills.length > 3 && '...'}
                      </div>
                    </div>
                  )}

                  {parsedSystem.equipment && (
                    <div className="section">
                      <h5>⚔️ Equipamentos ({parsedSystem.equipment.length})</h5>
                      <div className="section-preview">
                        {parsedSystem.equipment.slice(0, 3).map(eq => eq.name).join(', ')}
                        {parsedSystem.equipment.length > 3 && '...'}
                      </div>
                    </div>
                  )}

                  {parsedSystem.spells && (
                    <div className="section">
                      <h5>🔮 Magias ({parsedSystem.spells.length})</h5>
                      <div className="section-preview">
                        {parsedSystem.spells.slice(0, 3).map(spell => spell.name).join(', ')}
                        {parsedSystem.spells.length > 3 && '...'}
                      </div>
                    </div>
                  )}

                  {parsedSystem.rules && (
                    <div className="section">
                      <h5>📋 Regras ({parsedSystem.rules.length})</h5>
                    </div>
                  )}

                  {parsedSystem.customMechanics && (
                    <div className="section">
                      <h5>⚙️ Mecânicas Especiais ({parsedSystem.customMechanics.length})</h5>
                    </div>
                  )}
                </div>
              </div>

              <div className="results-actions">
                <button className="btn-confirm" onClick={handleConfirm}>
                  ✅ Confirmar
                </button>
                <button className="btn-secondary" onClick={handleReprocess}>
                  🔄 Reprocessar
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemImporter;