import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SKILLS, ABILITIES, getProficiencyBonus } from '../data/dnd5e';
import '../styles/CharacterSheet.css';

// ── Default character factory ──
const makeDefaultCharacter = () => ({
  name: '',
  race: '',
  class: '',
  level: 1,
  alignment: '',
  avatarEmoji: '⚔️',
  inspiration: false,
  attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  hp: { current: 10, max: 10, temp: 0 },
  ac: 10,
  speed: 30,
  hitDice: { total: 1, used: 0 },
  skills: {},
  savingThrows: {},
  attacks: [],
  features: [],
  spellSlots: {},      // { 1: { total: 2, used: 0 }, 2: { total: 1, used: 0 }, ... }
  spells: {},          // { 0: [{name,prepared}], 1: [{name,prepared}], ... }
  inventory: [],       // [{ name, qty, weight }]
  currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  personality: '',
  ideals: '',
  bonds: '',
  flaws: '',
  backstory: '',
  notes: '',
});

const TABS = [
  { id: 'overview',   icon: '📋', label: 'Visão Geral' },
  { id: 'attributes', icon: '⚡', label: 'Atributos & Perícias' },
  { id: 'combat',     icon: '⚔️', label: 'Combate' },
  { id: 'inventory',  icon: '🎒', label: 'Inventário' },
  { id: 'spells',     icon: '✨', label: 'Magias' },
  { id: 'notes',      icon: '📝', label: 'Notas' },
];

const SPELL_LEVEL_NAMES = {
  0: 'Truques',
  1: '1º Nível', 2: '2º Nível', 3: '3º Nível', 4: '4º Nível',
  5: '5º Nível', 6: '6º Nível', 7: '7º Nível', 8: '8º Nível', 9: '9º Nível',
};

