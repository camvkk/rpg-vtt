import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SKILLS, ABILITIES, getProficiencyBonus } from '../data/dnd5e';
import '../styles/CharacterSheet.css';

// ── D&D 5e XP Table ──
const XP_TABLE = [
  { level: 1, xp: 0 },
  { level: 2, xp: 300 },
  { level: 3, xp: 900 },
  { level: 4, xp: 2700 },
  { level: 5, xp: 6500 },
  { level: 6, xp: 14000 },
  { level: 7, xp: 23000 },
  { level: 8, xp: 34000 },
  { level: 9, xp: 48000 },
  { level: 10, xp: 64000 },
  { level: 11, xp: 85000 },
  { level: 12, xp: 100000 },
  { level: 13, xp: 120000 },
  { level: 14, xp: 140000 },
  { level: 15, xp: 165000 },
  { level: 16, xp: 195000 },
  { level: 17, xp: 225000 },
  { level: 18, xp: 265000 },
  { level: 19, xp: 305000 },
  { level: 20, xp: 355000 },
];

// Get XP progress info for a given level and current XP
const getXpProgress = (level, currentXp) => {
  const currentLevelData = XP_TABLE.find(t => t.level === level) || XP_TABLE[0];
  const nextLevelData = XP_TABLE.find(t => t.level === level + 1);
  
  if (!nextLevelData) {
    // Max level (20)
    return { current: currentXp, min: currentLevelData.xp, max: currentLevelData.xp, percent: 100, isMaxLevel: true };
  }
  
  const xpForCurrentLevel = currentLevelData.xp;
  const xpForNextLevel = nextLevelData.xp;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;
  const xpProgress = currentXp - xpForCurrentLevel;
  const percent = Math.min(100, Math.max(0, (xpProgress / xpNeeded) * 100));
  
  return { current: currentXp, min: xpForCurrentLevel, max: xpForNextLevel, percent, isMaxLevel: false };
};

// ── Spell Schools ──
const SPELL_SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation'
];

// ── Default character factory ──
const makeDefaultCharacter = () => ({
  name: '',
  race: '',
  class: '',
  subclass: '',
  level: 1,
  xp: 0,
  alignment: '',
  background: '',
  avatarEmoji: '⚔️',
  inspiration: false,
  attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  hp: { current: 10, max: 10, temp: 0 },
  ac: 10,
  speed: 30,
  hitDice: { total: 1, used: 0 },
  skills: {},          // { perception: { proficient: false, expertise: false }, ... }
  savingThrows: {},
  attacks: [],
  features: [],
  spellSlots: {},      // { 1: { total: 2, used: 0 }, 2: { total: 1, used: 0 }, ... }
  spells: {},          // { 0: [{name,prepared,school,castingTime,range,components}], 1: [...], ... }
  inventory: [],       // [{ name, qty, weight }]
  currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  proficiencies: {
    armor: [],         // ['light', 'medium', 'heavy', 'shields']
    weapons: [],       // ['simple', 'martial', 'longsword', etc.]
    tools: [],         // ['Thieves\' Tools', 'Smith\'s Tools', etc.]
    languages: [],     // ['Common', 'Elvish', 'Dwarvish', etc.]
  },
  personality: '',
  ideals: '',
  bonds: '',
  flaws: '',
  backstory: '',
  notes: '',
  // ── Estado do Personagem ──
  deathSaves: { successes: 0, failures: 0 },
  conditions: [],      // ['blinded', 'poisoned', ...]
  concentration: { active: false, spell: '' },
});

// ── Condições D&D 5e ──
const DND_CONDITIONS = [
  { id: 'blinded', name: 'Cego', icon: '👁️' },
  { id: 'charmed', name: 'Enfeitiçado', icon: '💕' },
  { id: 'deafened', name: 'Surdo', icon: '🔇' },
  { id: 'frightened', name: 'Amedrontado', icon: '😱' },
  { id: 'grappled', name: 'Agarrado', icon: '🤼' },
  { id: 'incapacitated', name: 'Incapacitado', icon: '💫' },
  { id: 'invisible', name: 'Invisível', icon: '👻' },
  { id: 'paralyzed', name: 'Paralisado', icon: '⚡' },
  { id: 'petrified', name: 'Petrificado', icon: '🪨' },
  { id: 'poisoned', name: 'Envenenado', icon: '🤢' },
  { id: 'prone', name: 'Caído', icon: '🔻' },
  { id: 'restrained', name: 'Contido', icon: '⛓️' },
  { id: 'stunned', name: 'Atordoado', icon: '💥' },
  { id: 'unconscious', name: 'Inconsciente', icon: '💤' },
];

// ── Proficiency options ──
const ARMOR_TYPES = [
  { id: 'light', name: 'Armadura Leve' },
  { id: 'medium', name: 'Armadura Média' },
  { id: 'heavy', name: 'Armadura Pesada' },
  { id: 'shields', name: 'Escudos' },
];

const WEAPON_TYPES = [
  { id: 'simple', name: 'Armas Simples' },
  { id: 'martial', name: 'Armas Marciais' },
];

