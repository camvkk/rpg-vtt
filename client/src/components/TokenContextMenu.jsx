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

export default function TokenContextMenu({ token, position, onClose, onUpdate, onDelete, onOpenSheet, tokens = [], onAttack }) {
  const [view, setView] = useState('main'); // main | hp | damage | attack | conditions | size | vision
  // hp pode ser objeto {current,max,temp} ou vir do banco como hp_current/hp_max
  const hpObj = token.hp ?? { current: token.hp_current ?? 100, max: token.hp_max ?? 100, temp: 0 };
  const [hpCurrent, setHpCurrent] = useState(hpObj.current);
  const [hpMax, setHpMax] = useState(hpObj.max);
  const [hpTemp, setHpTemp] = useState(hpObj.temp ?? 0);
  const [visionRadius, setVisionRadius] = useState(token.visionRadius ?? 0);
  const [damageAmount, setDamageAmount] = useState('');
  const [damageFlash, setDamageFlash] = useState(null); // 'hit' | 'heal'
  const [atkBonus, setAtkBonus] = useState('0');
  const [dmgFormula, setDmgFormula] = useState('1d6');
  const [atkTargetId, setAtkTargetId] = useState('');

  const applyDamage = (amount) => {
    const cur = token.hp?.current ?? token.hp_current ?? 100;
    const max = token.hp?.max ?? token.hp_max ?? 100;
    const temp = token.hp?.temp ?? 0;
    let newCur, newTemp;
    // Damage absorbs temp HP first
    if (amount > 0 && temp > 0) {
      const absorbed = Math.min(temp, amount);
      newTemp = temp - absorbed;
      newCur = Math.max(0, cur - (amount - absorbed));
    } else if (amount > 0) {
      newTemp = temp;
      newCur = Math.max(0, cur - amount);
    } else {
      // Heal
      newTemp = temp;
      newCur = Math.min(max, cur + Math.abs(amount));
    }
    onUpdate(token.id, { hp: { current: newCur, max, temp: newTemp } });
    setDamageFlash(amount > 0 ? 'hit' : 'heal');
    setTimeout(() => setDamageFlash(null), 600);
    setDamageAmount('');
  };

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
            {onAttack && tokens.filter(t => t.id !== token.id).length > 0 && (
              <button className="tcm-item tcm-item-attack" onClick={() => setView('attack')}>
                <span>🎯</span> <span>Atacar</span>
                <span className="tcm-value">1d20 + bônus</span>
              </button>
            )}
            <button className="tcm-item tcm-item-damage" onClick={() => setView('damage')}>
              <span>⚔️</span> <span>Dano / Cura</span>
              <span className={`tcm-hp-badge ${damageFlash === 'hit' ? 'tcm-hp-hit' : damageFlash === 'heal' ? 'tcm-hp-heal' : ''}`}>
                {`${hpObj.current}/${hpObj.max}`}
              </span>
            </button>
            <button className="tcm-item" onClick={() => setView('hp')}>
              <span>❤️</span> <span>Editar HP</span>
              <span className="tcm-value">{`${hpObj.current}/${hpObj.max}`}</span>
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

        {/* Attack Roll */}
        {view === 'attack' && (() => {
          const targets = tokens.filter(t => t.id !== token.id);
          const target = targets.find(t => t.id === atkTargetId) || targets[0];
          return (
            <div className="tcm-body">
              <div className="tcm-field">
                <label>Alvo</label>
                <select
                  className="tcm-select"
                  value={atkTargetId || (targets[0]?.id ?? '')}
                  onChange={e => setAtkTargetId(e.target.value)}
                >
                  {targets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.ac != null ? `(CA ${t.ac})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="tcm-row">
                <div className="tcm-field">
                  <label>Bônus de ataque</label>
                  <input
                    type="number"
                    value={atkBonus}
                    onChange={e => setAtkBonus(e.target.value)}
                    placeholder="+5"
                  />
                </div>
                <div className="tcm-field">
                  <label>Dado de dano</label>
                  <input
                    type="text"
                    value={dmgFormula}
                    onChange={e => setDmgFormula(e.target.value)}
                    placeholder="1d8+3"
                  />
                </div>
              </div>
              {target && (
                <div className="tcm-atk-preview">
                  🎲 1d20 + {atkBonus} vs CA {target.ac ?? 10}
                </div>
              )}
              <div className="tcm-quick-dmg" style={{marginBottom: 8}}>
                {['1d4', '1d6', '1d8', '1d10', '2d6', '1d12'].map(f => (
                  <button key={f} className={`tcm-quick-btn ${dmgFormula === f ? 'tcm-quick-btn-active' : ''}`}
                    onClick={() => setDmgFormula(f)}>{f}</button>
                ))}
              </div>
              <button
                className="tcm-btn-atk"
                onClick={() => {
                  const tgt = targets.find(t => t.id === (atkTargetId || targets[0]?.id));
                  if (tgt && onAttack) onAttack(token.name, tgt, parseInt(atkBonus) || 0, dmgFormula || '1d6');
                }}
                disabled={targets.length === 0}
              >
                ⚔️ Rolar Ataque
              </button>
            </div>
          );
        })()}

        {/* Damage / Heal */}
        {view === 'damage' && (
          <div className="tcm-body">
            <div className="tcm-hp-display">
              <span className="tcm-hp-cur">{hpObj.current}</span>
              <span className="tcm-hp-sep">/</span>
              <span className="tcm-hp-max">{hpObj.max}</span>
              {(hpObj.temp ?? 0) > 0 && (
                <span className="tcm-hp-temp">+{hpObj.temp} tmp</span>
              )}
            </div>
            <div className="tcm-field">
              <label>Quantidade</label>
              <input
                type="number"
                min="0"
                value={damageAmount}
                onChange={e => setDamageAmount(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') applyDamage(parseInt(damageAmount) || 0);
                }}
                placeholder="Ex: 12"
                autoFocus
              />
            </div>
            <div className="tcm-dmg-buttons">
              <button
                className="tcm-btn-damage"
                onClick={() => applyDamage(parseInt(damageAmount) || 0)}
                disabled={!damageAmount}
              >
                ⚔️ Dano
              </button>
              <button
                className="tcm-btn-heal"
                onClick={() => applyDamage(-(parseInt(damageAmount) || 0))}
                disabled={!damageAmount}
              >
                💚 Cura
              </button>
            </div>
            <div className="tcm-quick-dmg">
              {[1, 5, 10, 15, 20].map(n => (
                <button key={n} className="tcm-quick-btn" onClick={() => {
                  setDamageAmount(String(n));
                }}>
                  {n}
                </button>
              ))}
            </div>
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
