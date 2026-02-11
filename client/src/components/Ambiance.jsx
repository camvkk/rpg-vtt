import React, { useState, useRef, useEffect } from 'react';

const Ambiance = ({ isDM = false, onAmbianceChange = () => {} }) => {
  const [currentPreset, setCurrentPreset] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);

  // Audio presets with free sounds (examples)
  const musicPresets = [
    {
      id: 'taverna',
      name: 'Taverna',
      icon: '🍺',
      description: 'Ambiente acolhedor de taverna',
      url: 'https://www.soundjay.com/misc/sounds-909.wav', // Example URL
      color: '#d4a574'
    },
    {
      id: 'batalha',
      name: 'Batalha',
      icon: '⚔️',
      description: 'Música épica de combate',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      color: '#ff6b6b'
    },
    {
      id: 'floresta',
      name: 'Floresta',
      icon: '🌲',
      description: 'Sons da natureza',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      color: '#51cf66'
    },
    {
      id: 'dungeon',
      name: 'Dungeon',
      icon: '🏴󠁢󠁳󠁴󠁫󠁿',
      description: 'Atmosfera sombria subterrânea',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      color: '#495057'
    },
    {
      id: 'cidade',
      name: 'Cidade',
      icon: '🏘️',
      description: 'Movimento urbano medieval',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      color: '#ffd43b'
    },
    {
      id: 'misterio',
      name: 'Mistério',
      icon: '🔍',
      description: 'Tensão e suspense',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      color: '#c77dff'
    },
    {
      id: 'calmo',
      name: 'Calmo',
      icon: '☁️',
      description: 'Música suave e relaxante',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      color: '#74c0fc'
    }
  ];

  // Quick SFX sounds
  const sfxSounds = [
    {
      id: 'espada',
      name: 'Espada',
      icon: '⚔️',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      description: 'Som de espada cortando'
    },
    {
      id: 'magia',
      name: 'Magia',
      icon: '✨',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      description: 'Efeito mágico'
    },
    {
      id: 'explosao',
      name: 'Explosão',
      icon: '💥',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      description: 'Grande explosão'
    },
    {
      id: 'porta',
      name: 'Porta',
      icon: '🚪',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      description: 'Porta rangendo'
    },
    {
      id: 'moedas',
      name: 'Moedas',
      icon: '💰',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      description: 'Som de moedas'
    },
    {
      id: 'passos',
      name: 'Passos',
      icon: '👣',
      url: 'https://www.soundjay.com/misc/sounds-909.wav',
      description: 'Passos em pedra'
    }
  ];

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.volume = volume;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playPreset = async (preset) => {
    if (!isDM) return;

    setIsLoading(true);
    
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      audioRef.current.src = preset.url;
      audioRef.current.volume = volume;
      
      await audioRef.current.play();
      
      setCurrentPreset(preset);
      setIsPlaying(true);
      
      onAmbianceChange({
        type: 'music_change',
        preset: preset.id,
        name: preset.name,
        isPlaying: true
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      alert('Could not play audio. Please check the audio source.');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = () => {
    if (!isDM || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else if (currentPreset) {
      audioRef.current.play();
      setIsPlaying(true);
    }

    onAmbianceChange({
      type: 'music_toggle',
      isPlaying: !isPlaying
    });
  };

  const stopMusic = () => {
    if (!isDM || !audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentPreset(null);

    onAmbianceChange({
      type: 'music_stop',
      isPlaying: false
    });
  };

  const playSFX = async (sfx) => {
    if (!isDM) return;

    try {
      const sfxAudio = new Audio(sfx.url);
      sfxAudio.volume = Math.min(volume * 1.5, 1); // SFX slightly louder
      await sfxAudio.play();

      onAmbianceChange({
        type: 'sfx_play',
        sfx: sfx.id,
        name: sfx.name
      });
    } catch (error) {
      console.error('Error playing SFX:', error);
    }
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    onAmbianceChange({
      type: 'volume_change',
      volume: newVolume
    });
  };

  if (!isDM) {
    return (
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-md)',
        textAlign: 'center'
      }}>
        <div style={{
          color: 'var(--text-dim)',
          fontSize: '0.9rem',
          fontStyle: 'italic'
        }}>
          🎵 Ambiance controlled by DM
        </div>
        {currentPreset && (
          <div style={{
            marginTop: 'var(--spacing-sm)',
            color: 'var(--color-primary)',
            fontSize: '0.8rem'
          }}>
            Now Playing: {currentPreset.icon} {currentPreset.name}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)'
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface-light)',
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-fantasy)',
          color: 'var(--color-primary)',
          fontSize: '1.1rem'
        }}>
          🎵 Ambiance Control
        </h3>
      </div>

      <div style={{ padding: 'var(--spacing-md)' }}>
        {/* Current Playing */}
        <div style={{
          background: 'var(--surface-light)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-md)',
          textAlign: 'center'
        }}>
          {currentPreset ? (
            <div>
              <div style={{
                fontSize: '2rem',
                marginBottom: 'var(--spacing-sm)'
              }}>
                {currentPreset.icon}
              </div>
              <div style={{
                fontWeight: '600',
                color: 'var(--color-primary)',
                marginBottom: 'var(--spacing-sm)'
              }}>
                {currentPreset.name}
              </div>
              <div style={{
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                marginBottom: 'var(--spacing-md)'
              }}>
                {currentPreset.description}
              </div>
              
              {/* Playback Controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)'
              }}>
                <button
                  onClick={togglePlayPause}
                  disabled={isLoading}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    background: 'var(--color-primary)',
                    color: 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: isLoading ? 0.6 : 1
                  }}
                >
                  {isLoading ? '⏳' : isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>
                <button
                  onClick={stopMusic}
                  disabled={isLoading}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    background: 'var(--color-accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: isLoading ? 0.6 : 1
                  }}
                >
                  ⏹️ Stop
                </button>
              </div>

              {/* Volume Control */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)'
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>🔊</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: 'var(--color-primary)'
                  }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', minWidth: '30px' }}>
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              color: 'var(--text-dim)',
              fontSize: '0.9rem',
              fontStyle: 'italic'
            }}>
              No music playing. Select a preset below.
            </div>
          )}
        </div>

        {/* Music Presets */}
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <h4 style={{
            margin: '0 0 var(--spacing-sm) 0',
            fontFamily: 'var(--font-fantasy)',
            color: 'var(--color-primary)',
            fontSize: '0.9rem'
          }}>
            Music Presets
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: 'var(--spacing-sm)'
          }}>
            {musicPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => playPreset(preset)}
                disabled={isLoading}
                style={{
                  padding: 'var(--spacing-sm)',
                  background: currentPreset?.id === preset.id 
                    ? preset.color 
                    : 'var(--surface-light)',
                  color: currentPreset?.id === preset.id 
                    ? 'white' 
                    : 'var(--text-primary)',
                  border: `1px solid ${currentPreset?.id === preset.id ? preset.color : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all var(--transition-fast)',
                  fontSize: '0.8rem',
                  textAlign: 'center',
                  opacity: isLoading ? 0.6 : 1
                }}
                title={preset.description}
              >
                <div style={{ fontSize: '1.2rem', marginBottom: 'var(--spacing-xs)' }}>
                  {preset.icon}
                </div>
                <div style={{ fontWeight: '600' }}>
                  {preset.name}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* SFX Section */}
        <div>
          <h4 style={{
            margin: '0 0 var(--spacing-sm) 0',
            fontFamily: 'var(--font-fantasy)',
            color: 'var(--color-primary)',
            fontSize: '0.9rem'
          }}>
            Sound Effects
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
            gap: 'var(--spacing-sm)'
          }}>
            {sfxSounds.map((sfx) => (
              <button
                key={sfx.id}
                onClick={() => playSFX(sfx)}
                disabled={isLoading}
                style={{
                  padding: 'var(--spacing-sm)',
                  background: 'var(--surface-light)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all var(--transition-fast)',
                  fontSize: '0.8rem',
                  textAlign: 'center',
                  opacity: isLoading ? 0.6 : 1
                }}
                title={sfx.description}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.target.style.background = 'var(--color-secondary)';
                    e.target.style.color = 'white';
                    e.target.style.borderColor = 'var(--color-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.target.style.background = 'var(--surface-light)';
                    e.target.style.color = 'var(--text-primary)';
                    e.target.style.borderColor = 'var(--border-color)';
                  }
                }}
              >
                <div style={{ fontSize: '1.2rem', marginBottom: 'var(--spacing-xs)' }}>
                  {sfx.icon}
                </div>
                <div style={{ fontWeight: '600', fontSize: '0.7rem' }}>
                  {sfx.name}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Audio Notice */}
        <div style={{
          marginTop: 'var(--spacing-md)',
          padding: 'var(--spacing-sm)',
          background: 'rgba(199, 125, 255, 0.1)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          textAlign: 'center'
        }}>
          💡 Audio files are examples. In production, use royalty-free music from freesound.org or similar.
        </div>
      </div>
    </div>
  );
};

export default Ambiance;