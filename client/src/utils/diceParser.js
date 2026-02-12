// Dice Parser - Handles D&D dice notation parsing and rolling
// Supports: XdY+Z, XdYkh/klN (keep highest/lowest), advantage/disadvantage

/**
 * Parse dice notation string and return structured data
 * @param {string} input - Dice notation like "2d20+5" or "4d6kh3"
 * @returns {Object} - Parsed dice data
 */
export function parseDiceNotation(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Clean input
  const cleanInput = input.trim().toLowerCase().replace(/\s+/g, '');
  
  // Handle advantage/disadvantage shortcuts
  if (cleanInput === 'adv' || cleanInput === 'advantage') {
    return {
      count: 2,
      sides: 20,
      modifier: 0,
      keepHighest: 1,
      advantage: true,
      formula: '2d20kh1 (Advantage)'
    };
  }
  
  if (cleanInput === 'dis' || cleanInput === 'disadvantage') {
    return {
      count: 2,
      sides: 20,
      modifier: 0,
      keepLowest: 1,
      disadvantage: true,
      formula: '2d20kl1 (Disadvantage)'
    };
  }

  // Main regex pattern for dice notation
  const diceRegex = /^(\d+)?d(\d+)(?:(kh|kl|dl)(\d+))?([+\-]\d+)?$/;
  const match = cleanInput.match(diceRegex);
  
  if (!match) {
    return null;
  }

  const [, countStr, sidesStr, keepType, keepCountStr, modifierStr] = match;
  
  const count = parseInt(countStr) || 1;
  const sides = parseInt(sidesStr);
  const keepCount = keepCountStr ? parseInt(keepCountStr) : null;
  const modifier = modifierStr ? parseInt(modifierStr) : 0;
  
  // Validate values
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
    return null;
  }
  
  if (keepCount && (keepCount < 1 || keepCount > count)) {
    return null;
  }

  const result = {
    count,
    sides,
    modifier,
    formula: input
  };

  // Handle keep mechanics
  if (keepType === 'kh') {
    result.keepHighest = keepCount;
  } else if (keepType === 'kl') {
    result.keepLowest = keepCount;
  } else if (keepType === 'dl') {
    result.dropLowest = keepCount;
    result.keepHighest = count - keepCount;
  }

  return result;
}

/**
 * Roll dice based on parsed notation
 * @param {Object} diceData - Output from parseDiceNotation
 * @returns {Object} - Roll results with breakdown
 */
export function rollDice(diceData) {
  if (!diceData) {
    return null;
  }

  const { count, sides, modifier = 0 } = diceData;
  const rolls = [];
  
  // Generate initial rolls
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  let keptRolls = [...rolls];
  let droppedRolls = [];

  // Handle keep/drop mechanics
  if (diceData.keepHighest && diceData.keepHighest < count) {
    const sorted = [...rolls].sort((a, b) => b - a);
    keptRolls = sorted.slice(0, diceData.keepHighest);
    droppedRolls = sorted.slice(diceData.keepHighest);
  } else if (diceData.keepLowest && diceData.keepLowest < count) {
    const sorted = [...rolls].sort((a, b) => a - b);
    keptRolls = sorted.slice(0, diceData.keepLowest);
    droppedRolls = sorted.slice(diceData.keepLowest);
  }

  const rollSum = keptRolls.reduce((sum, roll) => sum + roll, 0);
  const total = rollSum + modifier;

  const result = {
    rolls,
    keptRolls,
    droppedRolls,
    rollSum,
    modifier,
    total,
    formula: diceData.formula,
    sides: diceData.sides,
    advantage: diceData.advantage,
    disadvantage: diceData.disadvantage
  };

  return result;
}

/**
 * Format dice result for display
 * @param {Object} result - Output from rollDice
 * @returns {string} - Formatted string
 */
