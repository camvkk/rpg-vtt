import React, { useState, useEffect, useRef } from 'react';
import { 
  RACES, 
  CLASSES, 
  SKILLS, 
  BACKGROUNDS, 
  ALIGNMENTS,
  ABILITIES,
  POINT_BUY_COSTS,
  POINT_BUY_TOTAL,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  getModifier,
  rollAbilityScore,
  getProficiencyBonus,
  calculateLevel1HP,
  calculateAC
} from '../data/dnd5e.js';

const CharacterWizard = ({ 
  isOpen, 
  onClose, 
  onCreateCharacter,
  system = 'dnd5e',
  systemData = null 
}) => {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    // Step 1 - Identity
    name: '',
    tokenColor: '#3b82f6',
    imageUrl: null,
    
    // Step 2 - Race  
    race: null,
    raceData: null,
    
    // Step 3 - Class
    class: null,
    classData: null,
    
    // Step 4 - Attributes
    attributeMethod: 'pointBuy', // 'pointBuy' or 'rollDice'
    baseAttributes: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    rolledScores: null,
    pointsSpent: 0,
    
    // Step 5 - Skills
    selectedSkills: [],
    expertiseSkills: [], // For classes that get expertise
    
    // Step 6 - Equipment
    equipmentChoices: {},
    startingGold: false,
    
    // Step 7 - Details
    alignment: null,
    background: null,
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    notes: '',
    
    // Step 8 - Summary (calculated)
    finalCharacter: null
  });

  // File upload ref
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  // Steps configuration for D&D 5e
  const steps = system === 'dnd5e' ? [
    { id: 1, name: 'Identidade', icon: '👤' },
    { id: 2, name: 'Raça', icon: '🧝' },
    { id: 3, name: 'Classe', icon: '⚔️' },
    { id: 4, name: 'Atributos', icon: '⚡' },
    { id: 5, name: 'Perícias', icon: '🎯' },
    { id: 6, name: 'Equipamento', icon: '🎒' },
    { id: 7, name: 'Detalhes', icon: '📝' },
    { id: 8, name: 'Resumo', icon: '✅' }
  ] : [
    { id: 1, name: 'Nome', icon: '👤' },
    { id: 2, name: 'Atributos', icon: '⚡' },
    ...(systemData?.races ? [{ id: 3, name: 'Raça', icon: '🧝' }] : []),
    ...(systemData?.classes ? [{ id: 4, name: 'Classe', icon: '⚔️' }] : []),
    { id: 5, name: 'Notas', icon: '📝' },
    { id: 6, name: 'Resumo', icon: '✅' }
  ];

  // Update wizard data
  const updateWizardData = (updates) => {
    setWizardData(prev => ({ ...prev, ...updates }));
  };

  // Navigation functions
  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepNum) => {
    if (stepNum >= 1 && stepNum <= steps.length) {
      setCurrentStep(stepNum);
    }
  };

  // Validation functions
  const canProceed = () => {
    switch (currentStep) {
      case 1: return wizardData.name.trim().length > 0;
      case 2: return wizardData.race !== null;
      case 3: return wizardData.class !== null;
      case 4: return validateAttributes();
      case 5: return validateSkills();
      case 6: return validateEquipment();
      case 7: return wizardData.alignment !== null && wizardData.background !== null;
      case 8: return true;
      default: return true;
    }
  };

  const validateAttributes = () => {
    if (wizardData.attributeMethod === 'pointBuy') {
      return wizardData.pointsSpent <= POINT_BUY_TOTAL;
    }
    return wizardData.rolledScores !== null;
  };

  const validateSkills = () => {
    if (!wizardData.classData) return false;
    const required = wizardData.classData.skillsAvailable || 0;
    const backgroundSkills = wizardData.background ? 2 : 0;
    return wizardData.selectedSkills.length >= required + backgroundSkills;
  };

  const validateEquipment = () => {
    if (wizardData.startingGold) return true;
    if (!wizardData.classData) return false;
    
    const choices = wizardData.classData.startingEquipment;
    if (!choices) return true;
    
    return Object.keys(choices).every(choice => 
      wizardData.equipmentChoices[choice] !== undefined
    );
  };

  // Calculate final attributes with racial bonuses
  const getFinalAttributes = () => {
    const base = { ...wizardData.baseAttributes };
    const racial = wizardData.raceData?.statBonuses || {};
    
    const final = {};
    Object.keys(ABILITIES).forEach(ability => {
      final[ability] = (base[ability] || 8) + (racial[ability] || 0);
    });
    
    return final;
  };

  // Calculate point buy costs
  const calculatePointsSpent = () => {
    let total = 0;
    Object.keys(ABILITIES).forEach(ability => {
      const score = wizardData.baseAttributes[ability] || POINT_BUY_MIN;
      total += POINT_BUY_COSTS[score] || 0;
    });
    return total;
  };

  // Update points spent when attributes change
  useEffect(() => {
    if (wizardData.attributeMethod === 'pointBuy') {
      const spent = calculatePointsSpent();
      updateWizardData({ pointsSpent: spent });
    }
  }, [wizardData.baseAttributes, wizardData.attributeMethod]);

  // Handle avatar image upload
  const handleImageUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Arquivo muito grande. Máximo 2MB.');
      return;
    }

    setIsUploading(true);
    
    try {
      const h = window.location.hostname;
      const serverUrl = import.meta.env.VITE_SERVER_URL || 
        (h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin);
      
      const response = await fetch(`${serverUrl}/api/upload-token`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      
      const data = await response.json();
      if (data.success) {
        updateWizardData({ imageUrl: data.url });
      } else {
        alert('Erro no upload da imagem.');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Erro no upload da imagem.');
    } finally {
      setIsUploading(false);
    }
  };

  // Generate final character object
  const generateFinalCharacter = () => {
    const finalAttributes = getFinalAttributes();
    const finalModifiers = {};
    Object.keys(finalAttributes).forEach(ability => {
      finalModifiers[ability] = getModifier(finalAttributes[ability]);
    });

    const level = 1;
    const proficiencyBonus = getProficiencyBonus(level);
    
    // Calculate HP
    const conModifier = finalModifiers.con;
    const maxHP = calculateLevel1HP(wizardData.classData, conModifier);
    
    // Build skills object
    const skills = {};
    wizardData.selectedSkills.forEach(skillKey => {
      skills[skillKey] = { 
        proficient: true,
        expertise: wizardData.expertiseSkills.includes(skillKey)
      };
    });
    
    // Build saving throws
    const savingThrows = {};
    if (wizardData.classData.savingThrows) {
      wizardData.classData.savingThrows.forEach(save => {
        savingThrows[save] = { proficient: true };
      });
    }
    
    // Build equipment list
    const equipment = [];
    if (wizardData.startingGold) {
      equipment.push('Ouro Inicial: 4d4 × 10 po');
    } else {
      Object.entries(wizardData.equipmentChoices).forEach(([choiceKey, selectedOption]) => {
        const choiceOptions = wizardData.classData.startingEquipment[choiceKey];
        if (choiceOptions && choiceOptions[selectedOption]) {
          equipment.push(...choiceOptions[selectedOption]);
        }
      });
    }
    
    // Calculate AC (basic calculation)
    const dexModifier = finalModifiers.dex;
    const ac = calculateAC(equipment, dexModifier);

    return {
      id: `char_${Date.now()}`,
      name: wizardData.name,
      race: wizardData.race,
      raceData: wizardData.raceData,
      class: wizardData.class,
      classData: wizardData.classData,
      level,
      alignment: wizardData.alignment?.name || wizardData.alignment,
      background: wizardData.background?.name || wizardData.background,
      attributes: finalAttributes,
      hp: { current: maxHP, max: maxHP, temp: 0 },
      ac,
      speed: 30, // Default speed
      proficiencyBonus,
      skills,
      savingThrows,
      attacks: [], // Will be populated based on equipment/class
      equipment,
      features: wizardData.classData.level1Features || [],
      personality: wizardData.personality,
      ideals: wizardData.ideals,
      bonds: wizardData.bonds,
      flaws: wizardData.flaws,
      notes: wizardData.notes,
      tokenColor: wizardData.tokenColor,
      imageUrl: wizardData.imageUrl
    };
  };

  // Update final character when step 8 is reached
  useEffect(() => {
    if (currentStep === 8 && system === 'dnd5e') {
      const finalCharacter = generateFinalCharacter();
      updateWizardData({ finalCharacter });
    }
  }, [currentStep, wizardData.name, wizardData.race, wizardData.class, wizardData.baseAttributes]);

  // Handle create character
  const handleCreateCharacter = () => {
    const character = wizardData.finalCharacter || generateFinalCharacter();
    onCreateCharacter(character);
    onClose();
  };

  // Render progress bar
  const ProgressBar = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)',
      padding: 'var(--spacing-lg)',
      borderBottom: '1px solid var(--border-color)',
      background: 'var(--surface-light)'
    }}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <button
            onClick={() => goToStep(step.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-xs)',
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: step.id === currentStep ? 'var(--color-primary)' : 
                         step.id < currentStep ? 'var(--color-success)' : 'var(--surface-primary)',
              color: step.id === currentStep ? 'var(--bg-primary)' : 
                     step.id < currentStep ? 'white' : 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              transition: 'all var(--transition-fast)'
            }}
          >
            <span>{step.icon}</span>
            <span className="step-name">{step.name}</span>
            {step.id < currentStep && <span>✓</span>}
          </button>
          {index < steps.length - 1 && (
            <div style={{
              flex: 1,
              height: '2px',
              background: step.id < currentStep ? 'var(--color-success)' : 'var(--border-color)',
              borderRadius: '1px'
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // Step 1 - Identity
  const Step1Identity = () => (
    <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ 
          fontFamily: 'var(--font-fantasy)', 
          color: 'var(--color-primary)', 
          fontSize: '1.5rem',
          marginBottom: 'var(--spacing-sm)'
        }}>
          👤 Identidade do Personagem
        </h2>
        <p style={{ color: 'var(--text-dim)' }}>
          Defina o nome e aparência do seu personagem.
        </p>
      </div>

      {/* Character Name */}
      <div>
        <label style={{ 
          display: 'block', 
          fontWeight: '600', 
          marginBottom: 'var(--spacing-sm)',
          color: 'var(--text-primary)'
        }}>
          Nome do Personagem *
        </label>
        <input
          type="text"
          className="input"
          value={wizardData.name}
          onChange={(e) => updateWizardData({ name: e.target.value })}
          placeholder="Digite o nome do seu personagem..."
          style={{ fontSize: '1.1rem' }}
          autoFocus
        />
      </div>

      {/* Token Color */}
      <div>
        <label style={{ 
          display: 'block', 
          fontWeight: '600', 
          marginBottom: 'var(--spacing-sm)',
          color: 'var(--text-primary)'
        }}>
          Cor do Token
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <input
            type="color"
            value={wizardData.tokenColor}
            onChange={(e) => updateWizardData({ tokenColor: e.target.value })}
            style={{
              width: '60px',
              height: '60px',
              border: '2px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer'
            }}
          />
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: wizardData.tokenColor,
            border: '2px solid #ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '1.2rem',
            boxShadow: 'var(--shadow-md)'
          }}>
            {wizardData.name?.[0]?.toUpperCase() || '?'}
          </div>
        </div>
      </div>

      {/* Avatar Upload */}
      <div>
        <label style={{ 
          display: 'block', 
          fontWeight: '600', 
          marginBottom: 'var(--spacing-sm)',
          color: 'var(--text-primary)'
        }}>
          Avatar (Opcional)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? '⏳ Enviando...' : '📁 Escolher Imagem'}
          </button>
          {wizardData.imageUrl && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => updateWizardData({ imageUrl: null })}
              style={{ color: 'var(--color-accent)' }}
            >
              🗑️ Remover
            </button>
          )}
        </div>
        {wizardData.imageUrl && (
          <div style={{ marginTop: 'var(--spacing-sm)' }}>
            <img
              src={wizardData.imageUrl}
              alt="Avatar"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--border-color)'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  // Step 2 - Race (D&D 5e only)
  const Step2Race = () => (
    <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ 
          fontFamily: 'var(--font-fantasy)', 
          color: 'var(--color-primary)', 
          fontSize: '1.5rem',
          marginBottom: 'var(--spacing-sm)'
        }}>
          🧝 Escolha sua Raça
        </h2>
        <p style={{ color: 'var(--text-dim)' }}>
          Cada raça oferece bônus únicos de atributos e habilidades especiais.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--spacing-md)',
        maxHeight: '500px',
        overflowY: 'auto'
      }}>
        {RACES.map(race => (
          <div
            key={race.name}
            onClick={() => updateWizardData({ race: race.name, raceData: race })}
            style={{
              padding: 'var(--spacing-md)',
              background: wizardData.race === race.name ? 'var(--color-primary)' : 'var(--surface-light)',
              color: wizardData.race === race.name ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: `2px solid ${wizardData.race === race.name ? 'var(--color-primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)'
            }}>
              <span style={{ fontSize: '2rem' }}>{race.icon}</span>
              <h3 style={{ 
                margin: 0, 
                fontFamily: 'var(--font-fantasy)',
                fontSize: '1.2rem'
              }}>
                {race.name}
              </h3>
            </div>
            
            <p style={{
              fontSize: '0.9rem',
              marginBottom: 'var(--spacing-md)',
              opacity: 0.9,
              lineHeight: 1.4
            }}>
              {race.description}
            </p>

            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <strong>Bônus de Atributos:</strong>
              <div style={{ marginTop: 'var(--spacing-xs)' }}>
                {Object.entries(race.statBonuses).map(([stat, bonus]) => (
                  <span key={stat} style={{
                    display: 'inline-block',
                    background: wizardData.race === race.name ? 'rgba(255,255,255,0.2)' : 'var(--surface-primary)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    margin: '2px',
                    fontWeight: '600'
                  }}>
                    {ABILITIES[stat].short} +{bonus}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <strong>Traços Raciais:</strong>
              <ul style={{
                fontSize: '0.8rem',
                marginTop: 'var(--spacing-xs)',
                paddingLeft: 'var(--spacing-md)',
                opacity: 0.9
              }}>
                {race.traits.slice(0, 2).map((trait, idx) => (
                  <li key={idx} style={{ marginBottom: '2px' }}>{trait}</li>
                ))}
                {race.traits.length > 2 && (
                  <li style={{ fontStyle: 'italic' }}>
                    +{race.traits.length - 2} outros traços...
                  </li>
                )}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Step 3 - Class (D&D 5e only)
  const Step3Class = () => (
    <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ 
          fontFamily: 'var(--font-fantasy)', 
          color: 'var(--color-primary)', 
          fontSize: '1.5rem',
          marginBottom: 'var(--spacing-sm)'
        }}>
          ⚔️ Escolha sua Classe
        </h2>
        <p style={{ color: 'var(--text-dim)' }}>
          Sua classe determina suas habilidades, perícias e estilo de jogo.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--spacing-md)',
        maxHeight: '500px',
        overflowY: 'auto'
      }}>
        {CLASSES.map(cls => (
          <div
            key={cls.name}
            onClick={() => updateWizardData({ class: cls.name, classData: cls })}
            style={{
              padding: 'var(--spacing-md)',
              background: wizardData.class === cls.name ? 'var(--color-primary)' : 'var(--surface-light)',
              color: wizardData.class === cls.name ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: `2px solid ${wizardData.class === cls.name ? 'var(--color-primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)'
            }}>
              <span style={{ fontSize: '2rem' }}>{cls.icon}</span>
              <div>
                <h3 style={{ 
                  margin: 0, 
                  fontFamily: 'var(--font-fantasy)',
                  fontSize: '1.2rem'
                }}>
                  {cls.name}
                </h3>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  Dados de Vida: {cls.hitDie}
                </div>
              </div>
            </div>
            
            <p style={{
              fontSize: '0.9rem',
              marginBottom: 'var(--spacing-md)',
              opacity: 0.9,
              lineHeight: 1.4
            }}>
              {cls.description}
            </p>

            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <strong>Atributos Primários:</strong>
              <div style={{ fontSize: '0.8rem', marginTop: 'var(--spacing-xs)' }}>
                {cls.primaryStats.join(', ')}
              </div>
            </div>

            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <strong>Salvaguardas:</strong>
              <div>
                {cls.savingThrows.map(save => (
                  <span key={save} style={{
                    display: 'inline-block',
                    background: wizardData.class === cls.name ? 'rgba(255,255,255,0.2)' : 'var(--surface-primary)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    margin: '2px',
                    fontWeight: '600'
                  }}>
                    {ABILITIES[save].short}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <strong>Habilidades de 1º Nível:</strong>
              <ul style={{
                fontSize: '0.8rem',
                marginTop: 'var(--spacing-xs)',
                paddingLeft: 'var(--spacing-md)',
                opacity: 0.9
              }}>
                {cls.level1Features.slice(0, 2).map((feature, idx) => (
                  <li key={idx} style={{ marginBottom: '2px' }}>{feature}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Step 4 - Attributes
  const Step4Attributes = () => {
    const finalAttributes = getFinalAttributes();
    
    return (
      <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ 
            fontFamily: 'var(--font-fantasy)', 
            color: 'var(--color-primary)', 
            fontSize: '1.5rem',
            marginBottom: 'var(--spacing-sm)'
          }}>
            ⚡ Atributos
          </h2>
          <p style={{ color: 'var(--text-dim)' }}>
            Determine os valores dos atributos do seu personagem.
          </p>
        </div>

        {/* Method Selection */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', gap: 'var(--spacing-sm)' }}>
            <button
              className={`btn ${wizardData.attributeMethod === 'pointBuy' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => updateWizardData({ attributeMethod: 'pointBuy', rolledScores: null })}
            >
              📊 Point Buy
            </button>
            <button
              className={`btn ${wizardData.attributeMethod === 'rollDice' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => updateWizardData({ attributeMethod: 'rollDice' })}
            >
              🎲 Rolar Dados
            </button>
          </div>
        </div>

        {/* Point Buy Method */}
        {wizardData.attributeMethod === 'pointBuy' && (
          <div>
            <div style={{ 
              textAlign: 'center', 
              marginBottom: 'var(--spacing-md)',
              padding: 'var(--spacing-md)',
              background: 'var(--surface-light)',
              borderRadius: 'var(--radius-md)'
            }}>
              <strong>Pontos Restantes: {POINT_BUY_TOTAL - wizardData.pointsSpent}</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 'var(--spacing-xs)' }}>
                Comece com 8 em todos os atributos. Cada ponto custa conforme a tabela.
              </div>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--spacing-md)'
            }}>
              {Object.entries(ABILITIES).map(([abilityKey, ability]) => {
                const baseValue = wizardData.baseAttributes[abilityKey] || POINT_BUY_MIN;
                const racialBonus = wizardData.raceData?.statBonuses?.[abilityKey] || 0;
                const finalValue = baseValue + racialBonus;
                const modifier = getModifier(finalValue);

                return (
                  <div key={abilityKey} style={{
                    padding: 'var(--spacing-md)',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    textAlign: 'center'
                  }}>
                    <h4 style={{ 
                      margin: '0 0 var(--spacing-sm) 0',
                      fontFamily: 'var(--font-fantasy)'
                    }}>
                      {ability.name}
                    </h4>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)' }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          if (baseValue > POINT_BUY_MIN) {
                            updateWizardData({
                              baseAttributes: { ...wizardData.baseAttributes, [abilityKey]: baseValue - 1 }
                            });
                          }
                        }}
                        disabled={baseValue <= POINT_BUY_MIN}
                        style={{ width: '32px', height: '32px', padding: 0 }}
                      >
                        −
                      </button>
                      
                      <div style={{ minWidth: '60px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                          {baseValue}
                          {racialBonus > 0 && (
                            <span style={{ color: 'var(--color-success)', fontSize: '1rem' }}>
                              +{racialBonus}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '1.2rem', color: 'var(--color-primary)' }}>
                          {modifier >= 0 ? '+' : ''}{modifier}
                        </div>
                      </div>
                      
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          const newValue = baseValue + 1;
                          const newCost = POINT_BUY_COSTS[newValue] || 0;
                          const currentCost = POINT_BUY_COSTS[baseValue] || 0;
                          const additionalCost = newCost - currentCost;
                          
                          if (newValue <= POINT_BUY_MAX && wizardData.pointsSpent + additionalCost <= POINT_BUY_TOTAL) {
                            updateWizardData({
                              baseAttributes: { ...wizardData.baseAttributes, [abilityKey]: newValue }
                            });
                          }
                        }}
                        disabled={
                          baseValue >= POINT_BUY_MAX || 
                          wizardData.pointsSpent + ((POINT_BUY_COSTS[baseValue + 1] || 0) - (POINT_BUY_COSTS[baseValue] || 0)) > POINT_BUY_TOTAL
                        }
                        style={{ width: '32px', height: '32px', padding: 0 }}
                      >
                        +
                      </button>
                    </div>
                    
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 'var(--spacing-xs)' }}>
                      Custo: {POINT_BUY_COSTS[baseValue] || 0}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Roll Dice Method */}
        {wizardData.attributeMethod === 'rollDice' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 'var(--spacing-md)' }}>
              Role 4d6 e descarte o menor dado para cada atributo.
            </p>
            
            <button
              className="btn btn-primary"
              onClick={() => {
                const rolls = {};
                Object.keys(ABILITIES).forEach(ability => {
                  rolls[ability] = rollAbilityScore();
                });
                
                const newAttributes = {};
                Object.keys(ABILITIES).forEach(ability => {
                  newAttributes[ability] = rolls[ability].total;
                });
                
                updateWizardData({ 
                  rolledScores: rolls, 
                  baseAttributes: newAttributes 
                });
              }}
              style={{ marginBottom: 'var(--spacing-lg)' }}
            >
              🎲 Rolar Todos os Atributos
            </button>

            {wizardData.rolledScores && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--spacing-md)'
              }}>
                {Object.entries(ABILITIES).map(([abilityKey, ability]) => {
                  const roll = wizardData.rolledScores[abilityKey];
                  const racialBonus = wizardData.raceData?.statBonuses?.[abilityKey] || 0;
                  const finalValue = roll.total + racialBonus;
                  const modifier = getModifier(finalValue);

                  return (
                    <div key={abilityKey} style={{
                      padding: 'var(--spacing-md)',
                      background: 'var(--surface-light)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-lg)',
                      textAlign: 'center'
                    }}>
                      <h4 style={{ 
                        margin: '0 0 var(--spacing-sm) 0',
                        fontFamily: 'var(--font-fantasy)'
                      }}>
                        {ability.name}
                      </h4>
                      
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: 'var(--spacing-xs)' }}>
                        {roll.total}
                        {racialBonus > 0 && (
                          <span style={{ color: 'var(--color-success)', fontSize: '1rem' }}>
                            +{racialBonus}
                          </span>
                        )}
                      </div>
                      
                      <div style={{ fontSize: '1.2rem', color: 'var(--color-primary)', marginBottom: 'var(--spacing-xs)' }}>
                        {modifier >= 0 ? '+' : ''}{modifier}
                      </div>
                      
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        Dados: [{roll.rolls.join(', ')}]
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Step 5 - Skills
  const Step5Skills = () => {
    const classSkillsAvailable = wizardData.classData?.skillsAvailable || 0;
    const backgroundSkills = wizardData.background ? 2 : 0;
    const expertiseCount = wizardData.classData?.expertise || 0;
    
    const availableSkills = wizardData.classData?.classSkills || Object.keys(SKILLS);
    const selectedCount = wizardData.selectedSkills.length;
    const requiredCount = classSkillsAvailable + backgroundSkills;

    return (
      <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ 
            fontFamily: 'var(--font-fantasy)', 
            color: 'var(--color-primary)', 
            fontSize: '1.5rem',
            marginBottom: 'var(--spacing-sm)'
          }}>
            🎯 Perícias
          </h2>
          <p style={{ color: 'var(--text-dim)' }}>
            Escolha {requiredCount} perícias. Sua classe oferece {classSkillsAvailable} perícias
            {backgroundSkills > 0 && ` e seu antecedente oferece ${backgroundSkills} perícias adicionais`}.
          </p>
          <div style={{ 
            fontSize: '1.1rem', 
            fontWeight: '600', 
            marginTop: 'var(--spacing-sm)',
            color: selectedCount >= requiredCount ? 'var(--color-success)' : 'var(--color-primary)'
          }}>
            {selectedCount} de {requiredCount} selecionadas
          </div>
        </div>

        {/* Skills by Ability */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
          {Object.entries(ABILITIES).map(([abilityKey, ability]) => {
            const abilitySkills = Object.entries(SKILLS).filter(([, skill]) => skill.ability === abilityKey);
            if (abilitySkills.length === 0) return null;

            const finalAttributes = getFinalAttributes();
            const modifier = getModifier(finalAttributes[abilityKey]);

            return (
              <div key={abilityKey}>
                <h3 style={{ 
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '1.2rem',
                  marginBottom: 'var(--spacing-md)'
                }}>
                  {ability.name} ({modifier >= 0 ? '+' : ''}{modifier})
                </h3>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: 'var(--spacing-sm)'
                }}>
                  {abilitySkills.map(([skillKey, skill]) => {
                    const isSelected = wizardData.selectedSkills.includes(skillKey);
                    const hasExpertise = wizardData.expertiseSkills.includes(skillKey);
                    const isClassSkill = wizardData.classData?.classSkills?.includes(skillKey) || false;
                    const proficiencyBonus = getProficiencyBonus(1);
                    const totalBonus = modifier + (isSelected ? proficiencyBonus : 0) + (hasExpertise ? proficiencyBonus : 0);

                    return (
                      <div
                        key={skillKey}
                        onClick={() => {
                          if (isSelected) {
                            // Unselect skill
                            updateWizardData({
                              selectedSkills: wizardData.selectedSkills.filter(s => s !== skillKey),
                              expertiseSkills: wizardData.expertiseSkills.filter(s => s !== skillKey)
                            });
                          } else if (selectedCount < requiredCount) {
                            // Select skill
                            updateWizardData({
                              selectedSkills: [...wizardData.selectedSkills, skillKey]
                            });
                          }
                        }}
                        style={{
                          padding: 'var(--spacing-md)',
                          background: isSelected ? 'var(--color-primary)' : 'var(--surface-light)',
                          color: isSelected ? 'var(--bg-primary)' : 'var(--text-primary)',
                          border: `2px solid ${isSelected ? 'var(--color-primary)' : (isClassSkill ? 'var(--color-secondary)' : 'var(--border-color)')}`,
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          opacity: (!isSelected && selectedCount >= requiredCount) ? 0.6 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                              {skill.name}
                              {isClassSkill && (
                                <span style={{
                                  fontSize: '0.7rem',
                                  background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--color-secondary)',
                                  color: isSelected ? 'currentColor' : 'white',
                                  padding: '2px 4px',
                                  borderRadius: 'var(--radius-sm)',
                                  marginLeft: 'var(--spacing-xs)'
                                }}>
                                  CLASSE
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>
                              {skill.description}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', minWidth: '40px' }}>
                            <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                              {totalBonus >= 0 ? '+' : ''}{totalBonus}
                            </div>
                            {expertiseCount > 0 && isSelected && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hasExpertise) {
                                    updateWizardData({
                                      expertiseSkills: wizardData.expertiseSkills.filter(s => s !== skillKey)
                                    });
                                  } else if (wizardData.expertiseSkills.length < expertiseCount) {
                                    updateWizardData({
                                      expertiseSkills: [...wizardData.expertiseSkills, skillKey]
                                    });
                                  }
                                }}
                                style={{
                                  fontSize: '0.7rem',
                                  background: hasExpertise ? 'var(--color-success)' : 'transparent',
                                  color: hasExpertise ? 'white' : 'currentColor',
                                  border: hasExpertise ? 'none' : '1px solid currentColor',
                                  padding: '2px 6px',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  marginTop: '4px'
                                }}
                              >
                                {hasExpertise ? '✓ EXP' : 'EXP'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {expertiseCount > 0 && (
          <div style={{
            padding: 'var(--spacing-md)',
            background: 'var(--surface-light)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-success)'
          }}>
            <strong>Expertise Disponível:</strong> Sua classe permite dobrar o bônus de proficiência em {expertiseCount} perícia(s). 
            Clique em "EXP" nas perícias selecionadas para aplicar expertise.
            ({wizardData.expertiseSkills.length}/{expertiseCount} aplicadas)
          </div>
        )}
      </div>
    );
  };

  // Step 6 - Equipment
  const Step6Equipment = () => {
    const equipment = wizardData.classData?.startingEquipment || {};

    return (
      <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ 
            fontFamily: 'var(--font-fantasy)', 
            color: 'var(--color-primary)', 
            fontSize: '1.5rem',
            marginBottom: 'var(--spacing-sm)'
          }}>
            🎒 Equipamento Inicial
          </h2>
          <p style={{ color: 'var(--text-dim)' }}>
            Escolha seu equipamento inicial ou opte por ouro para comprar seus próprios itens.
          </p>
        </div>

        {/* Starting Gold Option */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            padding: 'var(--spacing-md)',
            background: 'var(--surface-light)',
            borderRadius: 'var(--radius-md)',
            border: `2px solid ${wizardData.startingGold ? 'var(--color-primary)' : 'var(--border-color)'}`
          }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={wizardData.startingGold}
                onChange={(e) => updateWizardData({ 
                  startingGold: e.target.checked, 
                  equipmentChoices: {} 
                })}
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <strong>💰 Começar com Ouro Inicial (4d4 × 10 po)</strong>
            </label>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: 'var(--spacing-xs)' }}>
              Você receberá ouro para comprar seus próprios equipamentos em vez dos pacotes padrão.
            </div>
          </div>
        </div>

        {!wizardData.startingGold && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
            {Object.entries(equipment).map(([choiceKey, options]) => (
              <div key={choiceKey}>
                <h3 style={{
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  marginBottom: 'var(--spacing-md)'
                }}>
                  Escolha {choiceKey.replace('choice', '').toUpperCase()}:
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  {Object.entries(options).map(([optionKey, items]) => (
                    <label
                      key={optionKey}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--spacing-sm)',
                        padding: 'var(--spacing-md)',
                        background: wizardData.equipmentChoices[choiceKey] === optionKey ? 'var(--color-primary)' : 'var(--surface-light)',
                        color: wizardData.equipmentChoices[choiceKey] === optionKey ? 'var(--bg-primary)' : 'var(--text-primary)',
                        border: `2px solid ${wizardData.equipmentChoices[choiceKey] === optionKey ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      <input
                        type="radio"
                        name={choiceKey}
                        checked={wizardData.equipmentChoices[choiceKey] === optionKey}
                        onChange={() => updateWizardData({
                          equipmentChoices: { ...wizardData.equipmentChoices, [choiceKey]: optionKey }
                        })}
                        style={{ accentColor: 'var(--color-primary)', marginTop: '2px' }}
                      />
                      <div>
                        <strong>Opção {optionKey.replace('choice', '').toUpperCase()}:</strong>
                        <ul style={{ marginTop: 'var(--spacing-xs)', paddingLeft: 'var(--spacing-md)' }}>
                          {items.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '2px' }}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Step 7 - Details
  const Step7Details = () => (
    <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ 
          fontFamily: 'var(--font-fantasy)', 
          color: 'var(--color-primary)', 
          fontSize: '1.5rem',
          marginBottom: 'var(--spacing-sm)'
        }}>
          📝 Detalhes do Personagem
        </h2>
        <p style={{ color: 'var(--text-dim)' }}>
          Complete a personalidade e história do seu personagem.
        </p>
      </div>

      {/* Alignment */}
      <div>
        <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
          Alinhamento *
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--spacing-sm)',
          maxWidth: '600px'
        }}>
          {ALIGNMENTS.map(alignment => (
            <button
              key={alignment.short}
              onClick={() => updateWizardData({ alignment })}
              style={{
                padding: 'var(--spacing-md)',
                background: wizardData.alignment?.short === alignment.short ? 'var(--color-primary)' : 'var(--surface-light)',
                color: wizardData.alignment?.short === alignment.short ? 'var(--bg-primary)' : 'var(--text-primary)',
                border: `2px solid ${wizardData.alignment?.short === alignment.short ? 'var(--color-primary)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                textAlign: 'center'
              }}
            >
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{alignment.short}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.9 }}>{alignment.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Background */}
      <div>
        <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
          Antecedente *
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--spacing-sm)',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          {BACKGROUNDS.map(background => (
            <div
              key={background.name}
              onClick={() => {
                // Auto-add background skills
                const backgroundSkills = background.skillProficiencies;
                const newSelectedSkills = [...new Set([...wizardData.selectedSkills, ...backgroundSkills])];
                updateWizardData({ 
                  background,
                  selectedSkills: newSelectedSkills
                });
              }}
              style={{
                padding: 'var(--spacing-md)',
                background: wizardData.background?.name === background.name ? 'var(--color-primary)' : 'var(--surface-light)',
                color: wizardData.background?.name === background.name ? 'var(--bg-primary)' : 'var(--text-primary)',
                border: `2px solid ${wizardData.background?.name === background.name ? 'var(--color-primary)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <h4 style={{ margin: '0 0 var(--spacing-sm) 0', fontFamily: 'var(--font-fantasy)' }}>
                {background.name}
              </h4>
              <p style={{ fontSize: '0.9rem', marginBottom: 'var(--spacing-sm)', opacity: 0.9, lineHeight: 1.4 }}>
                {background.description}
              </p>
              <div style={{ fontSize: '0.8rem' }}>
                <strong>Perícias:</strong> {background.skillProficiencies.map(skill => SKILLS[skill]?.name || skill).join(', ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Personality Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        <div>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: 'var(--spacing-sm)' }}>
            Traços de Personalidade
          </label>
          <textarea
            value={wizardData.personality}
            onChange={(e) => updateWizardData({ personality: e.target.value })}
            placeholder="Como seu personagem age e se comporta..."
            style={{
              width: '100%',
              minHeight: '80px',
              padding: 'var(--spacing-sm)',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              resize: 'vertical'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: 'var(--spacing-sm)' }}>
            Ideais
          </label>
          <textarea
            value={wizardData.ideals}
            onChange={(e) => updateWizardData({ ideals: e.target.value })}
            placeholder="Princípios que motivam seu personagem..."
            style={{
              width: '100%',
              minHeight: '80px',
              padding: 'var(--spacing-sm)',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              resize: 'vertical'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: 'var(--spacing-sm)' }}>
            Vínculos
          </label>
          <textarea
            value={wizardData.bonds}
            onChange={(e) => updateWizardData({ bonds: e.target.value })}
            placeholder="Pessoas, lugares ou coisas importantes..."
            style={{
              width: '100%',
              minHeight: '80px',
              padding: 'var(--spacing-sm)',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              resize: 'vertical'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: 'var(--spacing-sm)' }}>
            Defeitos
          </label>
          <textarea
            value={wizardData.flaws}
            onChange={(e) => updateWizardData({ flaws: e.target.value })}
            placeholder="Fraquezas ou vícios do seu personagem..."
            style={{
              width: '100%',
              minHeight: '80px',
              padding: 'var(--spacing-sm)',
              background: 'var(--surface-light)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              resize: 'vertical'
            }}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: 'var(--spacing-sm)' }}>
          História e Notas Adicionais
        </label>
        <textarea
          value={wizardData.notes}
          onChange={(e) => updateWizardData({ notes: e.target.value })}
          placeholder="História de fundo, objetivos, ou outras notas sobre seu personagem..."
          style={{
            width: '100%',
            minHeight: '120px',
            padding: 'var(--spacing-md)',
            background: 'var(--surface-light)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            resize: 'vertical',
            fontSize: '0.95rem',
            lineHeight: 1.5
          }}
        />
      </div>
    </div>
  );

  // Step 8 - Summary
  const Step8Summary = () => {
    const character = wizardData.finalCharacter;
    if (!character) return <div>Carregando...</div>;

    const finalAttributes = character.attributes;
    const modifiers = {};
    Object.keys(finalAttributes).forEach(ability => {
      modifiers[ability] = getModifier(finalAttributes[ability]);
    });

    return (
      <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ 
            fontFamily: 'var(--font-fantasy)', 
            color: 'var(--color-primary)', 
            fontSize: '1.5rem',
            marginBottom: 'var(--spacing-sm)'
          }}>
            ✅ Resumo do Personagem
          </h2>
          <p style={{ color: 'var(--text-dim)' }}>
            Revise os detalhes do seu personagem antes de criá-lo.
          </p>
        </div>

        <div style={{
          padding: 'var(--spacing-lg)',
          background: 'var(--surface-light)',
          border: '2px solid var(--color-primary)',
          borderRadius: 'var(--radius-lg)'
        }}>
          {/* Character Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-lg)',
            paddingBottom: 'var(--spacing-md)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            {character.imageUrl ? (
              <img
                src={character.imageUrl}
                alt={character.name}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid var(--color-primary)'
                }}
              />
            ) : (
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: character.tokenColor,
                border: '3px solid var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '2rem'
              }}>
                {character.name?.[0]?.toUpperCase()}
              </div>
            )}
            
            <div>
              <h1 style={{
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '2rem',
                margin: 0
              }}>
                {character.name}
              </h1>
              <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: 'var(--spacing-xs)' }}>
                {character.race} {character.class}, Nível {character.level}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                {character.alignment} • {character.background}
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-success)' }}>
                {character.hp.max}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Pontos de Vida</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-secondary)' }}>
                {character.ac}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Classe de Armadura</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-primary)' }}>
                +{character.proficiencyBonus}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Bônus de Proficiência</div>
            </div>
          </div>

          {/* Attributes */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
              Atributos
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 'var(--spacing-sm)'
            }}>
              {Object.entries(ABILITIES).map(([abilityKey, ability]) => (
                <div
                  key={abilityKey}
                  style={{
                    padding: 'var(--spacing-sm)',
                    background: 'var(--surface-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '2px' }}>
                    {ability.short}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '700' }}>
                    {finalAttributes[abilityKey]}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>
                    {modifiers[abilityKey] >= 0 ? '+' : ''}{modifiers[abilityKey]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Skills */}
          {Object.keys(character.skills).length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
                Perícias Proficientes
              </h3>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--spacing-xs)'
              }}>
                {Object.entries(character.skills).map(([skillKey, skillData]) => (
                  <span
                    key={skillKey}
                    style={{
                      padding: '4px 8px',
                      background: skillData.expertise ? 'var(--color-success)' : 'var(--color-secondary)',
                      color: 'white',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontWeight: '600'
                    }}
                  >
                    {SKILLS[skillKey]?.name || skillKey}
                    {skillData.expertise && ' ★'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Equipment */}
          {character.equipment.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
                Equipamentos
              </h3>
              <ul style={{
                columns: '2',
                columnGap: 'var(--spacing-lg)',
                fontSize: '0.9rem',
                lineHeight: 1.6
              }}>
                {character.equipment.map((item, idx) => (
                  <li key={idx} style={{ breakInside: 'avoid', marginBottom: '4px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Features */}
          {character.features.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
                Habilidades de Classe
              </h3>
              <ul style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                {character.features.map((feature, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Personality */}
          {(character.personality || character.ideals || character.bonds || character.flaws) && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-fantasy)', color: 'var(--color-primary)', marginBottom: 'var(--spacing-md)' }}>
                Personalidade
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)' }}>
                {character.personality && (
                  <div>
                    <strong>Traços:</strong>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      {character.personality}
                    </div>
                  </div>
                )}
                {character.ideals && (
                  <div>
                    <strong>Ideais:</strong>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      {character.ideals}
                    </div>
                  </div>
                )}
                {character.bonds && (
                  <div>
                    <strong>Vínculos:</strong>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      {character.bonds}
                    </div>
                  </div>
                )}
                {character.flaws && (
                  <div>
                    <strong>Defeitos:</strong>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      {character.flaws}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="gb-charsheet-overlay">
      <div style={{
        width: '90vw',
        maxWidth: '800px',
        maxHeight: '90vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacing-lg)',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--surface-light)'
        }}>
          <h1 style={{
            fontFamily: 'var(--font-fantasy)',
            color: 'var(--color-primary)',
            fontSize: '1.8rem',
            margin: 0
          }}>
            🧙 Criar Personagem
          </h1>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '1.5rem',
              padding: 'var(--spacing-sm)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Progress Bar */}
        <ProgressBar />

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {currentStep === 1 && <Step1Identity />}
          {currentStep === 2 && system === 'dnd5e' && <Step2Race />}
          {currentStep === 3 && system === 'dnd5e' && <Step3Class />}
          {currentStep === 4 && system === 'dnd5e' && <Step4Attributes />}
          {currentStep === 5 && system === 'dnd5e' && <Step5Skills />}
          {currentStep === 6 && system === 'dnd5e' && <Step6Equipment />}
          {currentStep === 7 && system === 'dnd5e' && <Step7Details />}
          {currentStep === 8 && system === 'dnd5e' && <Step8Summary />}
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacing-lg)',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--surface-light)'
        }}>
          <button
            className="btn btn-ghost"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            ← Voltar
          </button>
          
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            Passo {currentStep} de {steps.length}
          </span>

          {currentStep < steps.length ? (
            <button
              className="btn btn-primary"
              onClick={nextStep}
              disabled={!canProceed()}
            >
              Próximo →
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={handleCreateCharacter}
              disabled={!canProceed()}
            >
              ✅ Criar Personagem
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CharacterWizard;