const COMMON_LANGUAGES = [
  'Comum', 'Élfico', 'Anão', 'Gigante', 'Gnômico', 'Goblin', 'Halfling', 'Orc',
  'Abissal', 'Celestial', 'Dracônico', 'Infernal', 'Primordial', 'Subcomum', 'Silvestre',
];

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
  isDM = false,
  isOtherCharacter = false,
  onUpdateCharacter,
  onRollDice,
  onClose,
  onMinimize,
  isMinimized = false,
  windowMode = false,
  initialPosition = null,
  zIndex = 1000,
  onFocus,
  sheetId = null,
}) {
  // ── Draggable window state ──
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef(null);

  // ── Drag handlers ──
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.cs-tab') || e.target.closest('input') || e.target.closest('button') || e.target.closest('textarea')) {
      return;
    }
    if (!windowMode) return;
    e.preventDefault();
    setIsDragging(true);
    const rect = modalRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    onFocus?.();
  }, [windowMode, onFocus]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    // Constrain to viewport
    const maxX = window.innerWidth - 400;
    const maxY = window.innerHeight - 100;
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // ── Determine if editable (DM can edit any sheet) ──
  const canEdit = isEditable || (isDM && isOtherCharacter);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSpells, setExpandedSpells] = useState({}); // Track which spells have expanded details
  const char = character || makeDefaultCharacter();
  const saveTimer = useRef(null); // eslint-disable-line no-unused-vars

  // ── Derived values (must be before any conditional returns) ──
  const profBonus = useMemo(() => getProficiencyBonus(char.level || 1), [char.level]);

  const getMod = (score) => Math.floor(((score || 10) - 10) / 2);

  const mods = useMemo(() => {
    const m = {};
    Object.keys(ABILITIES).forEach(k => { m[k] = getMod(char.attributes?.[k]); });
    return m;
  }, [char.attributes]);

  // ── Helper to calculate skill bonus with expertise support ──
  const getSkillBonus = useCallback((skillKey) => {
    const skill = SKILLS[skillKey];
    if (!skill) return 0;
    const abilityMod = mods[skill.ability];
    const skillData = char.skills?.[skillKey];
    if (skillData?.expertise) {
      return abilityMod + (profBonus * 2); // Expertise = double proficiency
    } else if (skillData?.proficient) {
      return abilityMod + profBonus;
    }
    return abilityMod;
  }, [char.skills, mods, profBonus]);

  const passivePerception = useMemo(() => {
    return 10 + getSkillBonus('perception');
  }, [getSkillBonus]);

  const hpPct = useMemo(() => {
    const total = (char.hp?.max || 1) + (char.hp?.temp || 0);
    return Math.max(0, Math.min(100, ((char.hp?.current || 0) / total) * 100));
  }, [char.hp]);

  const hpColor = hpPct > 75 ? '#51cf66' : hpPct > 50 ? '#ffd43b' : hpPct > 25 ? '#ff922b' : '#ff6b6b';

  // ── Update helper with debounced auto-save ──
  const update = useCallback((patch) => {
    if (!canEdit) return;
    const updated = { ...char, ...patch };
    onUpdateCharacter(updated);
  }, [char, canEdit, onUpdateCharacter]);

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
    const total = getSkillBonus(skillKey);
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
    if (!canEdit) return;
    // Restore hit dice (half level, min 1)
    const restored = Math.max(1, Math.floor((char.level || 1) / 2));
    const newUsed = Math.max(0, (char.hitDice?.used || 0) - restored);
    update({ hitDice: { ...char.hitDice, used: newUsed } });
  };

  const longRest = () => {
    if (!canEdit) return;
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
              {canEdit ? (
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
          {canEdit && (
            <div className="cs-hp-btns">
              <button className="cs-hp-btn minus" onClick={() => update({ hp: { ...char.hp, current: Math.max(0, (char.hp?.current || 0) - 1) } })}>−</button>
              <button className="cs-hp-btn plus" onClick={() => update({ hp: { ...char.hp, current: Math.min((char.hp?.max || 10) + (char.hp?.temp || 0), (char.hp?.current || 0) + 1) } })}>+</button>
              {canEdit && (
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
            {canEdit ? (
              <input type="number" value={char.ac ?? 10} onChange={e => update({ ac: parseInt(e.target.value) || 10 })} />
            ) : char.ac}
          </div>
        </div>
        <div className="cs-quick-stat">
          <div className="cs-quick-stat-label">Velocidade</div>
          <div className="cs-quick-stat-value">
            {canEdit ? (
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
            onClick={() => canEdit && update({ inspiration: !char.inspiration })}
            title="Inspiração"
          >
            {char.inspiration ? '⭐' : '☆'}
          </button>
          <span style={{ fontSize: '0.85rem', color: '#ccc' }}>Inspiração</span>
        </div>
      </div>

      {/* Experience Points (XP) */}
      <div className="cs-section">
        <div className="cs-section-title">✨ Experiência (XP)</div>
        {(() => {
          const xpProgress = getXpProgress(char.level || 1, char.xp || 0);
          return (
            <div className="cs-xp-container">
              <div className="cs-xp-header">
                <div className="cs-xp-values">
                  {canEdit ? (
                    <input
                      type="number"
                      min="0"
                      value={char.xp || 0}
                      onChange={e => update({ xp: Math.max(0, parseInt(e.target.value) || 0) })}
                      style={{ width: 80, textAlign: 'center', background: 'transparent', border: '1px solid rgba(226,183,20,0.3)', borderRadius: 4, color: '#e2b714', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                    />
                  ) : (
                    <span style={{ color: '#e2b714', fontWeight: 600, fontSize: '1rem' }}>{char.xp || 0}</span>
                  )}
                  <span style={{ color: '#666', fontSize: '0.85rem' }}> / {xpProgress.max} XP</span>
                </div>
                {!xpProgress.isMaxLevel && (
                  <span style={{ color: '#8888aa', fontSize: '0.75rem' }}>
                    Próximo nível: {xpProgress.max - (char.xp || 0)} XP restantes
                  </span>
                )}
                {xpProgress.isMaxLevel && (
                  <span style={{ color: '#51cf66', fontSize: '0.75rem' }}>Nível Máximo!</span>
                )}
              </div>
              <div className="cs-xp-bar">
                <div 
                  className="cs-xp-fill" 
                  style={{ 
                    width: `${xpProgress.percent}%`, 
                    background: 'linear-gradient(90deg, #e2b714, #ffd43b)' 
                  }} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#666', marginTop: 2 }}>
                <span>Nv. {char.level || 1}</span>
                {!xpProgress.isMaxLevel && <span>Nv. {(char.level || 1) + 1}</span>}
              </div>
            </div>
          );
        })()}
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

      {/* Estado do Personagem */}
      <div className="cs-section cs-character-state">
        <div className="cs-section-title">💀 Estado do Personagem</div>
        
        {/* Death Saves */}
        <div className="cs-death-saves">
          <div className="cs-death-saves-label">Salvaguardas contra Morte</div>
          <div className="cs-death-saves-row">
            <div className="cs-death-saves-group">
              <span className="cs-death-label success">Sucessos</span>
              <div className="cs-death-checks">
                {[0, 1, 2].map(i => (
                  <button
                    key={i}
                    className={`cs-death-check success ${i < (char.deathSaves?.successes || 0) ? 'filled' : ''}`}
                    onClick={() => {
                      if (!canEdit) return;
                      const current = char.deathSaves?.successes || 0;
                      const newVal = i < current ? i : i + 1;
                      update({ deathSaves: { ...char.deathSaves, successes: Math.min(3, newVal) } });
                    }}
                    title={`Sucesso ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            <div className="cs-death-saves-group">
              <span className="cs-death-label failure">Falhas</span>
              <div className="cs-death-checks">
                {[0, 1, 2].map(i => (
                  <button
                    key={i}
                    className={`cs-death-check failure ${i < (char.deathSaves?.failures || 0) ? 'filled' : ''}`}
                    onClick={() => {
                      if (!canEdit) return;
                      const current = char.deathSaves?.failures || 0;
                      const newVal = i < current ? i : i + 1;
                      update({ deathSaves: { ...char.deathSaves, failures: Math.min(3, newVal) } });
                    }}
                    title={`Falha ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            {canEdit && (char.deathSaves?.successes > 0 || char.deathSaves?.failures > 0) && (
              <button
                className="cs-btn-small"
                onClick={() => update({ deathSaves: { successes: 0, failures: 0 } })}
                title="Resetar"
                style={{ marginLeft: 8 }}
              >
                ↺
              </button>
            )}
          </div>
        </div>

        {/* Concentração */}
        <div className="cs-concentration">
          <label className="cs-concentration-toggle">
            <input
              type="checkbox"
              checked={char.concentration?.active || false}
              onChange={() => canEdit && update({
                concentration: {
                  ...char.concentration,
                  active: !char.concentration?.active,
                  spell: !char.concentration?.active ? char.concentration?.spell : ''
                }
              })}
              disabled={!canEdit}
            />
            <span className="cs-concentration-label">🔮 Concentrando</span>
          </label>
          {char.concentration?.active && (
            <input
              type="text"
              className="cs-concentration-spell"
              value={char.concentration?.spell || ''}
              onChange={e => canEdit && update({
                concentration: { ...char.concentration, spell: e.target.value }
              })}
              placeholder="Nome da magia..."
              disabled={!canEdit}
            />
          )}
        </div>

        {/* Condições */}
        <div className="cs-conditions">
          <div className="cs-conditions-label">Condições Ativas</div>
          <div className="cs-conditions-grid">
            {DND_CONDITIONS.map(cond => {
              const isActive = (char.conditions || []).includes(cond.id);
              return (
                <button
                  key={cond.id}
                  className={`cs-condition-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (!canEdit) return;
                    const currentConditions = char.conditions || [];
                    const newConditions = isActive
                      ? currentConditions.filter(c => c !== cond.id)
                      : [...currentConditions, cond.id];
                    update({ conditions: newConditions });
                  }}
                  title={cond.name}
                >
                  <span className="cs-condition-icon">{cond.icon}</span>
                  <span className="cs-condition-name">{cond.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rest Buttons */}
      {canEdit && (
        <div className="cs-section">
          <div className="cs-section-title">🛌 Descanso</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="cs-rest-card" style={{ flex: 1, minWidth: 140 }}>
              <button
                className="cs-rest-btn-card"
                onClick={shortRest}
                style={{
                  width: '100%', padding: '12px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #ff922b 0%, #fd7e14 100%)',
                  border: 'none', cursor: 'pointer', color: '#fff',
                  fontWeight: 600, fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(255,146,43,0.3)',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,146,43,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(255,146,43,0.3)'; }}
              >
                ☀️ Descanso Curto
              </button>
              <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#888', lineHeight: 1.4 }}>
                <strong>1 hora.</strong> Usa Dados de Vida para recuperar HP. Restaura habilidades de descanso curto (ex: Ação Ardilosa, Fôlego).
              </div>
            </div>
            <div className="cs-rest-card" style={{ flex: 1, minWidth: 140 }}>
              <button
                className="cs-rest-btn-card"
                onClick={longRest}
                style={{
                  width: '100%', padding: '12px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #7950f2 0%, #845ef7 100%)',
                  border: 'none', cursor: 'pointer', color: '#fff',
                  fontWeight: 600, fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(121,80,242,0.3)',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(121,80,242,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(121,80,242,0.3)'; }}
              >
                🌙 Descanso Longo
              </button>
              <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#888', lineHeight: 1.4 }}>
                <strong>8 horas.</strong> Recupera todo HP, metade dos Dados de Vida e todos os espaços de magia.
              </div>
            </div>
          </div>
        </div>
      )}
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
                {canEdit ? (
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
              {canEdit && (
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
        {canEdit && (
          <div className="cs-skill-legend" style={{ fontSize: '0.65rem', color: '#666', marginBottom: 6, display: 'flex', gap: 12 }}>
            <span>◯ = Não treinado</span>
            <span style={{ color: '#51cf66' }}>● = Proficiente</span>
            <span style={{ color: '#e2b714' }}>★ = Expertise (2x)</span>
          </div>
        )}
        {Object.entries(SKILLS).map(([key, skill]) => {
          const skillData = char.skills?.[key] || {};
          const total = getSkillBonus(key);
          const isExpert = skillData.expertise;
          const isProf = skillData.proficient;
          return (
            <div key={key} className="cs-skill-row">
              {canEdit && (
                <div className="cs-skill-prof-group" style={{ display: 'flex', gap: 2 }}>
                  <button
                    className={`cs-skill-prof-btn ${isProf && !isExpert ? 'active' : ''}`}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', border: '2px solid #51cf66',
                      background: isProf && !isExpert ? '#51cf66' : 'transparent',
                      cursor: 'pointer', fontSize: '0.6rem', color: isProf && !isExpert ? '#1a1a2e' : '#51cf66',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onClick={() => {
                      if (!isProf) {
                        update({ skills: { ...char.skills, [key]: { proficient: true, expertise: false } } });
                      } else if (!isExpert) {
                        update({ skills: { ...char.skills, [key]: { proficient: false, expertise: false } } });
                      } else {
                        update({ skills: { ...char.skills, [key]: { proficient: true, expertise: false } } });
                      }
                    }}
                    title="Proficiência"
                  >
                    {isProf && !isExpert ? '●' : '○'}
                  </button>
                  <button
                    className={`cs-skill-exp-btn ${isExpert ? 'active' : ''}`}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', border: '2px solid #e2b714',
                      background: isExpert ? '#e2b714' : 'transparent',
                      cursor: 'pointer', fontSize: '0.6rem', color: isExpert ? '#1a1a2e' : '#e2b714',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onClick={() => {
                      if (isExpert) {
                        update({ skills: { ...char.skills, [key]: { proficient: true, expertise: false } } });
                      } else {
                        update({ skills: { ...char.skills, [key]: { proficient: true, expertise: true } } });
                      }
                    }}
                    title="Expertise (dobra bônus de proficiência)"
                  >
                    {isExpert ? '★' : '☆'}
                  </button>
                </div>
              )}
              {!canEdit && (isProf || isExpert) && (
                <span style={{ color: isExpert ? '#e2b714' : '#51cf66', marginRight: 4 }}>
                  {isExpert ? '★' : '●'}
                </span>
              )}
              <span className="cs-skill-name">{skill.name}</span>
              <span className="cs-skill-ability">{ABILITIES[skill.ability]?.short}</span>
              <span className={`cs-skill-bonus ${isExpert ? 'expertise' : isProf ? 'proficient' : ''}`} style={{ color: isExpert ? '#e2b714' : isProf ? '#51cf66' : undefined }}>
                {fmtMod(total)}
              </span>
              <button className="cs-skill-roll" onClick={() => rollSkill(key)} title="Rolar">🎲</button>
            </div>
          );
        })}
        <div className="cs-passive">
          👁️ Percepção Passiva: <strong>{passivePerception}</strong>
        </div>
      </div>

      {/* Proficiencies */}
      <div className="cs-section">
        <div className="cs-section-title">🛡️ Proficiências</div>
        
        {/* Armor */}
        <div className="cs-prof-group">
          <div className="cs-prof-label" style={{ fontSize: '0.75rem', color: '#8888aa', marginBottom: 4 }}>Armaduras</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ARMOR_TYPES.map(armor => {
              const isProf = (char.proficiencies?.armor || []).includes(armor.id);
              return (
                <button
                  key={armor.id}
                  className={`cs-prof-chip ${isProf ? 'active' : ''}`}
                  style={{
                    padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem',
                    border: `1px solid ${isProf ? '#51cf66' : '#444'}`,
                    background: isProf ? 'rgba(81,207,102,0.2)' : 'transparent',
                    color: isProf ? '#51cf66' : '#888',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (!canEdit) return;
                    const current = char.proficiencies?.armor || [];
                    const newArmor = isProf
                      ? current.filter(a => a !== armor.id)
                      : [...current, armor.id];
                    update({ proficiencies: { ...char.proficiencies, armor: newArmor } });
                  }}
                >
                  {armor.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Weapons */}
        <div className="cs-prof-group" style={{ marginTop: 10 }}>
          <div className="cs-prof-label" style={{ fontSize: '0.75rem', color: '#8888aa', marginBottom: 4 }}>Armas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {WEAPON_TYPES.map(weapon => {
              const isProf = (char.proficiencies?.weapons || []).includes(weapon.id);
              return (
                <button
                  key={weapon.id}
                  className={`cs-prof-chip ${isProf ? 'active' : ''}`}
                  style={{
                    padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem',
                    border: `1px solid ${isProf ? '#51cf66' : '#444'}`,
                    background: isProf ? 'rgba(81,207,102,0.2)' : 'transparent',
                    color: isProf ? '#51cf66' : '#888',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (!canEdit) return;
                    const current = char.proficiencies?.weapons || [];
                    const newWeapons = isProf
                      ? current.filter(w => w !== weapon.id)
                      : [...current, weapon.id];
                    update({ proficiencies: { ...char.proficiencies, weapons: newWeapons } });
                  }}
                >
                  {weapon.name}
                </button>
              );
            })}
          </div>
          {/* Custom weapons input */}
          {canEdit && (
            <div style={{ marginTop: 6 }}>
              <input
                type="text"
                placeholder="Armas específicas (ex: Espada Longa, Besta de Mão)"
                value={(char.proficiencies?.weapons || []).filter(w => !['simple', 'martial'].includes(w)).join(', ')}
                onChange={e => {
                  const baseWeapons = (char.proficiencies?.weapons || []).filter(w => ['simple', 'martial'].includes(w));
                  const custom = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  update({ proficiencies: { ...char.proficiencies, weapons: [...baseWeapons, ...custom] } });
                }}
                style={{
                  width: '100%', padding: '4px 8px', fontSize: '0.75rem',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                  borderRadius: 4, color: '#ccc', outline: 'none',
                }}
              />
            </div>
          )}
          {!canEdit && (char.proficiencies?.weapons || []).filter(w => !['simple', 'martial'].includes(w)).length > 0 && (
            <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 4 }}>
              {(char.proficiencies?.weapons || []).filter(w => !['simple', 'martial'].includes(w)).join(', ')}
            </div>
          )}
        </div>

        {/* Tools */}
        <div className="cs-prof-group" style={{ marginTop: 10 }}>
          <div className="cs-prof-label" style={{ fontSize: '0.75rem', color: '#8888aa', marginBottom: 4 }}>Ferramentas</div>
          {canEdit ? (
            <input
              type="text"
              placeholder="Ferramentas de Ladrão, Ferramentas de Ferreiro, Kit de Herbalismo..."
              value={(char.proficiencies?.tools || []).join(', ')}
              onChange={e => {
                const tools = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                update({ proficiencies: { ...char.proficiencies, tools } });
              }}
              style={{
                width: '100%', padding: '4px 8px', fontSize: '0.75rem',
                background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                borderRadius: 4, color: '#ccc', outline: 'none',
              }}
            />
          ) : (
            <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
              {(char.proficiencies?.tools || []).length > 0 ? (char.proficiencies?.tools || []).join(', ') : <span style={{ color: '#666' }}>Nenhuma</span>}
            </div>
          )}
        </div>
      </div>

      {/* Languages */}
      <div className="cs-section">
        <div className="cs-section-title">🗣️ Idiomas</div>
        {canEdit ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {COMMON_LANGUAGES.map(lang => {
                const isKnown = (char.proficiencies?.languages || []).includes(lang);
                return (
                  <button
                    key={lang}
                    style={{
                      padding: '2px 6px', borderRadius: 10, fontSize: '0.65rem',
                      border: `1px solid ${isKnown ? '#7950f2' : '#333'}`,
                      background: isKnown ? 'rgba(121,80,242,0.2)' : 'transparent',
                      color: isKnown ? '#b197fc' : '#666',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const current = char.proficiencies?.languages || [];
                      const newLangs = isKnown
                        ? current.filter(l => l !== lang)
                        : [...current, lang];
                      update({ proficiencies: { ...char.proficiencies, languages: newLangs } });
                    }}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder="Outros idiomas (ex: Língua dos Mortos, Dialeto Racial)"
              value={(char.proficiencies?.languages || []).filter(l => !COMMON_LANGUAGES.includes(l)).join(', ')}
              onChange={e => {
                const baseLangs = (char.proficiencies?.languages || []).filter(l => COMMON_LANGUAGES.includes(l));
                const custom = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                update({ proficiencies: { ...char.proficiencies, languages: [...baseLangs, ...custom] } });
              }}
              style={{
                width: '100%', padding: '4px 8px', fontSize: '0.75rem',
                background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                borderRadius: 4, color: '#ccc', outline: 'none',
              }}
            />
          </>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
            {(char.proficiencies?.languages || []).length > 0 
              ? (char.proficiencies?.languages || []).join(', ') 
              : <span style={{ color: '#666' }}>Nenhum</span>}
          </div>
        )}
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
              {canEdit ? (
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
          {canEdit && (
            <button className="cs-btn-small" onClick={addAttack} style={{ marginTop: 8 }}>+ Adicionar Ataque</button>
          )}
          {!canEdit && attacks.length > 0 && (
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
                          if (!canEdit) return;
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
          {canEdit && (
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
              {canEdit ? (
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
          {canEdit && (
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
                {canEdit ? (
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
              {canEdit ? (
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
          {canEdit && (
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
      const levelSpells = [...(spells[lvl] || []), { 
        name: '', 
        prepared: false, 
        school: '', 
        castingTime: '', 
        range: '', 
        components: '' 
      }];
      update({ spells: { ...spells, [lvl]: levelSpells } });
    };

    const toggleSpellDetails = (lvl, idx) => {
      const key = `${lvl}-${idx}`;
      setExpandedSpells(prev => ({ ...prev, [key]: !prev[key] }));
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
                          if (!canEdit) return;
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
          if (!canEdit && levelSpells.length === 0) return null;
          return (
            <div key={lvl} className="cs-spell-group">
              <div className="cs-spell-group-title">{SPELL_LEVEL_NAMES[lvl]}</div>
              {levelSpells.map((spell, i) => {
                const spellKey = `${lvl}-${i}`;
                const isExpanded = expandedSpells[spellKey];
                const hasDetails = spell.school || spell.castingTime || spell.range || spell.components;
                
                return (
                  <div key={i} className="cs-spell-item-container">
                    <div className="cs-spell-item">
                      {lvl > 0 && (
                        <input
                          type="checkbox"
                          className="cs-spell-prepared"
                          checked={!!spell.prepared}
                          onChange={() => canEdit && updateSpell(lvl, i, 'prepared', !spell.prepared)}
                          title="Preparada"
                        />
                      )}
                      <span className="cs-spell-name">
                        {canEdit ? (
                          <input
                            value={spell.name || ''}
                            onChange={e => updateSpell(lvl, i, 'name', e.target.value)}
                            placeholder="Nome da magia..."
                          />
                        ) : (
                          <span style={{ opacity: spell.prepared || lvl === 0 ? 1 : 0.5 }}>{spell.name}</span>
                        )}
                      </span>
                      {/* School badge (compact) */}
                      {spell.school && !isExpanded && (
                        <span style={{ 
                          fontSize: '0.6rem', 
                          color: '#c77dff', 
                          background: 'rgba(199,125,255,0.15)', 
                          padding: '1px 6px', 
                          borderRadius: 8,
                          marginLeft: 4
                        }}>
                          {spell.school.substring(0, 3)}
                        </span>
                      )}
                      {/* Expand/collapse button */}
                      <button
                        className="cs-btn-small"
                        onClick={() => toggleSpellDetails(lvl, i)}
                        style={{ 
                          marginLeft: 4, 
                          opacity: hasDetails || canEdit ? 1 : 0.4,
                          fontSize: '0.7rem',
                          padding: '2px 6px'
                        }}
                        title={isExpanded ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      {canEdit && (
                        <button className="cs-btn-small danger" onClick={() => removeSpell(lvl, i)}>✕</button>
                      )}
                    </div>
                    
                    {/* Expanded spell details */}
                    {isExpanded && (
                      <div className="cs-spell-details" style={{
                        background: 'rgba(199,125,255,0.05)',
                        border: '1px solid rgba(199,125,255,0.2)',
                        borderRadius: 6,
                        padding: 8,
                        marginTop: 4,
                        marginBottom: 8,
                        marginLeft: lvl > 0 ? 24 : 0
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {/* School */}
                          <div>
                            <label style={{ fontSize: '0.65rem', color: '#8888aa', display: 'block', marginBottom: 2 }}>Escola</label>
                            {canEdit ? (
                              <select
                                value={spell.school || ''}
                                onChange={e => updateSpell(lvl, i, 'school', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '4px 6px',
                                  fontSize: '0.75rem',
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(199,125,255,0.3)',
                                  borderRadius: 4,
                                  color: '#c77dff',
                                  outline: 'none'
                                }}
                              >
                                <option value="">--</option>
                                {SPELL_SCHOOLS.map(school => (
                                  <option key={school} value={school}>{school}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ color: '#c77dff', fontSize: '0.8rem' }}>{spell.school || '-'}</span>
                            )}
                          </div>
                          
                          {/* Casting Time */}
                          <div>
                            <label style={{ fontSize: '0.65rem', color: '#8888aa', display: 'block', marginBottom: 2 }}>Tempo de Conjuração</label>
                            {canEdit ? (
                              <input
                                type="text"
                                value={spell.castingTime || ''}
                                onChange={e => updateSpell(lvl, i, 'castingTime', e.target.value)}
                                placeholder="1 ação"
                                style={{
                                  width: '100%',
                                  padding: '4px 6px',
                                  fontSize: '0.75rem',
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(199,125,255,0.3)',
                                  borderRadius: 4,
                                  color: '#ccc',
                                  outline: 'none'
                                }}
                              />
                            ) : (
                              <span style={{ color: '#ccc', fontSize: '0.8rem' }}>{spell.castingTime || '-'}</span>
                            )}
                          </div>
                          
                          {/* Range */}
                          <div>
                            <label style={{ fontSize: '0.65rem', color: '#8888aa', display: 'block', marginBottom: 2 }}>Alcance</label>
                            {canEdit ? (
                              <input
                                type="text"
                                value={spell.range || ''}
                                onChange={e => updateSpell(lvl, i, 'range', e.target.value)}
                                placeholder="36m / 120ft"
                                style={{
                                  width: '100%',
                                  padding: '4px 6px',
                                  fontSize: '0.75rem',
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(199,125,255,0.3)',
                                  borderRadius: 4,
                                  color: '#ccc',
                                  outline: 'none'
                                }}
                              />
                            ) : (
                              <span style={{ color: '#ccc', fontSize: '0.8rem' }}>{spell.range || '-'}</span>
                            )}
                          </div>
                          
                          {/* Components */}
                          <div>
                            <label style={{ fontSize: '0.65rem', color: '#8888aa', display: 'block', marginBottom: 2 }}>Componentes</label>
                            {canEdit ? (
                              <input
                                type="text"
                                value={spell.components || ''}
                                onChange={e => updateSpell(lvl, i, 'components', e.target.value)}
                                placeholder="V, S, M"
                                style={{
                                  width: '100%',
                                  padding: '4px 6px',
                                  fontSize: '0.75rem',
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(199,125,255,0.3)',
                                  borderRadius: 4,
                                  color: '#ccc',
                                  outline: 'none'
                                }}
                              />
                            ) : (
                              <span style={{ color: '#ccc', fontSize: '0.8rem' }}>{spell.components || '-'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {canEdit && (
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
      {/* Background/Antecedente */}
      <div className="cs-section">
        <div className="cs-section-title">📜 Antecedente (Background)</div>
        <div style={{ marginBottom: 12 }}>
          {canEdit ? (
            <input
              type="text"
              value={char.background || ''}
              onChange={e => update({ background: e.target.value })}
              placeholder="Ex: Soldado, Nobre, Criminoso, Eremita..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '0.9rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(226,183,20,0.3)',
                borderRadius: 6,
                color: '#e2b714',
                fontWeight: 500,
                outline: 'none'
              }}
            />
          ) : (
            <span style={{ 
              color: '#e2b714', 
              fontSize: '1rem', 
              fontWeight: 500,
              display: 'block',
              padding: '8px 0'
            }}>
              {char.background || 'Nenhum antecedente definido'}
            </span>
          )}
        </div>
      </div>

      <div className="cs-notes-grid">
        <div className="cs-note-box">
          <div className="cs-note-label">Traços de Personalidade</div>
          <textarea
            value={char.personality || ''}
            onChange={e => update({ personality: e.target.value })}
            readOnly={!canEdit}
            placeholder="Como seu personagem age..."
          />
        </div>
        <div className="cs-note-box">
          <div className="cs-note-label">Ideais</div>
          <textarea
            value={char.ideals || ''}
            onChange={e => update({ ideals: e.target.value })}
            readOnly={!canEdit}
            placeholder="O que motiva seu personagem..."
          />
        </div>
        <div className="cs-note-box">
          <div className="cs-note-label">Vínculos</div>
          <textarea
            value={char.bonds || ''}
            onChange={e => update({ bonds: e.target.value })}
            readOnly={!canEdit}
            placeholder="Conexões com pessoas, lugares..."
          />
        </div>
        <div className="cs-note-box">
          <div className="cs-note-label">Defeitos</div>
          <textarea
            value={char.flaws || ''}
            onChange={e => update({ flaws: e.target.value })}
            readOnly={!canEdit}
            placeholder="Fraquezas e vícios..."
          />
        </div>
        <div className="cs-note-box backstory full-width">
          <div className="cs-note-label">História / Backstory</div>
          <textarea
            value={char.backstory || ''}
            onChange={e => update({ backstory: e.target.value })}
            readOnly={!canEdit}
            placeholder="A história de vida do seu personagem..."
          />
        </div>
        <div className="cs-note-box full-width">
          <div className="cs-note-label">Notas Livres</div>
          <textarea
            value={char.notes || ''}
            onChange={e => update({ notes: e.target.value })}
            readOnly={!canEdit}
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
  
  // ── If minimized, render minimal floating tag ──
  if (isMinimized) {
    return (
      <div
        className="cs-minimized"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: zIndex,
        }}
        onClick={() => onMinimize?.(false)}
        onMouseDown={(e) => {
          if (!windowMode) return;
          e.preventDefault();
          setIsDragging(true);
          const rect = e.currentTarget.getBoundingClientRect();
          dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          onFocus?.();
        }}
      >
        <span className="cs-minimized-avatar">{char.avatarEmoji || '⚔️'}</span>
        <span className="cs-minimized-name">{char.name || 'Sem Nome'}</span>
        {isDM && isOtherCharacter && <span className="cs-minimized-dm-badge">👑</span>}
      </div>
    );
  }

  // Window mode: floating draggable window
  if (windowMode) {
    return (
      <div
        ref={modalRef}
        className={`cs-window ${isDragging ? 'cs-window-dragging' : ''}`}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: zIndex,
        }}
        onMouseDown={() => onFocus?.()}
      >
        {/* Window Header (draggable) */}
        <div 
          className="cs-window-header"
          onMouseDown={handleMouseDown}
        >
          <div className="cs-window-header-left">
            <span className="cs-window-avatar">{char.avatarEmoji || '⚔️'}</span>
            <span className="cs-window-title">{char.name || 'Sem Nome'}</span>
            {isDM && isOtherCharacter && <span className="cs-window-dm-badge">👑 Mestre</span>}
            {/* Status badges */}
            {char.concentration?.active && (
              <span className="cs-header-badge cs-badge-concentration" title={`Concentrando: ${char.concentration.spell || '?'}`}>
                🔮 {char.concentration.spell || 'Conc.'}
              </span>
            )}
            {(char.conditions || []).length > 0 && (
              <div className="cs-header-conditions">
                {(char.conditions || []).slice(0, 3).map(condId => {
                  const cond = DND_CONDITIONS.find(c => c.id === condId);
                  return cond ? (
                    <span key={condId} className="cs-header-badge cs-badge-condition" title={cond.name}>
                      {cond.icon}
                    </span>
                  ) : null;
                })}
                {(char.conditions || []).length > 3 && (
                  <span className="cs-header-badge cs-badge-condition" title={(char.conditions || []).slice(3).map(id => DND_CONDITIONS.find(c => c.id === id)?.name).join(', ')}>
                    +{(char.conditions || []).length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="cs-window-controls">
            {onMinimize && (
              <button 
                className="cs-window-btn cs-window-minimize" 
                onClick={(e) => { e.stopPropagation(); onMinimize(true); }}
                title="Minimizar"
              >
                ─
              </button>
            )}
            <button 
              className="cs-window-btn cs-window-close" 
              onClick={(e) => { e.stopPropagation(); onClose?.(); }}
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="cs-tabs cs-tabs-window">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`cs-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="cs-content cs-content-window">
          {tabContent[activeTab]?.()}
        </div>

        {/* Window Footer */}
        <div className="cs-window-footer">
          <button className="cs-rest-btn cs-rest-btn-sm" onClick={shortRest} title="Descanso Curto">☀️</button>
          <button className="cs-rest-btn cs-rest-btn-sm" onClick={longRest} title="Descanso Longo">🌙</button>
        </div>
      </div>
    );
  }

  // Full-screen modal mode (original)
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
              {canEdit ? (
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
                {canEdit ? (
                  <>
                    <input value={char.race || ''} onChange={e => update({ race: e.target.value })} placeholder="Raça" style={{ width: 80 }} />
                    <span>·</span>
                    <input value={char.class || ''} onChange={e => update({ class: e.target.value })} placeholder="Classe" style={{ width: 80 }} />
                    <input 
                      value={char.subclass || ''} 
                      onChange={e => update({ subclass: e.target.value })} 
                      placeholder="Subclasse" 
                      style={{ width: 90, marginLeft: 4, color: '#c77dff', fontStyle: 'italic' }} 
                      title="Ex: Campeão, Círculo da Lua"
                    />
                    <span>·</span>
                    <span>Nv.</span>
                    <input type="number" min="1" max="20" value={char.level || 1} onChange={e => update({ level: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })} style={{ width: 36 }} />
                  </>
                ) : (
                  <span>
                    {char.race} · {char.class}
                    {char.subclass && <span style={{ color: '#c77dff', fontStyle: 'italic' }}> - {char.subclass}</span>}
                    {' '}· Nv. {char.level}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Status badges no header */}
          <div className="cs-header-status">
            {char.concentration?.active && (
              <span className="cs-header-badge cs-badge-concentration" title={`Concentrando: ${char.concentration.spell || '?'}`}>
                🔮 {char.concentration.spell || 'Concentrando'}
              </span>
            )}
            {(char.conditions || []).map(condId => {
              const cond = DND_CONDITIONS.find(c => c.id === condId);
              return cond ? (
                <span key={condId} className="cs-header-badge cs-badge-condition" title={cond.name}>
                  {cond.icon} {cond.name}
                </span>
              ) : null;
            })}
          </div>
          <div className="cs-header-right">
            {isDM && isOtherCharacter && <span className="cs-dm-viewing-badge">👑 Editando como Mestre</span>}
            <button className="cs-rest-btn" onClick={shortRest} title="Descanso Curto">☀️ Descanso Curto</button>
            <button className="cs-rest-btn" onClick={longRest} title="Descanso Longo">🌙 Descanso Longo</button>
            {onMinimize && (
              <button className="cs-minimize-btn" onClick={() => onMinimize(true)} title="Minimizar">─</button>
            )}
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
