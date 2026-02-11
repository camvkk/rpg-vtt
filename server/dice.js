// Advanced dice parser and roller for RPG VTT
// Supports notation like: 2d20+5, 4d6kh3, 1d20dl1, 3d6r1, etc.

// Parse dice notation into components
function parseDiceNotation(notation) {
    // Remove all spaces
    const clean = notation.replace(/\s/g, '').toLowerCase();
    
    // Match dice notation: XdY[modifiers][+/-Z]
    const diceRegex = /(\d*)d(\d+)([a-z0-9]*)?([+-]\d+)?/g;
    const rolls = [];
    const modifiers = [];
    
    let match;
    let remainingString = clean;
    
    while ((match = diceRegex.exec(clean)) !== null) {
        const [fullMatch, countStr, sidesStr, modifierStr, bonusStr] = match;
        
        const count = parseInt(countStr) || 1;
        const sides = parseInt(sidesStr);
        const modifier = modifierStr || '';
        const bonus = bonusStr ? parseInt(bonusStr) : 0;
        
        rolls.push({
            count,
            sides,
            modifier,
            bonus: bonusStr ? bonus : undefined
        });
        
        // Remove this dice from the string to look for pure modifiers
        remainingString = remainingString.replace(fullMatch, '');
    }
    
    // Look for standalone modifiers (+5, -3, etc.)
    const modifierRegex = /([+-]\d+)/g;
    let modMatch;
    while ((modMatch = modifierRegex.exec(remainingString)) !== null) {
        const modifier = parseInt(modMatch[1]);
        modifiers.push(modifier);
    }
    
    return { rolls, modifiers };
}

// Parse dice modifiers (kh3, dl1, r1, etc.)
function parseDiceModifiers(modifierStr) {
    if (!modifierStr) return {};
    
    const modifiers = {};
    
    // Keep highest: kh3 or k3
    const keepHighMatch = modifierStr.match(/k(?:h)?(\d+)/);
    if (keepHighMatch) {
        modifiers.keepHigh = parseInt(keepHighMatch[1]);
    }
    
    // Keep lowest: kl3
    const keepLowMatch = modifierStr.match(/kl(\d+)/);
    if (keepLowMatch) {
        modifiers.keepLow = parseInt(keepLowMatch[1]);
    }
    
    // Drop highest: dh2
    const dropHighMatch = modifierStr.match(/dh(\d+)/);
    if (dropHighMatch) {
        modifiers.dropHigh = parseInt(dropHighMatch[1]);
    }
    
    // Drop lowest: dl1
    const dropLowMatch = modifierStr.match(/dl(\d+)/);
    if (dropLowMatch) {
        modifiers.dropLow = parseInt(dropLowMatch[1]);
    }
    
    // Reroll: r1 (reroll 1s), r<=2 (reroll 2 or below)
    const rerollMatch = modifierStr.match(/r(?:<=?)?(\d+)/);
    if (rerollMatch) {
        const isLessEqual = modifierStr.includes('<=');
        const isLess = modifierStr.includes('<') && !isLessEqual;
        modifiers.reroll = {
            value: parseInt(rerollMatch[1]),
            type: isLessEqual ? 'lessEqual' : isLess ? 'less' : 'equal'
        };
    }
    
    // Exploding dice: x (explode on max), x10 (explode on 10+)
    const explodeMatch = modifierStr.match(/x(\d+)?/);
    if (explodeMatch) {
        modifiers.explode = explodeMatch[1] ? parseInt(explodeMatch[1]) : null;
    }
    
    return modifiers;
}

// Roll a single die
function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

// Apply modifiers to dice results
function applyModifiers(results, modifiers, sides) {
    let finalResults = [...results];
    const rollHistory = [];
    
    // Handle rerolls
    if (modifiers.reroll) {
        const { value, type } = modifiers.reroll;
        finalResults = finalResults.map(result => {
            let currentResult = result;
            const rerollHistory = [result];
            
            let shouldReroll;
            do {
                shouldReroll = false;
                switch (type) {
                    case 'equal':
                        shouldReroll = currentResult === value;
                        break;
                    case 'less':
                        shouldReroll = currentResult < value;
                        break;
                    case 'lessEqual':
                        shouldReroll = currentResult <= value;
                        break;
                }
                
                if (shouldReroll) {
                    currentResult = rollDie(sides);
                    rerollHistory.push(currentResult);
                }
            } while (shouldReroll && rerollHistory.length < 10); // Prevent infinite rerolls
            
            if (rerollHistory.length > 1) {
                rollHistory.push({
                    original: result,
                    rerolls: rerollHistory.slice(1),
                    final: currentResult
                });
            }
            
            return currentResult;
        });
    }
    
    // Handle exploding dice
    if (modifiers.explode !== undefined) {
        const explodeThreshold = modifiers.explode || sides;
        let i = 0;
        
        while (i < finalResults.length && finalResults.length < 100) { // Safety limit
            if (finalResults[i] >= explodeThreshold) {
                const newRoll = rollDie(sides);
                finalResults.push(newRoll);
                rollHistory.push({
                    exploded: finalResults[i],
                    additional: newRoll
                });
            }
            i++;
        }
    }
    
    // Sort for drop/keep operations
    const sortedResults = [...finalResults].sort((a, b) => b - a);
    let keptResults = [...finalResults];
    
    // Apply drop/keep modifiers
    if (modifiers.dropHigh) {
        keptResults = sortedResults.slice(modifiers.dropHigh);
    } else if (modifiers.dropLow) {
        keptResults = sortedResults.slice(0, -modifiers.dropLow);
    } else if (modifiers.keepHigh) {
        keptResults = sortedResults.slice(0, modifiers.keepHigh);
    } else if (modifiers.keepLow) {
        keptResults = sortedResults.slice(-modifiers.keepLow);
    }
    
    return {
        allRolls: finalResults,
        keptRolls: keptResults,
        droppedRolls: finalResults.filter(roll => !keptResults.includes(roll)),
        rollHistory
    };
}