export function formatDiceResult(result) {
  if (!result) return '';

  const { rolls, keptRolls, droppedRolls, rollSum, modifier, total, formula } = result;
  
  let output = `**${formula}**: `;
  
  // Show individual rolls
  if (droppedRolls.length > 0) {
    const keptDisplay = keptRolls.map(r => `**${r}**`).join(' + ');
    const droppedDisplay = droppedRolls.map(r => `~~${r}~~`).join(' + ');
    output += `[${keptDisplay}, ${droppedDisplay}]`;
  } else {
    output += `[${rolls.join(' + ')}]`;
  }
  
  // Add modifier if present
  if (modifier !== 0) {
    output += ` ${modifier >= 0 ? '+' : ''}${modifier}`;
  }
  
  output += ` = **${total}**`;
  
  return output;
}

/**
 * Get dice color based on type and roll result
 * @param {number} sides - Number of sides on the dice
 * @param {number} roll - The rolled value
 * @returns {string} - CSS color class
 */
export function getDiceColor(sides, roll) {
  // Critical results
  if (roll === sides) return 'dice-crit-success';
  if (roll === 1) return 'dice-crit-fail';
  
  // By dice type
  switch (sides) {
    case 4: return 'dice-d4';
    case 6: return 'dice-d6';
    case 8: return 'dice-d8';
    case 10: return 'dice-d10';
    case 12: return 'dice-d12';
    case 20: return 'dice-d20';
    case 100: return 'dice-d100';
    default: return 'dice-default';
  }
}

/**
 * Get dice type from context (for coloring)
 * @param {string} input - Original dice input
 * @returns {string} - Type identifier
 */
export function getDiceType(input) {
  const lower = input.toLowerCase();
  
  if (lower.includes('attack') || lower.includes('hit')) return 'attack';
  if (lower.includes('damage') || lower.includes('dmg')) return 'damage';
  if (lower.includes('save') || lower.includes('saving')) return 'save';
  if (lower.includes('skill') || lower.includes('check')) return 'skill';
  
  return 'default';
}

/**
 * Validate dice notation
 * @param {string} input - Dice notation string
 * @returns {boolean} - Whether the notation is valid
 */
export function isValidDiceNotation(input) {
  return parseDiceNotation(input) !== null;
}

/**
 * Get quick dice presets
 * @returns {Array} - Array of preset dice configurations
 */
export function getDicePresets() {
  return [
    { label: 'd4', notation: '1d4', color: 'dice-d4' },
    { label: 'd6', notation: '1d6', color: 'dice-d6' },
    { label: 'd8', notation: '1d8', color: 'dice-d8' },
    { label: 'd10', notation: '1d10', color: 'dice-d10' },
    { label: 'd12', notation: '1d12', color: 'dice-d12' },
    { label: 'd20', notation: '1d20', color: 'dice-d20' },
    { label: 'd%', notation: '1d100', color: 'dice-d100' },
    { label: 'Adv', notation: 'advantage', color: 'dice-d20' },
    { label: 'Dis', notation: 'disadvantage', color: 'dice-d20' }
  ];
}

/**
 * Generate a detailed breakdown of a dice roll
 * @param {Object} result - Roll result from rollDice
 * @returns {Object} - Detailed breakdown for UI display
 */
export function getDiceBreakdown(result) {
  if (!result) return null;

  // Track which rolls are dropped by position (handles duplicate values)
  const droppedCounts = {};
  result.droppedRolls.forEach(r => { droppedCounts[r] = (droppedCounts[r] || 0) + 1; });
  const usedDropped = {};

  const breakdown = {
    formula: result.formula,
    individual: result.rolls.map((roll, index) => {
      const isDropped = (usedDropped[roll] || 0) < (droppedCounts[roll] || 0);
      if (isDropped) usedDropped[roll] = (usedDropped[roll] || 0) + 1;
      return {
        roll,
        kept: !isDropped,
        dropped: isDropped,
        index,
        color: getDiceColor(result.sides, roll)
      };
    }),
    subtotal: result.rollSum,
    modifier: result.modifier,
    total: result.total,
    type: getDiceType(result.formula),
    advantage: result.advantage,
    disadvantage: result.disadvantage
  };

  return breakdown;
}