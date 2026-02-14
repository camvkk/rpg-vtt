import React, { useState, useMemo, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { SKILLS, getProficiencyBonus } from '../data/dnd5e';
import '../styles/QuickActions.css';

/**
 * QuickActions — Hotbar de ações rápidas para jogadores
 * 
 * Mostra atalhos baseados na ficha do personagem:
 * - Perícias favoritas (proficientes)
 * - Ataques configurados
 * - Magias preparadas
 * - Salvaguardas (6 atributos)
 * 
 * Ao clicar, rola os dados automaticamente e envia pro chat.
 */
export default function QuickActions() {
  const { state, actions } = useGame();
  const { character, player } = state;
  
  // Estado de minimização e tab ativa
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('skills');
  
  // ⚠️ TODOS os hooks devem vir ANTES de qualquer early return!
  
  // Calcular modificadores de atributo
  const getModifier = useCallback((score) => {
    return Math.floor((score - 10) / 2);
  }, []);
  
  // Bônus de proficiência baseado no nível
  const profBonus = useMemo(() => {
    return getProficiencyBonus(character?.level || 1);
  }, [character?.level]);
  
  // Perícias com proficiência (favoritas)
  const proficientSkills = useMemo(() => {
    if (!character?.skills || !SKILLS) return [];
    
    // SKILLS é um objeto, não array. Converter para array
    const skillsArray = Object.entries(SKILLS).map(([id, data]) => ({
      id,
      name: data.name,
      attribute: data.ability, // 'ability' no objeto original
    }));
    
    return skillsArray.filter(skill => {
      const charSkill = character.skills[skill.id];
      return charSkill?.proficient || charSkill?.expertise;
    }).map(skill => {
      const charSkill = character.skills[skill.id];
      const attrScore = character.attributes?.[skill.attribute] || 10;
      const attrMod = getModifier(attrScore);
      let bonus = attrMod;
      
      if (charSkill?.expertise) {
        bonus += profBonus * 2;
      } else if (charSkill?.proficient) {
        bonus += profBonus;
      }
      
      return {
        ...skill,
        bonus,
        isExpertise: charSkill?.expertise,
      };
    });
  }, [character?.skills, character?.attributes, profBonus, getModifier]);
  
  // Ataques configurados
  const attacks = useMemo(() => {
    if (!character?.attacks) return [];
    return character.attacks.map(atk => ({
      ...atk,
      displayBonus: atk.attackBonus >= 0 ? `+${atk.attackBonus}` : `${atk.attackBonus}`,
    }));
  }, [character?.attacks]);
  
  // Magias preparadas (por nível)
  const preparedSpells = useMemo(() => {
    if (!character?.spells) return [];
    
    const prepared = [];
    Object.entries(character.spells).forEach(([level, spells]) => {
      if (!spells) return;
      spells.forEach(spell => {
        if (spell.prepared || parseInt(level) === 0) { // Cantrips sempre disponíveis
          prepared.push({
            ...spell,
            level: parseInt(level),
          });
        }
      });
    });
    
    // Ordenar por nível, depois por nome
    return prepared.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });
  }, [character?.spells]);
  
  // Salvaguardas
  const savingThrows = useMemo(() => {
    const throws = [
      { id: 'str', name: 'FOR', fullName: 'Força', icon: '💪' },
      { id: 'dex', name: 'DES', fullName: 'Destreza', icon: '🏃' },
      { id: 'con', name: 'CON', fullName: 'Constituição', icon: '❤️' },
      { id: 'int', name: 'INT', fullName: 'Inteligência', icon: '🧠' },
      { id: 'wis', name: 'SAB', fullName: 'Sabedoria', icon: '👁️' },
      { id: 'cha', name: 'CAR', fullName: 'Carisma', icon: '✨' },
    ];
    
    return throws.map(st => {
      const attrScore = character?.attributes?.[st.id] || 10;
      const attrMod = getModifier(attrScore);
      const isProficient = character?.savingThrows?.[st.id];
      const bonus = isProficient ? attrMod + profBonus : attrMod;
      
      return {
        ...st,
        bonus,
        isProficient,
      };
    });
  }, [character?.attributes, character?.savingThrows, profBonus, getModifier]);
  
  // Handler para rolar perícia
  const handleSkillRoll = useCallback((skill) => {
    const sign = skill.bonus >= 0 ? '+' : '';
    const notation = `1d20${sign}${skill.bonus} ${skill.name}`;
    actions.rollDice(notation);
  }, [actions]);
  
  // Handler para rolar ataque
  const handleAttackRoll = useCallback((attack) => {
    const sign = attack.attackBonus >= 0 ? '+' : '';
    const notation = `1d20${sign}${attack.attackBonus} Ataque: ${attack.name}`;
    actions.rollDice(notation);
  }, [actions]);
  
  // Handler para rolar dano
  const handleDamageRoll = useCallback((attack) => {
    const notation = `${attack.damage} Dano: ${attack.name}`;
    actions.rollDice(notation);
  }, [actions]);
  
  // Handler para usar magia (apenas notifica no chat)
  const handleSpellCast = useCallback((spell) => {
    // Se for cantrip ou magia com rolagem de ataque/dano
    if (spell.damage) {
      const notation = `${spell.damage} ${spell.name}`;
      actions.rollDice(notation);
    } else {
      // Envia mensagem no chat sobre o uso da magia
      actions.sendMessage(`✨ *${character?.name || 'Personagem'}* conjura **${spell.name}**!`);
    }
  }, [actions, character?.name]);
  
  // Handler para rolar salvaguarda
  const handleSaveRoll = useCallback((save) => {
    const sign = save.bonus >= 0 ? '+' : '';
    const notation = `1d20${sign}${save.bonus} Salvaguarda de ${save.fullName}`;
    actions.rollDice(notation);
  }, [actions]);
  
  // Tabs disponíveis
  const tabs = [
    { id: 'skills', icon: '🎯', label: 'Perícias', count: proficientSkills.length },
    { id: 'attacks', icon: '⚔️', label: 'Ataques', count: attacks.length },
    { id: 'spells', icon: '✨', label: 'Magias', count: preparedSpells.length },
    { id: 'saves', icon: '🛡️', label: 'Saves', count: 6 },
  ];
  
  // Verificar se há conteúdo na tab ativa
  const hasContent = useMemo(() => {
    switch (activeTab) {
      case 'skills': return proficientSkills.length > 0;
      case 'attacks': return attacks.length > 0;
      case 'spells': return preparedSpells.length > 0;
      case 'saves': return true;
      default: return false;
    }
  }, [activeTab, proficientSkills, attacks, preparedSpells]);
  
  // ⚠️ Early return APÓS todos os hooks (regra do React)
  // Não renderizar se for DM ou não tiver personagem
  // DM também pode usar QuickActions para NPCs/players AFK
  if (!character) {
    return null;
  }
  
  if (isMinimized) {
    return (
      <div className="qa-minimized" onClick={() => setIsMinimized(false)}>
        <span className="qa-minimized-icon">🎮</span>
        <span className="qa-minimized-text">Ações Rápidas</span>
      </div>
    );
  }
  
  return (
    <div className="quick-actions">
      {/* Header */}
      <div className="qa-header">
        <div className="qa-header-left">
          <span className="qa-icon">🎮</span>
          <span className="qa-title">Ações Rápidas</span>
        </div>
        <button 
          className="qa-minimize-btn"
          onClick={() => setIsMinimized(true)}
          title="Minimizar"
        >
          ▼
        </button>
      </div>
      
      {/* Tabs */}
      <div className="qa-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`qa-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            <span className="qa-tab-icon">{tab.icon}</span>
            <span className="qa-tab-label">{tab.label}</span>
            {tab.count > 0 && (
              <span className="qa-tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
      
      {/* Content */}
      <div className="qa-content">
        {/* Perícias */}
        {activeTab === 'skills' && (
          <div className="qa-skills">
            {proficientSkills.length === 0 ? (
              <div className="qa-empty">
                <span>🎯</span>
                <p>Nenhuma perícia com proficiência</p>
                <small>Adicione proficiências na ficha de personagem</small>
              </div>
            ) : (
              <div className="qa-button-grid">
                {proficientSkills.map(skill => (
                  <button
                    key={skill.id}
                    className={`qa-action-btn skill ${skill.isExpertise ? 'expertise' : ''}`}
                    onClick={() => handleSkillRoll(skill)}
                    title={`${skill.name} (${skill.attribute.toUpperCase()}): ${skill.bonus >= 0 ? '+' : ''}${skill.bonus}`}
                  >
                    <span className="qa-btn-name">{skill.name}</span>
                    <span className="qa-btn-bonus">
                      {skill.bonus >= 0 ? '+' : ''}{skill.bonus}
                    </span>
                    {skill.isExpertise && <span className="qa-expertise-badge">★★</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Ataques */}
        {activeTab === 'attacks' && (
          <div className="qa-attacks">
            {attacks.length === 0 ? (
              <div className="qa-empty">
                <span>⚔️</span>
                <p>Nenhum ataque configurado</p>
                <small>Adicione ataques na aba Combate da ficha</small>
              </div>
            ) : (
              <div className="qa-attack-list">
                {attacks.map((attack, idx) => (
                  <div key={idx} className="qa-attack-item">
                    <div className="qa-attack-info">
                      <span className="qa-attack-name">{attack.name}</span>
                      <span className="qa-attack-damage">{attack.damage}</span>
                    </div>
                    <div className="qa-attack-buttons">
                      <button
                        className="qa-action-btn attack-roll"
                        onClick={() => handleAttackRoll(attack)}
                        title="Rolar Ataque"
                      >
                        🎯 {attack.displayBonus}
                      </button>
                      <button
                        className="qa-action-btn damage-roll"
                        onClick={() => handleDamageRoll(attack)}
                        title="Rolar Dano"
                      >
                        💥 {attack.damage}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Magias */}
        {activeTab === 'spells' && (
          <div className="qa-spells">
            {preparedSpells.length === 0 ? (
              <div className="qa-empty">
                <span>✨</span>
                <p>Nenhuma magia preparada</p>
                <small>Prepare magias na aba Magias da ficha</small>
              </div>
            ) : (
              <div className="qa-spell-list">
                {/* Cantrips */}
                {preparedSpells.filter(s => s.level === 0).length > 0 && (
                  <div className="qa-spell-group">
                    <div className="qa-spell-group-header">Truques</div>
                    <div className="qa-button-grid">
                      {preparedSpells.filter(s => s.level === 0).map((spell, idx) => (
                        <button
                          key={idx}
                          className="qa-action-btn spell cantrip"
                          onClick={() => handleSpellCast(spell)}
                          title={spell.description || spell.name}
                        >
                          <span className="qa-btn-name">{spell.name}</span>
                          {spell.damage && (
                            <span className="qa-btn-bonus">{spell.damage}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Magias por nível */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                  const levelSpells = preparedSpells.filter(s => s.level === level);
                  if (levelSpells.length === 0) return null;
                  
                  const slots = character.spellSlots?.[level];
                  const slotsRemaining = slots ? slots.total - (slots.used || 0) : 0;
                  
                  return (
                    <div key={level} className="qa-spell-group">
                      <div className="qa-spell-group-header">
                        <span>{level}º Nível</span>
                        {slots && (
                          <span className={`qa-slots ${slotsRemaining === 0 ? 'empty' : ''}`}>
                            {slotsRemaining}/{slots.total}
                          </span>
                        )}
                      </div>
                      <div className="qa-button-grid">
                        {levelSpells.map((spell, idx) => (
                          <button
                            key={idx}
                            className={`qa-action-btn spell level-${level} ${slotsRemaining === 0 ? 'no-slots' : ''}`}
                            onClick={() => handleSpellCast(spell)}
                            title={`${spell.name}${spell.description ? ': ' + spell.description : ''}`}
                            disabled={slotsRemaining === 0}
                          >
                            <span className="qa-btn-name">{spell.name}</span>
                            {spell.damage && (
                              <span className="qa-btn-bonus">{spell.damage}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {/* Salvaguardas */}
        {activeTab === 'saves' && (
          <div className="qa-saves">
            <div className="qa-saves-grid">
              {savingThrows.map(save => (
                <button
                  key={save.id}
                  className={`qa-action-btn save ${save.isProficient ? 'proficient' : ''}`}
                  onClick={() => handleSaveRoll(save)}
                  title={`Salvaguarda de ${save.fullName}: ${save.bonus >= 0 ? '+' : ''}${save.bonus}`}
                >
                  <span className="qa-save-icon">{save.icon}</span>
                  <span className="qa-save-name">{save.name}</span>
                  <span className="qa-save-bonus">
                    {save.bonus >= 0 ? '+' : ''}{save.bonus}
                  </span>
                  {save.isProficient && <span className="qa-proficient-dot">●</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
    </div>
  );
}