// Roll dice with notation
function rollDice(notation, playerName = 'Unknown') {
    try {
        const { rolls, modifiers } = parseDiceNotation(notation);
        
        if (rolls.length === 0) {
            throw new Error('Invalid dice notation');
        }
        
        let totalResult = 0;
        const rollDetails = [];
        
        // Process each dice group
        for (const roll of rolls) {
            const parsedModifiers = parseDiceModifiers(roll.modifier);
            
            // Roll the dice
            const results = [];
            for (let i = 0; i < roll.count; i++) {
                results.push(rollDie(roll.sides));
            }
            
            // Apply modifiers
            const modifierResult = applyModifiers(results, parsedModifiers, roll.sides);
            
            // Calculate subtotal
            const subtotal = modifierResult.keptRolls.reduce((sum, val) => sum + val, 0);
            
            // Add individual roll bonus
            const finalSubtotal = roll.bonus !== undefined ? subtotal + roll.bonus : subtotal;
            totalResult += finalSubtotal;
            
            rollDetails.push({
                notation: `${roll.count}d${roll.sides}${roll.modifier}${roll.bonus !== undefined ? (roll.bonus >= 0 ? '+' : '') + roll.bonus : ''}`,
                results: modifierResult.allRolls,
                keptResults: modifierResult.keptRolls,
                droppedResults: modifierResult.droppedRolls,
                rollHistory: modifierResult.rollHistory,
                subtotal: finalSubtotal,
                modifiers: parsedModifiers
            });
        }
        
        // Add standalone modifiers
        const standaloneModifier = modifiers.reduce((sum, mod) => sum + mod, 0);
        totalResult += standaloneModifier;
        
        return {
            originalNotation: notation,
            playerName,
            rollDetails,
            standaloneModifier,
            total: totalResult,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error rolling dice:', error);
        throw error;
    }
}

// Format roll result for display
function formatRollResult(rollResult) {
    const { originalNotation, playerName, rollDetails, standaloneModifier, total } = rollResult;
    
    let formatted = `**${playerName}** rolled **${originalNotation}**\n`;
    
    rollDetails.forEach(detail => {
        formatted += `├ ${detail.notation}: `;
        
        if (detail.droppedResults.length > 0) {
            formatted += `~~${detail.droppedResults.join(', ')}~~, `;
        }
        
        formatted += `**${detail.keptResults.join(', ')}**`;
        
        if (detail.rollHistory.length > 0) {
            formatted += ` (rerolls/explodes)`;
        }
        
        formatted += ` = **${detail.subtotal}**\n`;
    });
    
    if (standaloneModifier !== 0) {
        formatted += `├ Modifier: **${standaloneModifier >= 0 ? '+' : ''}${standaloneModifier}**\n`;
    }
    
    formatted += `└ **Total: ${total}**`;
    
    return formatted;
}

// Get dice roll type for UI coloring
function getRollType(notation) {
    const lower = notation.toLowerCase();
    
    if (lower.includes('attack') || lower.includes('atk')) return 'attack';
    if (lower.includes('damage') || lower.includes('dmg')) return 'damage';
    if (lower.includes('heal') || lower.includes('hp')) return 'healing';
    if (lower.includes('save') || lower.includes('saving')) return 'save';
    if (lower.includes('skill') || lower.includes('check')) return 'skill';
    if (lower.includes('init') || lower.includes('initiative')) return 'initiative';
    
    return 'general';
}

// Quick roll presets for common D&D rolls
const quickRolls = {
    // Ability checks
    'd20': { notation: '1d20', description: 'D20 roll' },
    'advantage': { notation: '2d20kh1', description: 'Roll with advantage' },
    'disadvantage': { notation: '2d20kl1', description: 'Roll with disadvantage' },
    
    // Common damage dice
    'shortsword': { notation: '1d6', description: 'Shortsword damage' },
    'longsword': { notation: '1d8', description: 'Longsword damage' },
    'greatsword': { notation: '2d6', description: 'Greatsword damage' },
    'fireball': { notation: '8d6', description: 'Fireball damage' },
    
    // Ability scores
    'stats': { notation: '4d6kh3', description: 'Ability score generation' },
    
    // Initiative
    'initiative': { notation: '1d20', description: 'Initiative roll' }
};

module.exports = {
    parseDiceNotation,
    rollDice,
    formatRollResult,
    getRollType,
    quickRolls
};