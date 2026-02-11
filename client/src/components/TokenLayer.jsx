import { useRef, useEffect, useState, useCallback } from 'react';
import { Container, Graphics, Text, TextStyle, Sprite, Texture } from 'pixi.js';
import { snapToGrid, gridCenterToPixel, pixelToGrid } from '../utils/gridUtils';

const TokenLayer = ({ 
  pixiApp, 
  container,
  tokens = new Map(),
  selectedTokenId,
  onTokenMove,
  onTokenSelect,
  onTokenAdd,
  onTokenUpdate,
  isDM = false,
  currentPlayerId,
  zoom = 1,
  panX = 0,
  panY = 0
}) => {
  const tokensRef = useRef(new Map());
  const dragStateRef = useRef({ 
    isDragging: false, 
    token: null, 
    startPos: null, 
    offset: { x: 0, y: 0 } 
  });
  const [showTokenCreator, setShowTokenCreator] = useState(false);
  const [newTokenPos, setNewTokenPos] = useState({ x: 0, y: 0 });

  // Create token sprite
  const createTokenSprite = useCallback((token) => {
    const tokenContainer = new Container();
    
    // Token circle background
    const tokenCircle = new Graphics();
    const color = token.color || 0x3b82f6;
    tokenCircle.beginFill(color, 0.8);
    tokenCircle.lineStyle(3, token.isSelected ? 0xe2b714 : 0xffffff, 1);
    tokenCircle.drawCircle(0, 0, 18);
    tokenCircle.endFill();
    
    // Token text/icon
    const tokenText = new Text(token.name[0]?.toUpperCase() || '?', new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
      align: 'center'
    }));
    tokenText.anchor.set(0.5);
    
    // Token name label (below token)
    const nameLabel = new Text(token.name, new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 10,
      fill: 0xe8e8e8,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: 80,
      stroke: 0x0f0f1a,
      strokeThickness: 2
    }));
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(0, 25);
    
    // HP Bar (above token)
    const hpBarBg = new Graphics();
    hpBarBg.beginFill(0x1a1a2e, 0.8);
    hpBarBg.lineStyle(1, 0x2a2a4a, 1);
    hpBarBg.drawRoundedRect(-20, -35, 40, 6, 3);
    hpBarBg.endFill();
    
    const hpBarFill = new Graphics();
    const hpPercent = token.currentHP / token.maxHP;
    const barColor = hpPercent > 0.5 ? 0x51cf66 : hpPercent > 0.25 ? 0xe2b714 : 0xff6b6b;
    hpBarFill.beginFill(barColor);
    hpBarFill.drawRoundedRect(-18, -33, 36 * hpPercent, 2, 1);
    hpBarFill.endFill();
    
    // HP Text
    const hpText = new Text(`${token.currentHP}/${token.maxHP}`, new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 8,
      fill: 0xe8e8e8,
      align: 'center',
      stroke: 0x0f0f1a,
      strokeThickness: 1
    }));
    hpText.anchor.set(0.5, 0);
    hpText.position.set(0, -45);
    
    // Add all elements to container
    tokenContainer.addChild(tokenCircle);
    tokenContainer.addChild(tokenText);
    tokenContainer.addChild(nameLabel);
    
    if (token.showHP !== false) {
      tokenContainer.addChild(hpBarBg);
      tokenContainer.addChild(hpBarFill);
      tokenContainer.addChild(hpText);
    }
    
    // Position token
    const gridPos = gridCenterToPixel(token.gridX || 0, token.gridY || 0);
    tokenContainer.position.set(gridPos.x, gridPos.y);
    
    // Make interactive
    tokenContainer.interactive = true;
    tokenContainer.buttonMode = true;
    tokenContainer.cursor = 'pointer';
    
    // Store reference to token data
    tokenContainer.tokenData = token;
    
    return tokenContainer;
  }, []);

  // Update token visual
  const updateTokenVisual = useCallback((tokenSprite, token) => {
    if (!tokenSprite || !token) return;
    
    // Update selection highlight
    const tokenCircle = tokenSprite.children[0];
    if (tokenCircle) {
      tokenCircle.clear();
      const color = token.color || 0x3b82f6;
      tokenCircle.beginFill(color, 0.8);
      tokenCircle.lineStyle(3, token.isSelected ? 0xe2b714 : 0xffffff, 1);
      tokenCircle.drawCircle(0, 0, 18);
      tokenCircle.endFill();
    }
    
    // Update HP bar
    const hpBarFill = tokenSprite.children.find(child => 
      child.constructor.name === 'Graphics' && child.y === 0
    );
    if (hpBarFill && token.currentHP !== undefined && token.maxHP !== undefined) {
      hpBarFill.clear();
      const hpPercent = Math.max(0, token.currentHP / token.maxHP);
      const barColor = hpPercent > 0.5 ? 0x51cf66 : hpPercent > 0.25 ? 0xe2b714 : 0xff6b6b;
      hpBarFill.beginFill(barColor);
      hpBarFill.drawRoundedRect(-18, -33, 36 * hpPercent, 2, 1);
      hpBarFill.endFill();
    }
    
    // Update HP text
    const hpText = tokenSprite.children.find(child => 
      child.constructor.name === 'Text' && child.y === -45
    );
    if (hpText && token.currentHP !== undefined && token.maxHP !== undefined) {
      hpText.text = `${token.currentHP}/${token.maxHP}`;
    }
    
    // Update position if needed
    if (token.gridX !== undefined && token.gridY !== undefined) {
      const gridPos = gridCenterToPixel(token.gridX, token.gridY);
      tokenSprite.position.set(gridPos.x, gridPos.y);
    }
    
    // Store updated token data
    tokenSprite.tokenData = token;
  }, []);

  // Setup token interactions
  const setupTokenInteraction = useCallback((tokenSprite) => {
    const token = tokenSprite.tokenData;
    
    // Can only interact with own token (unless DM)
    const canMove = isDM || token.playerId === currentPlayerId;
    
    tokenSprite.on('pointerdown', (event) => {
      event.stopPropagation();
      
      // Select token
      onTokenSelect?.(token.id);
      
      // Start dragging if allowed
      if (canMove) {
        const dragState = dragStateRef.current;
        dragState.isDragging = true;
        dragState.token = tokenSprite;
        
        const globalPos = event.data.global;
        const localPos = event.data.getLocalPosition(tokenSprite.parent);
        dragState.startPos = { x: localPos.x, y: localPos.y };
        dragState.offset = {
          x: localPos.x - tokenSprite.position.x,
          y: localPos.y - tokenSprite.position.y
        };
        
        tokenSprite.alpha = 0.8;
      }
    });
    
    // Global mouse events for dragging
    if (pixiApp && !pixiApp.stage.listenerCount('pointermove')) {
      pixiApp.stage.on('pointermove', (event) => {
        const dragState = dragStateRef.current;
        if (!dragState.isDragging || !dragState.token) return;
        
        const localPos = event.data.getLocalPosition(container);
        const newX = localPos.x - dragState.offset.x;
        const newY = localPos.y - dragState.offset.y;
        
        // Snap to grid
        const snappedPos = snapToGrid(newX, newY);
        dragState.token.position.set(snappedPos.x, snappedPos.y);
      });
      
      pixiApp.stage.on('pointerup', () => {
        const dragState = dragStateRef.current;
        if (!dragState.isDragging || !dragState.token) return;
        
        const token = dragState.token.tokenData;
        const finalPos = dragState.token.position;
        const gridPos = pixelToGrid(finalPos.x, finalPos.y);
        
        // Send move event
        onTokenMove?.(token.id, gridPos.x, gridPos.y);
        
        dragState.token.alpha = 1;
        dragState.isDragging = false;
        dragState.token = null;
      });
    }
  }, [isDM, currentPlayerId, onTokenSelect, onTokenMove, pixiApp, container]);

  // Update tokens when props change
  useEffect(() => {
    if (!container) return;
    
    const currentTokens = tokensRef.current;
    const newTokenIds = new Set(tokens.keys());
    
    // Remove tokens that no longer exist
    currentTokens.forEach((tokenSprite, tokenId) => {
      if (!newTokenIds.has(tokenId)) {
        container.removeChild(tokenSprite);
        currentTokens.delete(tokenId);
      }
    });
    
    // Add or update tokens
    tokens.forEach((token, tokenId) => {
      const existingSprite = currentTokens.get(tokenId);
      
      if (existingSprite) {
        // Update existing token
        const updatedToken = { ...token, isSelected: tokenId === selectedTokenId };
        updateTokenVisual(existingSprite, updatedToken);
      } else {
        // Create new token
        const newToken = { ...token, isSelected: tokenId === selectedTokenId };
        const tokenSprite = createTokenSprite(newToken);
        setupTokenInteraction(tokenSprite);
        
        container.addChild(tokenSprite);
        currentTokens.set(tokenId, tokenSprite);
      }
    });
  }, [tokens, selectedTokenId, container, createTokenSprite, updateTokenVisual, setupTokenInteraction]);

  // Handle canvas right-click for adding tokens (DM only)
  useEffect(() => {
    if (!isDM || !pixiApp) return;
    
    const canvas = pixiApp.view;
    
    const handleContextMenu = (event) => {
      event.preventDefault();
      
      if (dragStateRef.current.isDragging) return;
      
      const rect = canvas.getBoundingClientRect();
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;
      
      // Convert to world coordinates
      const worldX = (canvasX - panX) / zoom;
      const worldY = (canvasY - panY) / zoom;
      const gridPos = pixelToGrid(worldX, worldY);
      
      setNewTokenPos(gridPos);
      setShowTokenCreator(true);
    };
    
    canvas.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isDM, pixiApp, zoom, panX, panY]);

  // Token Creator Modal
  const TokenCreator = () => {
    const [tokenData, setTokenData] = useState({
      name: '',
      type: 'player',
      color: '#3b82f6',
      maxHP: 20,
      currentHP: 20
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      
      const newToken = {
        ...tokenData,
        id: `token_${Date.now()}`,
        gridX: newTokenPos.x,
        gridY: newTokenPos.y,
        playerId: tokenData.type === 'player' ? null : 'dm',
        color: parseInt(tokenData.color.replace('#', ''), 16)
      };
      
      onTokenAdd?.(newToken);
      setShowTokenCreator(false);
      setTokenData({
        name: '',
        type: 'player',
        color: '#3b82f6',
        maxHP: 20,
        currentHP: 20
      });
    };

    if (!showTokenCreator) return null;

    return (
      <div className="token-creator-overlay">
        <div className="token-creator-modal panel">
          <h3 className="heading-sm">Adicionar Token</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input
                type="text"
                className="input"
                value={tokenData.name}
                onChange={(e) => setTokenData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome do personagem/NPC"
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select
                className="input"
                value={tokenData.type}
                onChange={(e) => setTokenData(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="player">Jogador</option>
                <option value="npc">NPC Aliado</option>
                <option value="enemy">Inimigo</option>
              </select>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">HP Máximo</label>
                <input
                  type="number"
                  className="input"
                  value={tokenData.maxHP}
                  onChange={(e) => {
                    const maxHP = parseInt(e.target.value) || 1;
                    setTokenData(prev => ({ 
                      ...prev, 
                      maxHP,
                      currentHP: Math.min(prev.currentHP, maxHP)
                    }));
                  }}
                  min="1"
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">HP Atual</label>
                <input
                  type="number"
                  className="input"
                  value={tokenData.currentHP}
                  onChange={(e) => setTokenData(prev => ({ 
                    ...prev, 
                    currentHP: Math.max(0, Math.min(parseInt(e.target.value) || 0, prev.maxHP))
                  }))}
                  min="0"
                  max={tokenData.maxHP}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Cor</label>
              <input
                type="color"
                className="input color-input"
                value={tokenData.color}
                onChange={(e) => setTokenData(prev => ({ ...prev, color: e.target.value }))}
              />
            </div>
            
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowTokenCreator(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Criar Token
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <>
      <TokenCreator />
      
      <style jsx>{`
        .token-creator-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 15, 26, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .token-creator-modal {
          width: 400px;
          max-width: 90vw;
          max-height: 90vh;
          overflow-y: auto;
        }

        .form-row {
          display: flex;
          gap: 1rem;
        }

        .form-row .form-group {
          flex: 1;
        }

        .color-input {
          height: 40px;
          padding: 4px;
          border-radius: 6px;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .form-actions .btn {
          flex: 1;
        }
      `}</style>
    </>
  );
};

export default TokenLayer;