export default function CharacterSheet({
  character,
  isEditable = true,
  onUpdateCharacter,
  onRollDice,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const char = character || makeDefaultCharacter();
  const saveTimer = useRef(null);

  // ── Derived values ──
  const profBonus = useMemo(() => getProficiencyBonus(char.level || 1), [char.level]);

  const getMod = (score) => Math.floor(((score || 10) - 10) / 2);

  const mods = useMemo(() => {
    const m = {};
    Object.keys(ABILITIES).forEach(k => { m[k] = getMod(char.attributes?.[k]); });
    return m;
  }, [char.attributes]);

  const passivePerception = useMemo(() => {
    const perceptionMod = mods.wis + (char.skills?.perception?.proficient ? profBonus : 0);
    return 10 + perceptionMod;
  }, [mods.wis, char.skills?.perception?.proficient, profBonus]);

  const hpPct = useMemo(() => {
    const total = (char.hp?.max || 1) + (char.hp?.temp || 0);
    return Math.max(0, Math.min(100, ((char.hp?.current || 0) / total) * 100));
  }, [char.hp]);

  const hpColor = hpPct > 75 ? '#51cf66' : hpPct > 50 ? '#ffd43b' : hpPct > 25 ? '#ff922b' : '#ff6b6b';

  // ── Update helper with debounced auto-save ──
  const update = useCallback((patch) => {
    if (!isEditable) return;
    const updated = { ...char, ...patch };
    onUpdateCharacter(updated);
  }, [char, isEditable, onUpdateCharacter]);

  const updateAttr = useCallback((attr, val) => {
    const v = Math.max(1, Math.min(30, parseInt(val) || 1));
    update({ attributes: { ...char.attributes, [attr]: v } });
  }, [char.attributes, update]);

  // ── Dice helpers ──
  const rollAbilityCheck = (ability) => {
    const bonus = mods[ability];
    onRollDice?.({
      type: 'ability_check',
      notation: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
      skill: ABILITIES[ability]?.name,
      character: char.name,
    });
  };

  const rollSkill = (skillKey) => {
    const skill = SKILLS[skillKey];
    const abilityMod = mods[skill.ability];
    const prof = char.skills?.[skillKey]?.proficient ? profBonus : 0;
    const total = abilityMod + prof;
    onRollDice?.({
      type: 'skill_check',
      notation: `1d20${total >= 0 ? '+' : ''}${total}`,
      skill: skill.name,
      character: char.name,
    });
  };

  const rollSave = (ability) => {
    const mod = mods[ability] + (char.savingThrows?.[ability]?.proficient ? profBonus : 0);
    onRollDice?.({
      type: 'saving_throw',
      notation: `1d20${mod >= 0 ? '+' : ''}${mod}`,
      save: ABILITIES[ability]?.short,
      character: char.name,
    });
  };

  const rollAttack = (atk) => {
    onRollDice?.({ type: 'attack', notation: `1d20${atk.bonus}`, attack: atk.name, character: char.name });
  };

  const rollDamage = (atk) => {
    onRollDice?.({ type: 'damage', notation: atk.damage, attack: atk.name, character: char.name });
  };

  // ── Rest handlers ──
  const shortRest = () => {
    if (!isEditable) return;
    // Restore hit dice (half level, min 1)
    const restored = Math.max(1, Math.floor((char.level || 1) / 2));
    const newUsed = Math.max(0, (char.hitDice?.used || 0) - restored);
    update({ hitDice: { ...char.hitDice, used: newUsed } });
  };

  const longRest = () => {
    if (!isEditable) return;
    const maxHp = char.hp?.max || 10;
    const totalHitDice = char.level || 1;
    const halfBack = Math.max(1, Math.floor(totalHitDice / 2));
    const newUsed = Math.max(0, (char.hitDice?.used || 0) - halfBack);
    // Restore HP, half hit dice, all spell slots
    const restoredSlots = {};
    Object.entries(char.spellSlots || {}).forEach(([lvl, slot]) => {
      restoredSlots[lvl] = { ...slot, used: 0 };
    });
    update({
      hp: { ...char.hp, current: maxHp, temp: 0 },
      hitDice: { total: totalHitDice, used: newUsed },
      spellSlots: restoredSlots,
    });
  };

  // ── Keyboard: Escape to close ──
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Render helpers ──
  const fmtMod = (v) => (v >= 0 ? `+${v}` : `${v}`);

  // ════════════════════════════════════════════
  //  TAB: Visão Geral
  // ════════════════════════════════════════════
  const renderOverview = () => (
    <>
      {/* HP */}
      <div className="cs-hp-section">
        <div className="cs-hp-header">
          <div>
            <span style={{ fontSize: '0.75rem', color: '#8888aa', fontFamily: "'Cinzel', serif" }}>PONTOS DE VIDA</span>
            <div className="cs-hp-values">
              {isEditable ? (
                <>
                  <input
                    type="number"
                    value={char.hp?.current ?? 0}
                    onChange={e => update({ hp: { ...char.hp, current: Math.max(0, parseInt(e.target.value) || 0) } })}
                  />
                  <span>/</span>
                  <input
                    type="number"
                    value={char.hp?.max ?? 10}
                    onChange={e => update({ hp: { ...char.hp, max: Math.max(1, parseInt(e.target.value) || 1) } })}
                  />
                </>
              ) : (
                <span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#e8e8e8' }}>
                  {char.hp?.current}/{char.hp?.max}
                </span>
              )}
              {(char.hp?.temp || 0) > 0 && (
                <span className="cs-hp-temp">+{char.hp.temp} temp</span>
              )}
            </div>
          </div>
          {isEditable && (
            <div className="cs-hp-btns">
              <button className="cs-hp-btn minus" onClick={() => update({ hp: { ...char.hp, current: Math.max(0, (char.hp?.current || 0) - 1) } })}>−</button>
              <button className="cs-hp-btn plus" onClick={() => update({ hp: { ...char.hp, current: Math.min((char.hp?.max || 10) + (char.hp?.temp || 0), (char.hp?.current || 0) + 1) } })}>+</button>
              {isEditable && (
                <input
                  type="number"
                  placeholder="Temp"
                  value={char.hp?.temp || ''}
                  onChange={e => update({ hp: { ...char.hp, temp: Math.max(0, parseInt(e.target.value) || 0) } })}
                  style={{ width: 44, textAlign: 'center', background: 'transparent', border: '1px solid rgba(81,207,102,0.3)', borderRadius: 4, color: '#51cf66', fontSize: '0.75rem', outline: 'none', marginLeft: 4 }}
                  title="HP Temporário"
                />
              )}
            </div>
          )}
        </div>
        <div className="cs-hp-bar">
          <div className="cs-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="cs-quick-stats">
        <div className="cs-quick-stat">
          <div className="cs-quick-stat-label">CA</div>
          <div className="cs-quick-stat-value">
            {isEditable ? (
              <input type="number" value={char.ac ?? 10} onChange={e => update({ ac: parseInt(e.target.value) || 10 })} />
            ) : char.ac}
          </div>
        </div>
        <div className="cs-quick-stat">
          <div className="cs-quick-stat-label">Velocidade</div>
          <div className="cs-quick-stat-value">
            {isEditable ? (
              <input type="number" value={char.speed ?? 30} onChange={e => update({ speed: parseInt(e.target.value) || 30 })} />
            ) : char.speed}
            <span style={{ fontSize: '0.7rem', color: '#666' }}> pés</span>
          </div>
        </div>
        <div className="cs-quick-stat">
          <div className="cs-quick-stat-label">Proficiência</div>
          <div className="cs-quick-stat-value" style={{ color: '#e2b714' }}>+{profBonus}</div>
        </div>
        <div className="cs-quick-stat">
          <div className="cs-quick-stat-label">Iniciativa</div>
          <div className="cs-quick-stat-value">{fmtMod(mods.dex)}</div>
        </div>
        <div className="cs-quick-stat">
          <div className="cs-quick-stat-label">Percepção Passiva</div>
          <div className="cs-quick-stat-value">{passivePerception}</div>
        </div>
      </div>

      {/* Inspiration */}
      <div className="cs-section">
        <div className="cs-inspiration">
          <button
            className={`cs-inspiration-star ${char.inspiration ? 'active' : ''}`}
            onClick={() => isEditable && update({ inspiration: !char.inspiration })}
            title="Inspiração"
          >
            {char.inspiration ? '⭐' : '☆'}
          </button>
          <span style={{ fontSize: '0.85rem', color: '#ccc' }}>Inspiração</span>
        </div>
      </div>

      {/* Ability Scores Preview */}
      <div className="cs-section">
        <div className="cs-section-title">⚡ Atributos</div>
        <div className="cs-stats-row">
          {Object.entries(ABILITIES).map(([key, info]) => (
            <div key={key} className="cs-stat-box" onClick={() => rollAbilityCheck(key)} title={`Rolar ${info.name}`}>
              <div className="cs-stat-label">{info.short}</div>
              <div className="cs-stat-score">{char.attributes?.[key] || 10}</div>
              <div className="cs-stat-mod">{fmtMod(mods[key])}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hit Dice */}
      <div className="cs-section">
        <div className="cs-section-title">🎲 Dados de Vida</div>
        <div style={{ fontSize: '0.85rem', color: '#ccc' }}>
          Restantes: <strong style={{ color: '#e2b714' }}>{(char.hitDice?.total || char.level || 1) - (char.hitDice?.used || 0)}</strong> / {char.hitDice?.total || char.level || 1}
        </div>
      </div>
    </>
  );

  // ════════════════════════════════════════════
  //  TAB: Atributos & Perícias
  // ════════════════════════════════════════════
  const renderAttributes = () => (
    <>
      {/* Attributes with editable scores */}
      <div className="cs-section">
        <div className="cs-section-title">⚡ Atributos</div>
        <div className="cs-stats-row">
          {Object.entries(ABILITIES).map(([key, info]) => (
            <div key={key} className="cs-stat-box" title={info.name}>
              <div className="cs-stat-label">{info.short}</div>
              <div className="cs-stat-score">
                {isEditable ? (
                  <input type="number" value={char.attributes?.[key] || 10} onChange={e => updateAttr(key, e.target.value)} />
                ) : (char.attributes?.[key] || 10)}
              </div>
              <div className="cs-stat-mod">{fmtMod(mods[key])}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Saving Throws */}
      <div className="cs-section">
        <div className="cs-section-title">🛡️ Salvaguardas</div>
        {Object.entries(ABILITIES).map(([key, info]) => {
          const prof = char.savingThrows?.[key]?.proficient;
          const total = mods[key] + (prof ? profBonus : 0);
          return (
            <div key={key} className="cs-skill-row">
              {isEditable && (
                <input
                  type="checkbox"
                  className="cs-skill-prof"
                  checked={!!prof}
                  onChange={() => update({ savingThrows: { ...char.savingThrows, [key]: { proficient: !prof } } })}
                />
              )}
              <span className="cs-skill-name">{info.name}</span>
              <span className={`cs-skill-bonus ${prof ? 'proficient' : ''}`}>{fmtMod(total)}</span>
              <button className="cs-skill-roll" onClick={() => rollSave(key)} title="Rolar">🎲</button>
            </div>
          );
        })}
      </div>

      {/* Skills */}
      <div className="cs-section">
        <div className="cs-section-title">🎯 Perícias</div>
        {Object.entries(SKILLS).map(([key, skill]) => {
          const prof = char.skills?.[key]?.proficient;
          const total = mods[skill.ability] + (prof ? profBonus : 0);
          return (
            <div key={key} className="cs-skill-row">
              {isEditable && (
                <input
                  type="checkbox"
                  className="cs-skill-prof"
                  checked={!!prof}
                  onChange={() => update({ skills: { ...char.skills, [key]: { proficient: !prof } } })}
                />
              )}
              <span className="cs-skill-name">{skill.name}</span>
              <span className="cs-skill-ability">{ABILITIES[skill.ability]?.short}</span>
              <span className={`cs-skill-bonus ${prof ? 'proficient' : ''}`}>{fmtMod(total)}</span>
              <button className="cs-skill-roll" onClick={() => rollSkill(key)} title="Rolar">🎲</button>
            </div>
          );
        })}
        <div className="cs-passive">
          👁️ Percepção Passiva: <strong>{passivePerception}</strong>
        </div>
      </div>
    </>
  );

  // ════════════════════════════════════════════
  //  TAB: Combate
  // ════════════════════════════════════════════
  const renderCombat = () => {
    const attacks = char.attacks || [];

    const updateAttack = (idx, field, value) => {
      const newAttacks = [...attacks];
      newAttacks[idx] = { ...newAttacks[idx], [field]: value };
      update({ attacks: newAttacks });
    };

    const addAttack = () => {
      update({ attacks: [...attacks, { name: '', bonus: '+0', damage: '', type: '' }] });
    };

    const removeAttack = (idx) => {
      update({ attacks: attacks.filter((_, i) => i !== idx) });
    };

    return (
      <>
        {/* Attacks */}
        <div className="cs-section">
          <div className="cs-section-title">⚔️ Ataques</div>
          <div className="cs-attack-row cs-attack-header">
            <span>Nome</span><span>Bônus</span><span>Dano</span><span>Tipo</span><span></span>
          </div>
          {attacks.map((atk, i) => (
            <div key={i} className="cs-attack-row">
              {isEditable ? (
                <>
                  <input value={atk.name} onChange={e => updateAttack(i, 'name', e.target.value)} placeholder="Arma" />
                  <input value={atk.bonus} onChange={e => updateAttack(i, 'bonus', e.target.value)} placeholder="+5" />
                  <input value={atk.damage} onChange={e => updateAttack(i, 'damage', e.target.value)} placeholder="1d8+3" />
                  <input value={atk.type || ''} onChange={e => updateAttack(i, 'type', e.target.value)} placeholder="Cortante" />
                  <button className="cs-btn-small danger" onClick={() => removeAttack(i)}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ color: '#ccc' }}>{atk.name}</span>
                  <span style={{ color: '#e2b714', fontWeight: 600 }}>{atk.bonus}</span>
                  <span style={{ color: '#ccc' }}>{atk.damage}</span>
                  <span style={{ color: '#666', fontSize: '0.75rem' }}>{atk.type}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="cs-skill-roll" onClick={() => rollAttack(atk)} title="Ataque">🎯</button>
                    <button className="cs-skill-roll" onClick={() => rollDamage(atk)} title="Dano">💥</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {isEditable && (
            <button className="cs-btn-small" onClick={addAttack} style={{ marginTop: 8 }}>+ Adicionar Ataque</button>
          )}
          {!isEditable && attacks.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {attacks.map((atk, i) => (
                <div key={i} style={{ display: 'flex', gap: 4 }}>
                  <button className="cs-btn-small" onClick={() => rollAttack(atk)}>🎯 {atk.name}</button>
                  <button className="cs-btn-small" onClick={() => rollDamage(atk)}>💥</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spell Slots Tracker */}
        <div className="cs-section">
          <div className="cs-section-title">🔮 Espaços de Magia</div>
          <div className="cs-spell-slots">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => {
              const slot = char.spellSlots?.[lvl];
              if (!slot || !slot.total) return null;
              return (
                <div key={lvl} className="cs-spell-level-group">
                  <div className="cs-spell-level-label">{lvl}º Nível</div>
                  <div className="cs-slot-checks">
                    {Array.from({ length: slot.total }).map((_, i) => (
                      <button
                        key={i}
                        className={`cs-slot-check ${i < (slot.used || 0) ? 'used' : ''}`}
                        onClick={() => {
                          if (!isEditable) return;
                          const newUsed = i < (slot.used || 0) ? i : i + 1;
                          update({
                            spellSlots: {
                              ...char.spellSlots,
                              [lvl]: { ...slot, used: newUsed },
                            },
                          });
                        }}
                        title={i < (slot.used || 0) ? 'Restaurar' : 'Usar'}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {isEditable && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => {
                const slot = char.spellSlots?.[lvl] || { total: 0, used: 0 };
                return (
                  <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#8888aa' }}>
                    <span>{lvl}º:</span>
                    <input
                      type="number"
                      min="0"
                      max="9"
                      value={slot.total}
                      onChange={e => {
                        const total = Math.max(0, parseInt(e.target.value) || 0);
                        update({
                          spellSlots: {
                            ...char.spellSlots,
                            [lvl]: { total, used: Math.min(slot.used || 0, total) },
                          },
                        });
                      }}
                      style={{ width: 32, textAlign: 'center', background: 'transparent', border: '1px solid rgba(199,125,255,0.2)', borderRadius: 3, color: '#c77dff', fontSize: '0.75rem', outline: 'none' }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Class Features */}
        <div className="cs-section">
          <div className="cs-section-title">✨ Traços & Características</div>
          {(char.features || []).map((feat, i) => (
            <div key={i} className="cs-feature-item">
              {isEditable ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    value={feat}
                    onChange={e => {
                      const newFeats = [...(char.features || [])];
                      newFeats[i] = e.target.value;
                      update({ features: newFeats });
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="cs-btn-small danger"
                    onClick={() => update({ features: (char.features || []).filter((_, j) => j !== i) })}
                  >✕</button>
                </div>
              ) : feat}
            </div>
          ))}
          {isEditable && (
            <button className="cs-btn-small" onClick={() => update({ features: [...(char.features || []), ''] })} style={{ marginTop: 8 }}>
              + Adicionar Traço
            </button>
          )}
        </div>
      </>
    );
  };

  // ════════════════════════════════════════════
  //  TAB: Inventário
  // ════════════════════════════════════════════
  const renderInventory = () => {
    const items = char.inventory || [];
    const totalWeight = items.reduce((sum, it) => sum + ((parseFloat(it.weight) || 0) * (parseInt(it.qty) || 1)), 0);
    const maxCarry = (char.attributes?.str || 10) * 15;
    const encPct = Math.min(100, (totalWeight / maxCarry) * 100);
    const encColor = encPct > 100 ? '#ff6b6b' : encPct > 66 ? '#ff922b' : '#51cf66';

    const updateItem = (idx, field, value) => {
      const newItems = [...items];
      newItems[idx] = { ...newItems[idx], [field]: value };
      update({ inventory: newItems });
    };

    return (
      <>
        {/* Currency */}
        <div className="cs-section">
          <div className="cs-section-title">💰 Moedas</div>
          <div className="cs-currency">
            {[
              { key: 'pp', label: 'PP', color: '#c0c0c0' },
              { key: 'gp', label: 'PO', color: '#e2b714' },
              { key: 'ep', label: 'PE', color: '#8888aa' },
              { key: 'sp', label: 'PP', color: '#aaa' },
              { key: 'cp', label: 'PC', color: '#cd7f32' },
            ].map(c => (
              <div key={c.key} className="cs-currency-item">
                <span style={{ color: c.color }}>{c.label}</span>
                {isEditable ? (
                  <input
                    type="number"
                    min="0"
                    value={char.currency?.[c.key] || 0}
                    onChange={e => update({ currency: { ...char.currency, [c.key]: Math.max(0, parseInt(e.target.value) || 0) } })}
                    style={{ color: c.color }}
                  />
                ) : (
                  <span style={{ color: c.color, fontWeight: 600, fontSize: '0.9rem' }}>{char.currency?.[c.key] || 0}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Equipment */}
        <div className="cs-section">
          <div className="cs-section-title">🎒 Equipamento</div>
          <div className="cs-inv-row" style={{ color: '#8888aa', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Item</span><span>Qtd</span><span>Peso</span><span></span>
          </div>
          {items.map((item, i) => (
            <div key={i} className="cs-inv-row">
              {isEditable ? (
                <>
                  <input value={item.name || ''} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="Item" />
                  <input type="number" min="1" value={item.qty || 1} onChange={e => updateItem(i, 'qty', e.target.value)} />
                  <input type="number" min="0" step="0.1" value={item.weight || 0} onChange={e => updateItem(i, 'weight', e.target.value)} />
                  <button className="cs-btn-small danger" onClick={() => update({ inventory: items.filter((_, j) => j !== i) })}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ color: '#ccc' }}>{item.name}</span>
                  <span style={{ color: '#999' }}>{item.qty || 1}</span>
                  <span style={{ color: '#666' }}>{item.weight || 0} lb</span>
                  <span />
                </>
              )}
            </div>
          ))}
          {isEditable && (
            <button className="cs-btn-small" onClick={() => update({ inventory: [...items, { name: '', qty: 1, weight: 0 }] })} style={{ marginTop: 8 }}>
              + Adicionar Item
            </button>
          )}

          {/* Encumbrance */}
          <div className="cs-encumbrance">
            <div className="cs-encumbrance-label">
              <span>Carga: {totalWeight.toFixed(1)} lb</span>
              <span>Máximo: {maxCarry} lb</span>
            </div>
            <div className="cs-encumbrance-bar">
              <div className="cs-encumbrance-fill" style={{ width: `${encPct}%`, background: encColor }} />
            </div>
          </div>
        </div>
      </>
    );
  };

  // ════════════════════════════════════════════
  //  TAB: Magias
  // ════════════════════════════════════════════
  const renderSpells = () => {
    const spells = char.spells || {};

    const updateSpell = (lvl, idx, field, value) => {
      const levelSpells = [...(spells[lvl] || [])];
      levelSpells[idx] = { ...levelSpells[idx], [field]: value };
      update({ spells: { ...spells, [lvl]: levelSpells } });
    };

    const addSpell = (lvl) => {
      const levelSpells = [...(spells[lvl] || []), { name: '', prepared: false }];
      update({ spells: { ...spells, [lvl]: levelSpells } });
    };

    const removeSpell = (lvl, idx) => {
      const levelSpells = (spells[lvl] || []).filter((_, i) => i !== idx);
      update({ spells: { ...spells, [lvl]: levelSpells } });
    };

    return (
      <>
        {/* Spell Slots (compact) */}
        <div className="cs-section">
          <div className="cs-section-title">🔮 Espaços de Magia</div>
          <div className="cs-spell-slots">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => {
              const slot = char.spellSlots?.[lvl];
              if (!slot || !slot.total) return null;
              return (
                <div key={lvl} className="cs-spell-level-group">
                  <div className="cs-spell-level-label">{lvl}º Nível</div>
                  <div className="cs-slot-checks">
                    {Array.from({ length: slot.total }).map((_, i) => (
                      <button
                        key={i}
                        className={`cs-slot-check ${i < (slot.used || 0) ? 'used' : ''}`}
                        onClick={() => {
                          if (!isEditable) return;
                          const newUsed = i < (slot.used || 0) ? i : i + 1;
                          update({ spellSlots: { ...char.spellSlots, [lvl]: { ...slot, used: newUsed } } });
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spells by level */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => {
          const levelSpells = spells[lvl] || [];
          if (!isEditable && levelSpells.length === 0) return null;
          return (
            <div key={lvl} className="cs-spell-group">
              <div className="cs-spell-group-title">{SPELL_LEVEL_NAMES[lvl]}</div>
              {levelSpells.map((spell, i) => (
                <div key={i} className="cs-spell-item">
                  {lvl > 0 && (
                    <input
                      type="checkbox"
                      className="cs-spell-prepared"
                      checked={!!spell.prepared}
                      onChange={() => isEditable && updateSpell(lvl, i, 'prepared', !spell.prepared)}
                      title="Preparada"
                    />
                  )}
                  <span className="cs-spell-name">
                    {isEditable ? (
                      <input
                        value={spell.name || ''}
                        onChange={e => updateSpell(lvl, i, 'name', e.target.value)}
                        placeholder="Nome da magia..."
                      />
                    ) : (
                      <span style={{ opacity: spell.prepared || lvl === 0 ? 1 : 0.5 }}>{spell.name}</span>
                    )}
                  </span>
                  {isEditable && (
                    <button className="cs-btn-small danger" onClick={() => removeSpell(lvl, i)}>✕</button>
                  )}
                </div>
              ))}
              {isEditable && (
                <button className="cs-btn-small" onClick={() => addSpell(lvl)} style={{ marginTop: 4, fontSize: '0.7rem' }}>
                  + Adicionar {lvl === 0 ? 'Truque' : 'Magia'}
                </button>
              )}
            </div>
          );
        })}
      </>
    );
  };

  // ════════════════════════════════════════════
  //  TAB: Notas
  // ════════════════════════════════════════════
  const renderNotes = () => (
    <>
      <div className="cs-notes-grid">
        <div className="cs-note-box">
          <div className="cs-note-label">Traços de Personalidade</div>
          <textarea
            value={char.personality || ''}
            onChange={e => update({ personality: e.target.value })}
            readOnly={!isEditable}
            placeholder="Como seu personagem age..."
          />
        </div>
        <div className="cs-note-box">
          <div className="cs-note-label">Ideais</div>
          <textarea
            value={char.ideals || ''}
            onChange={e => update({ ideals: e.target.value })}
            readOnly={!isEditable}
            placeholder="O que motiva seu personagem..."
          />
        </div>
        <div className="cs-note-box">
          <div className="cs-note-label">Vínculos</div>
          <textarea
            value={char.bonds || ''}
            onChange={e => update({ bonds: e.target.value })}
            readOnly={!isEditable}
            placeholder="Conexões com pessoas, lugares..."
          />
        </div>
        <div className="cs-note-box">
          <div className="cs-note-label">Defeitos</div>
          <textarea
            value={char.flaws || ''}
            onChange={e => update({ flaws: e.target.value })}
            readOnly={!isEditable}
            placeholder="Fraquezas e vícios..."
          />
        </div>
        <div className="cs-note-box backstory full-width">
          <div className="cs-note-label">História / Backstory</div>
          <textarea
            value={char.backstory || ''}
            onChange={e => update({ backstory: e.target.value })}
            readOnly={!isEditable}
            placeholder="A história de vida do seu personagem..."
          />
        </div>
        <div className="cs-note-box full-width">
          <div className="cs-note-label">Notas Livres</div>
          <textarea
            value={char.notes || ''}
            onChange={e => update({ notes: e.target.value })}
            readOnly={!isEditable}
            placeholder="Anotações de sessão, lembretes, NPCs..."
            style={{ minHeight: 120 }}
          />
        </div>
      </div>
    </>
  );

  // ── Tab content map ──
  const tabContent = {
    overview: renderOverview,
    attributes: renderAttributes,
    combat: renderCombat,
    inventory: renderInventory,
    spells: renderSpells,
    notes: renderNotes,
  };

  // ════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════
  return (
    <div className="cs-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="cs-modal">
        {/* Header */}
        <div className="cs-header">
          <div className="cs-header-left">
            <div className="cs-avatar" title="Avatar">
              {char.avatarEmoji || '⚔️'}
            </div>
            <div className="cs-header-info">
              {isEditable ? (
                <input
                  className="cs-char-name"
                  value={char.name || ''}
                  onChange={e => update({ name: e.target.value })}
                  placeholder="Nome do Personagem"
                />
              ) : (
                <span className="cs-char-name">{char.name || 'Sem Nome'}</span>
              )}
              <div className="cs-char-subtitle">
                {isEditable ? (
                  <>
                    <input value={char.race || ''} onChange={e => update({ race: e.target.value })} placeholder="Raça" style={{ width: 80 }} />
                    <span>·</span>
                    <input value={char.class || ''} onChange={e => update({ class: e.target.value })} placeholder="Classe" style={{ width: 80 }} />
                    <span>·</span>
                    <span>Nv.</span>
                    <input type="number" min="1" max="20" value={char.level || 1} onChange={e => update({ level: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })} style={{ width: 36 }} />
                  </>
                ) : (
                  <span>{char.race} · {char.class} · Nv. {char.level}</span>
                )}
              </div>
            </div>
          </div>
          <div className="cs-header-right">
            <button className="cs-rest-btn" onClick={shortRest} title="Descanso Curto">☀️ Descanso Curto</button>
            <button className="cs-rest-btn" onClick={longRest} title="Descanso Longo">🌙 Descanso Longo</button>
            <button className="cs-close-btn" onClick={onClose} title="Fechar">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="cs-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`cs-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="cs-content">
          {tabContent[activeTab]?.()}
        </div>
      </div>
    </div>
  );
}
