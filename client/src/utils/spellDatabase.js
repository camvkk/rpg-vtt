/**
 * Spell Database for AoE Quick Cast
 * Common D&D 5e spells with their AoE configurations
 */

export const SPELL_DATABASE = {
  // Damage Spells
  'fireball': {
    shape: 'circle',
    radius: 20,
    color: 'damage',
    description: 'Bola de Fogo - 20ft de raio'
  },
  'lightning bolt': {
    shape: 'line',
    length: 100,
    width: 5,
    color: 'damage',
    description: 'Raio - 100ft linha, 5ft largura'
  },
  'cone of cold': {
    shape: 'cone',
    length: 60,
    angle: 60,
    color: 'damage',
    description: 'Cone de Gelo - 60ft cone'
  },
  'burning hands': {
    shape: 'cone',
    length: 15,
    angle: 90,
    color: 'damage',
    description: 'Mãos Flamejantes - 15ft cone'
  },
  'thunderwave': {
    shape: 'square',
    length: 15,
    color: 'damage',
    description: 'Onda Trovejante - cubo de 15ft'
  },
  'shatter': {
    shape: 'circle',
    radius: 10,
    color: 'damage',
    description: 'Despedaçar - 10ft de raio'
  },
  'ice storm': {
    shape: 'circle',
    radius: 20,
    color: 'damage',
    description: 'Tempestade de Gelo - cilindro 20ft raio'
  },
  'meteor swarm': {
    shape: 'circle',
    radius: 40,
    color: 'damage',
    description: 'Enxame de Meteoros - 40ft de raio'
  },

  // Healing/Support Spells
  'mass cure wounds': {
    shape: 'circle',
    radius: 30,
    color: 'healing',
    description: 'Curar Ferimentos em Massa - 30ft de raio'
  },
  'healing spirit': {
    shape: 'square',
    length: 5,
    color: 'healing',
    description: 'Espírito Curador - cubo de 5ft'
  },
  'prayer of healing': {
    shape: 'circle',
    radius: 30,
    color: 'healing',
    description: 'Oração de Cura - 30ft de raio'
  },

  // Buff Spells
  'bless': {
    shape: 'circle',
    radius: 30,
    color: 'buff',
    description: 'Bênção - até 3 criaturas'
  },
  'heroes feast': {
    shape: 'circle',
    radius: 30,
    color: 'buff',
    description: 'Banquete dos Heróis - 30ft de raio'
  },
  'crusaders mantle': {
    shape: 'circle',
    radius: 30,
    color: 'buff',
    description: 'Manto do Cruzado - 30ft de raio'
  },

  // Debuff/Control Spells
  'hypnotic pattern': {
    shape: 'square',
    length: 30,
    color: 'debuff',
    description: 'Padrão Hipnótico - cubo de 30ft'
  },
  'fear': {
    shape: 'cone',
    length: 30,
    angle: 60,
    color: 'debuff',
    description: 'Medo - cone de 30ft'
  },
  'slow': {
    shape: 'circle',
    radius: 40,
    color: 'debuff',
    description: 'Lentidão - 40ft de raio'
  },
  'entangle': {
    shape: 'square',
    length: 20,
    color: 'debuff',
    description: 'Enredar - quadrado de 20ft'
  },
  'web': {
    shape: 'square',
    length: 20,
    color: 'debuff',
    description: 'Teia - cubo de 20ft'
  },
  'silence': {
    shape: 'circle',
    radius: 20,
    color: 'debuff',
    description: 'Silêncio - 20ft de raio'
  },

  // Utility Spells
  'darkness': {
    shape: 'circle',
    radius: 15,
    color: 'utility',
    description: 'Escuridão - 15ft de raio'
  },
  'daylight': {
    shape: 'circle',
    radius: 60,
    color: 'utility',
    description: 'Luz do Dia - 60ft de raio'
  },
  'fog cloud': {
    shape: 'circle',
    radius: 20,
    color: 'utility',
    description: 'Nuvem de Névoa - 20ft de raio'
  },
  'stinking cloud': {
    shape: 'circle',
    radius: 20,
    color: 'utility',
    description: 'Nuvem Fétida - 20ft de raio'
  },
  'wall of fire': {
    shape: 'line',
    length: 60,
    width: 5,
    color: 'damage',
    description: 'Muralha de Fogo - linha de 60ft'
  },
  'wall of ice': {
    shape: 'line',
    length: 60,
    width: 5,
    color: 'utility',
    description: 'Muralha de Gelo - linha de 60ft'
  },
  'spiritual guardians': {
    shape: 'circle',
    radius: 15,
    color: 'damage',
    description: 'Guardiões Espirituais - 15ft de raio'
  }
};

/**
 * Search for a spell by name (case-insensitive, partial matches)
 * @param {string} spellName 
 * @returns {object|null} Spell configuration or null
 */
export function findSpellByName(spellName) {
  if (!spellName || typeof spellName !== 'string') return null;
  
  const searchTerm = spellName.toLowerCase().trim();
  
  // Exact match first
  if (SPELL_DATABASE[searchTerm]) {
    return { name: searchTerm, ...SPELL_DATABASE[searchTerm] };
  }
  
  // Partial match
  for (const [name, config] of Object.entries(SPELL_DATABASE)) {
    if (name.includes(searchTerm) || searchTerm.includes(name)) {
      return { name, ...config };
    }
  }
  
  return null;
}

/**
 * Get all spells of a specific type
 * @param {string} colorType - 'damage', 'healing', 'buff', 'debuff', 'utility'
 * @returns {Array} Array of spell configurations
 */
export function getSpellsByType(colorType) {
  return Object.entries(SPELL_DATABASE)
    .filter(([_, config]) => config.color === colorType)
    .map(([name, config]) => ({ name, ...config }));
}

/**
 * Get all spell names for autocomplete
 * @returns {Array<string>} Array of spell names
 */
export function getAllSpellNames() {
  return Object.keys(SPELL_DATABASE);
}

/**
 * Convert feet to grid squares (for display)
 * @param {number} feet 
 * @returns {number} Grid squares
 */
export function feetToSquares(feet) {
  return Math.floor(feet / 5);
}

export default {
  SPELL_DATABASE,
  findSpellByName,
  getSpellsByType,
  getAllSpellNames,
  feetToSquares
};