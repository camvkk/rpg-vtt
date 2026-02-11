import React, { useState } from 'react';

const Toolbar = ({ 
  isDM = false,
  activeTool = 'select',
  gridEnabled = true,
  snapToGrid = true,
  onToolSelect = () => {},
  onGridToggle = () => {},
  onSnapToggle = () => {},
  onMapUpload = () => {},
  onFogClear = () => {},
  onFogFill = () => {},
  onSettingsOpen = () => {}
}) => {
  const [showMapUpload, setShowMapUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Available tools for DM
  const tools = [
    {
      id: 'select',
      name: 'Select',
      icon: '🏹',
      description: 'Select and move objects',
      hotkey: 'V'
    },
    {
      id: 'move',
      name: 'Move Token',
      icon: '✋',
      description: 'Move tokens around the map',
      hotkey: 'M'
    },
    {
      id: 'add-token',
      name: 'Add Token',
      icon: '➕',
      description: 'Add new tokens to the map',
      hotkey: 'T'
    },
    {
      id: 'fog-brush',
      name: 'Fog Brush',
      icon: '🌫️',
      description: 'Paint or erase fog of war',
      hotkey: 'F'
    },
    {
      id: 'measure',
      name: 'Measure',
      icon: '📏',
      description: 'Measure distances',
      hotkey: 'R'
    },
    {
      id: 'pan',
      name: 'Pan',
      icon: '✋',
      description: 'Pan around the map',
      hotkey: 'Space'
    }
  ];

  const handleToolSelect = (toolId) => {
    onToolSelect(toolId);
  };

  const handleMapUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      onMapUpload(file);
      setShowMapUpload(false);
    } else {
      alert('Please select a valid image file (JPG, PNG, etc.)');
    }
    // Reset input
    event.target.value = '';
  };

  if (!isDM) {
    return (
      <div style={{
        background: 'var(--surface-primary)',
        borderBottom: '1px solid var(--border-color)',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          color: 'var(--text-dim)',
          fontSize: '0.9rem',
          fontStyle: 'italic'
        }}>
          🎮 Game in progress - DM controls the map
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface-primary)',
      borderBottom: '1px solid var(--border-color)',
      padding: 'var(--spacing-sm)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)',
      flexWrap: 'wrap',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Tools Group */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-xs)',
        paddingRight: 'var(--spacing-md)',
        borderRight: '1px solid var(--border-color)'
      }}>
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          alignSelf: 'center',
          marginRight: 'var(--spacing-xs)'
        }}>
          Tools:
        </div>
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolSelect(tool.id)}
            title={`${tool.description} (${tool.hotkey})`}
            style={{
              padding: 'var(--spacing-sm)',
              background: activeTool === tool.id ? 'var(--color-primary)' : 'var(--surface-light)',
              color: activeTool === tool.id ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: `1px solid ${activeTool === tool.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              transition: 'all var(--transition-fast)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-xs)',
              minWidth: '40px',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              if (activeTool !== tool.id) {
                e.target.style.background = 'var(--color-primary)';
                e.target.style.color = 'var(--bg-primary)';
                e.target.style.borderColor = 'var(--color-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== tool.id) {
                e.target.style.background = 'var(--surface-light)';
                e.target.style.color = 'var(--text-primary)';
                e.target.style.borderColor = 'var(--border-color)';
              }
            }}
          >
            <span>{tool.icon}</span>
            <span style={{ 
              fontSize: '0.7rem',
              display: window.innerWidth > 768 ? 'inline' : 'none' 
            }}>
              {tool.name}
            </span>
          </button>
        ))}
      </div>

      {/* Map Controls Group */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-xs)',
        paddingRight: 'var(--spacing-md)',
        borderRight: '1px solid var(--border-color)'
      }}>
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          alignSelf: 'center',
          marginRight: 'var(--spacing-xs)'
        }}>
          Map:
        </div>
        
        {/* Grid Toggle */}
        <button
          onClick={onGridToggle}
          style={{
            padding: 'var(--spacing-sm)',
            background: gridEnabled ? 'var(--color-success)' : 'var(--surface-light)',
            color: gridEnabled ? 'white' : 'var(--text-primary)',
            border: `1px solid ${gridEnabled ? 'var(--color-success)' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            transition: 'all var(--transition-fast)'
          }}
          title="Toggle grid visibility"
        >
          🔲 Grid
        </button>

        {/* Snap Toggle */}
        <button
          onClick={onSnapToggle}
          style={{
            padding: 'var(--spacing-sm)',
            background: snapToGrid ? 'var(--color-success)' : 'var(--surface-light)',
            color: snapToGrid ? 'white' : 'var(--text-primary)',
            border: `1px solid ${snapToGrid ? 'var(--color-success)' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            transition: 'all var(--transition-fast)'
          }}
          title="Toggle snap to grid"
        >
          🧲 Snap
        </button>

        {/* Upload Map */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMapUpload(!showMapUpload)}
            style={{
              padding: 'var(--spacing-sm)',
              background: 'var(--surface-light)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600',
              transition: 'all var(--transition-fast)'
            }}
            title="Upload new map"
          >
            📁 Upload
          </button>
          {showMapUpload && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 'var(--spacing-xs)',
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-sm)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 1000,
              minWidth: '200px'
            }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleMapUpload}
                style={{
                  width: '100%',
                  padding: 'var(--spacing-sm)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-light)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
              <button
                onClick={() => setShowMapUpload(false)}
                style={{
                  marginTop: 'var(--spacing-sm)',
                  width: '100%',
                  padding: 'var(--spacing-xs)',
                  background: 'var(--text-dim)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.7rem'
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fog Controls Group */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-xs)',
        paddingRight: 'var(--spacing-md)',
        borderRight: '1px solid var(--border-color)'
      }}>
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          alignSelf: 'center',
          marginRight: 'var(--spacing-xs)'
        }}>
          Fog:
        </div>
        
        <button
          onClick={onFogClear}
          style={{
            padding: 'var(--spacing-sm)',
            background: 'var(--surface-light)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            transition: 'all var(--transition-fast)'
          }}
          title="Clear all fog"
          onMouseEnter={(e) => {
            e.target.style.background = 'var(--color-success)';
            e.target.style.color = 'white';
            e.target.style.borderColor = 'var(--color-success)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'var(--surface-light)';
            e.target.style.color = 'var(--text-primary)';
            e.target.style.borderColor = 'var(--border-color)';
          }}
        >
          🌤️ Clear
        </button>

        <button
          onClick={onFogFill}
          style={{
            padding: 'var(--spacing-sm)',
            background: 'var(--surface-light)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            transition: 'all var(--transition-fast)'
          }}
          title="Fill all with fog"
          onMouseEnter={(e) => {
            e.target.style.background = 'var(--color-accent)';
            e.target.style.color = 'white';
            e.target.style.borderColor = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'var(--surface-light)';
            e.target.style.color = 'var(--text-primary)';
            e.target.style.borderColor = 'var(--border-color)';
          }}
        >
          🌫️ Fill
        </button>
      </div>

      {/* Settings Group */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-xs)',
        alignItems: 'center'
      }}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            padding: 'var(--spacing-sm)',
            background: 'var(--surface-light)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            transition: 'all var(--transition-fast)',
            position: 'relative'
          }}
          title="Map settings"
        >
          ⚙️ Settings
        </button>

        {/* Settings Dropdown */}
        {showSettings && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 'var(--spacing-md)',
            marginTop: 'var(--spacing-xs)',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            minWidth: '250px'
          }}>
            <h4 style={{
              margin: '0 0 var(--spacing-md) 0',
              fontFamily: 'var(--font-fantasy)',
              color: 'var(--color-primary)',
              fontSize: '1rem'
            }}>
              ⚙️ Map Settings
            </h4>

            {/* Grid Size */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                marginBottom: 'var(--spacing-xs)'
              }}>
                Grid Size (feet):
              </label>
              <select
                defaultValue="5"
                style={{
                  width: '100%',
                  padding: 'var(--spacing-sm)',
                  background: 'var(--surface-light)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem'
                }}
              >
                <option value="5">5 feet</option>
                <option value="10">10 feet</option>
                <option value="1">1 foot</option>
              </select>
            </div>

            {/* Grid Color */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                marginBottom: 'var(--spacing-xs)'
              }}>
                Grid Color:
              </label>
              <input
                type="color"
                defaultValue="#2a2a4a"
                style={{
                  width: '100%',
                  height: '32px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-light)',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Token Size */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                marginBottom: 'var(--spacing-xs)'
              }}>
                Default Token Size:
              </label>
              <select
                defaultValue="medium"
                style={{
                  width: '100%',
                  padding: 'var(--spacing-sm)',
                  background: 'var(--surface-light)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem'
                }}
              >
                <option value="tiny">Tiny (2.5ft)</option>
                <option value="small">Small (5ft)</option>
                <option value="medium">Medium (5ft)</option>
                <option value="large">Large (10ft)</option>
                <option value="huge">Huge (15ft)</option>
                <option value="gargantuan">Gargantuan (20ft+)</option>
              </select>
            </div>

            {/* Measurement Units */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  defaultChecked
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                Show distance in feet
              </label>
            </div>

            {/* Fog Opacity */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                marginBottom: 'var(--spacing-xs)'
              }}>
                Fog Opacity: <span style={{ color: 'var(--color-primary)' }}>80%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                defaultValue="80"
                style={{
                  width: '100%',
                  accentColor: 'var(--color-primary)'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-sm)',
              marginTop: 'var(--spacing-md)',
              paddingTop: 'var(--spacing-md)',
              borderTop: '1px solid var(--border-color)'
            }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-sm)',
                  background: 'var(--color-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}
              >
                Apply
              </button>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-sm)',
                  background: 'var(--text-dim)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hotkeys Info */}
      <div style={{
        marginLeft: 'auto',
        fontSize: '0.7rem',
        color: 'var(--text-dim)',
        display: window.innerWidth > 1024 ? 'block' : 'none'
      }}>
        💡 Press keys: V, M, T, F, R, Space
      </div>
    </div>
  );
};

export default Toolbar;