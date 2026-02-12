import { useGame } from '../contexts/GameContext';

export default function GridConfigPanel() {
  const { state, actions } = useGame();
  const { gridConfig } = state;

  const update = (key, value) => {
    actions.setGridConfig({ [key]: value });
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--spacing-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-sm)',
    }}>
      <h4 className="heading-sm" style={{ margin: 0, fontSize: '0.85rem' }}>⚙️ Configuração do Grid</h4>

      {/* Grid Type */}
      <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
        <button
          className={`btn ${gridConfig.gridType === 'square' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => update('gridType', 'square')}
          style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px' }}
        >
          ▦ Quadrado
        </button>
        <button
          className={`btn ${gridConfig.gridType === 'hex' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => update('gridType', 'hex')}
          style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px' }}
        >
          ⬡ Hexagonal
        </button>
      </div>

      {/* Grid Size */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
          Tamanho: {gridConfig.gridSize}px
        </label>
        <input
          type="range"
          min="20"
          max="100"
          step="5"
          value={gridConfig.gridSize}
          onChange={(e) => update('gridSize', parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
        <label style={{ 
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '0.75rem', cursor: 'pointer', flex: 1
        }}>
          <input
            type="checkbox"
            checked={gridConfig.snapEnabled !== false}
            onChange={(e) => update('snapEnabled', e.target.checked)}
          />
          Snap
        </label>
        <label style={{ 
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '0.75rem', cursor: 'pointer', flex: 1
        }}>
          <input
            type="checkbox"
            checked={gridConfig.gridVisible !== false}
            onChange={(e) => update('gridVisible', e.target.checked)}
          />
          Visível
        </label>
      </div>
    </div>
  );
}
