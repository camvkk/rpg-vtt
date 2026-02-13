import { useState } from 'react';
import '../styles/TokenContextMenu.css';

const SIZE_OPTIONS = [
  { key: 'tiny', label: 'Minúsculo', cells: 0.5, desc: '½ célula' },
  { key: 'small', label: 'Pequeno', cells: 0.5, desc: '½ célula' },
  { key: 'medium', label: 'Médio', cells: 1, desc: '1×1' },
  { key: 'large', label: 'Grande', cells: 2, desc: '2×2' },
  { key: 'huge', label: 'Enorme', cells: 3, desc: '3×3' },
  { key: 'gargantuan', label: 'Colossal', cells: 4, desc: '4×4' },
];

const CONDITION_PRESETS = [
  { name: 'Cego', icon: '🙈' },
  { name: 'Enfeitiçado', icon: '💫' },
  { name: 'Surdo', icon: '🔇' },
  { name: 'Amedrontado', icon: '😨' },
  { name: 'Agarrado', icon: '🤝' },
  { name: 'Incapacitado', icon: '💤' },
  { name: 'Invisível', icon: '👻' },
  { name: 'Paralisado', icon: '⚡' },
  { name: 'Petrificado', icon: '🗿' },
  { name: 'Envenenado', icon: '🤢' },
  { name: 'Prone', icon: '🔻' },
  { name: 'Contido', icon: '🔗' },
  { name: 'Atordoado', icon: '⭐' },
  { name: 'Inconsciente', icon: '💀' },
  { name: 'Concentrating', icon: '🧠' },
  { name: 'Em Chamas', icon: '🔥' },
];

export default function TokenContextMenu({ token, position, onClose, onUpdate, onDelete, onOpenSheet }) {
  const [view, setView] = useState('main'); // main | hp | conditions | size | vision
  const [hpCurrent, setHpCurrent] = useState(token.hp?.current ?? 0);
  const [hpMax, setHpMax] = useState(token.hp?.max ?? 0);
  const [hpTemp, setHpTemp] = useState(token.hp?.temp ?? 0);
  const [visionRadius, setVisionRadius] = useState(token.visionRadius ?? 0);

  const handleHpSave = () => {
    onUpdate(token.id, { 
      hp: { current: parseInt(hpCurrent) || 0, max: parseInt(hpMax) || 0, temp: parseInt(hpTemp) || 0 } 
    });
    setView('main');
  };

  const handleSizeChange = (sizeKey) => {
    onUpdate(token.id, { size: sizeKey });
    onClose();
  };

  const toggleCondition = (condition) => {
    const current = token.conditions || [];
    const exists = current.find(c => c.name === condition.name);
    const newConditions = exists
      ? current.filter(c => c.name !== condition.name)
      : [...current, condition];
    onUpdate(token.id, { conditions: newConditions });
  };

  const handleVisionSave = () => {
    onUpdate(token.id, { visionRadius: parseInt(visionRadius) || 0 });
    setView('main');
  };

  const handleDelete = () => {
    onDelete(token.id);
    onClose();
  };

  // Position the menu within viewport
  const style = {
    left: Math.min(position.x, window.innerWidth - 260),
    top: Math.min(position.y, window.innerHeight - 350),
  };

  return (
    <div className="tcm-overlay" onClick={onClose}>
      <div className="tcm-menu" style={style} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tcm-header">
          {view !== 'main' && (
            <button className="tcm-back" onClick={() => setView('main')}>←</button>
          )}
          <span className="tcm-title">{token.name || 'Token'}</span>
          <button className="tcm-close" onClick={onClose}>✕</button>
        </div>

        {/* Main Menu */}
        {view === 'main' && (
          <div className="tcm-body">
            {onOpenSheet && (
              <button className="tcm-item tcm-item-primary" onClick={() => { onOpenSheet(token); onClose(); }}>
                <span>📋</span> <span>Abrir Ficha</span>
              </button>
            )}
            <button className="tcm-item" onClick={() => setView('hp')}>
              <span>❤️</span> <span>Editar HP</span>
              <span className="tcm-value">
                {token.hp ? `${token.hp.current}/${token.hp.max}` : '—'}
              </span>
            </button>
            <button className="tcm-item" onClick={() => setView('conditions')}>
              <span>⚡</span> <span>Condições</span>
              <span className="tcm-value">{(token.conditions || []).length || '—'}</span>
            </button>
            <button className="tcm-item" onClick={() => setView('size')}>
              <span>📐</span> <span>Tamanho</span>
              <span className="tcm-value">
                {SIZE_OPTIONS.find(s => s.key === (token.size || 'medium'))?.label || 'Médio'}
              </span>
            </button>
            <button className="tcm-item" onClick={() => setView('vision')}>
              <span>👁️</span> <span>Visão</span>
              <span className="tcm-value">
                {token.visionRadius ? `${token.visionRadius * 5}ft` : '—'}
              </span>
            </button>
            <div className="tcm-divider" />
            <button className="tcm-item tcm-danger" onClick={handleDelete}>
              <span>🗑️</span> <span>Excluir Token</span>
            </button>
          </div>
        )}

        {/* HP Editor */}
        {view === 'hp' && (
          <div className="tcm-body">
            <div className="tcm-field">
              <label>HP Atual</label>
              <input type="number" value={hpCurrent} onChange={e => setHpCurrent(e.target.value)} autoFocus />
            </div>
            <div className="tcm-field">
              <label>HP Máximo</label>
              <input type="number" value={hpMax} onChange={e => setHpMax(e.target.value)} />
            </div>
            <div className="tcm-field">
              <label>HP Temporário</label>
              <input type="number" value={hpTemp} onChange={e => setHpTemp(e.target.value)} />
            </div>
            <button className="tcm-btn-save" onClick={handleHpSave}>Salvar HP</button>
          </div>
        )}

        {/* Conditions */}
        {view === 'conditions' && (
          <div className="tcm-body tcm-conditions-grid">
            {CONDITION_PRESETS.map(cond => {
              const active = (token.conditions || []).some(c => c.name === cond.name);
              return (
                <button
                  key={cond.name}
                  className={`tcm-condition ${active ? 'tcm-condition-active' : ''}`}
                  onClick={() => toggleCondition(cond)}
                  title={cond.name}
                >
                  <span>{cond.icon}</span>
                  <span className="tcm-cond-label">{cond.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Size */}
        {view === 'size' && (
          <div className="tcm-body">
            {SIZE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={`tcm-item ${(token.size || 'medium') === opt.key ? 'tcm-item-active' : ''}`}
                onClick={() => handleSizeChange(opt.key)}
              >
                <span>{opt.label}</span>
                <span className="tcm-value">{opt.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Vision */}
        {view === 'vision' && (
          <div className="tcm-body">
            <div className="tcm-field">
              <label>Raio de Visão (células)</label>
              <input type="number" min="0" max="24" value={visionRadius} onChange={e => setVisionRadius(e.target.value)} autoFocus />
            </div>
            <p className="tcm-hint">
              {visionRadius > 0 ? `${visionRadius * 5} pés de visão` : 'Sem visão especial'}
            </p>
            <button className="tcm-btn-save" onClick={handleVisionSave}>Salvar Visão</button>
          </div>
        )}
      </div>
    </div>
  );
}
