import React, { useState, useRef, useEffect } from 'react';

const Ambiance = ({ isDM = false, onAmbianceChange = () => {} }) => {
  const [currentPreset, setCurrentPreset] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const soundNodesRef = useRef({});

  // Web Audio API sound generators
  const createAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const generateAmbienceSound = (type, audioContext) => {
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.1;

    let nodes = [];

    switch (type) {
      case 'tavern': {
        // Fire crackling (brown noise + filtering)
        const brownNoise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = lastOut = (lastOut + (0.02 * white)) / 1.02;
          data[i] *= 3.5;
        }
        brownNoise.buffer = buffer;
        brownNoise.loop = true;
        
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 1;

        brownNoise.connect(filter);
        filter.connect(gainNode);
        nodes.push(brownNoise);
        break;
      }

      case 'forest': {
        // Wind sound (filtered white noise)
        const windNoise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.3;
        }
        windNoise.buffer = buffer;
        windNoise.loop = true;

        const windFilter = audioContext.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 300;
        windFilter.Q.value = 0.5;

        windNoise.connect(windFilter);
        windFilter.connect(gainNode);
        nodes.push(windNoise);
        break;
      }

      case 'dungeon': {
        // Deep drone (low frequency oscillator)
        const drone = audioContext.createOscillator();
        drone.type = 'sawtooth';
        drone.frequency.value = 60;
        
        const droneGain = audioContext.createGain();
        droneGain.gain.value = 0.05;

        drone.connect(droneGain);
        droneGain.connect(gainNode);
        nodes.push(drone);
        break;
      }

      case 'battle': {
        // Rhythmic drums (using oscillator + envelope)
        const kickOsc = audioContext.createOscillator();
        kickOsc.type = 'sine';
        kickOsc.frequency.value = 80;

        const kickGain = audioContext.createGain();
        kickGain.gain.value = 0;

        // Simple rhythmic pattern
        const kickPattern = () => {
          kickGain.gain.setValueAtTime(0.3, audioContext.currentTime);
          kickGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          setTimeout(kickPattern, 800);
        };

        kickOsc.connect(kickGain);
        kickGain.connect(gainNode);
        nodes.push(kickOsc);
        setTimeout(kickPattern, 100);
        break;
      }

      case 'city': {
        // Crowd murmur (filtered pink noise)
        const crowdNoise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
        crowdNoise.buffer = buffer;
        crowdNoise.loop = true;

        const crowdFilter = audioContext.createBiquadFilter();
        crowdFilter.type = 'bandpass';
        crowdFilter.frequency.value = 500;
        crowdFilter.Q.value = 0.8;

        crowdNoise.connect(crowdFilter);
        crowdFilter.connect(gainNode);
        nodes.push(crowdNoise);
        break;
      }

      case 'mystery': {
        // Ethereal pad (multiple sine waves)
        const freq1 = audioContext.createOscillator();
        const freq2 = audioContext.createOscillator();
        const freq3 = audioContext.createOscillator();
        
        freq1.type = 'sine';
        freq2.type = 'sine';
        freq3.type = 'sine';
        
        freq1.frequency.value = 220;
        freq2.frequency.value = 330;
        freq3.frequency.value = 440;

        const mysteryGain = audioContext.createGain();
        mysteryGain.gain.value = 0.02;

        freq1.connect(mysteryGain);
        freq2.connect(mysteryGain);
        freq3.connect(mysteryGain);
        mysteryGain.connect(gainNode);
        
        nodes.push(freq1, freq2, freq3);
        break;
      }

      case 'calm': {
        // Soft water sounds (filtered noise)
        const waterNoise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 5, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.2;
        }
        waterNoise.buffer = buffer;
        waterNoise.loop = true;

        const waterFilter1 = audioContext.createBiquadFilter();
        waterFilter1.type = 'highpass';
        waterFilter1.frequency.value = 200;

        const waterFilter2 = audioContext.createBiquadFilter();
        waterFilter2.type = 'lowpass';
        waterFilter2.frequency.value = 2000;

        waterNoise.connect(waterFilter1);
        waterFilter1.connect(waterFilter2);
        waterFilter2.connect(gainNode);
        nodes.push(waterNoise);
        break;
      }

      default:
        // Fallback: simple tone
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;
        osc.connect(gainNode);
        nodes.push(osc);
    }

    gainNode.connect(audioContext.destination);
    
    // Start all nodes
    const now = audioContext.currentTime;
    nodes.forEach(node => {
      if (node.start) node.start(now);
    });

    return { gainNode, nodes };
  };

  const generateSFXSound = async (type) => {
    const audioContext = createAudioContext();
    const gainNode = audioContext.createGain();
    gainNode.gain.value = Math.min(volume * 1.5, 1);

    let duration = 1; // Default 1 second

    switch (type) {
      case 'sword': {
        // Metallic swoosh
        const noise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        noise.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        filter.Q.value = 3;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        noise.start();
        duration = 0.3;
        break;
      }

      case 'magic': {
        // Sparkly sound
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = 800;
        osc2.frequency.value = 1200;

        const env = audioContext.createGain();
        env.gain.setValueAtTime(0.3, audioContext.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

        osc1.connect(env);
        osc2.connect(env);
        env.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        osc1.start();
        osc2.start();
        duration = 0.8;
        break;
      }

      case 'explosion': {
        // Boom sound
        const noise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.8, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
        noise.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        noise.start();
        duration = 0.8;
        break;
      }

      case 'door': {
        // Creaking door
        const osc = audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioContext.currentTime);
        osc.frequency.linearRampToValueAtTime(120, audioContext.currentTime + 1);

        const env = audioContext.createGain();
        env.gain.setValueAtTime(0.1, audioContext.currentTime);
        env.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.5);
        env.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1);

        osc.connect(env);
        env.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        osc.start();
        duration = 1;
        break;
      }

      case 'coins': {
        // Jingling coins
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const osc = audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 800 + Math.random() * 400;
            
            const coinGain = audioContext.createGain();
            coinGain.gain.setValueAtTime(0.1, audioContext.currentTime);
            coinGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

            osc.connect(coinGain);
            coinGain.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            osc.start();
            osc.stop(audioContext.currentTime + 0.2);
          }, i * 80);
        }
        duration = 0.6;
        break;
      }

      case 'footsteps': {
        // Stone footsteps
        const noise = audioContext.createBufferSource();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
        }
        noise.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 500;
        filter.Q.value = 1;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        noise.start();
        duration = 0.1;
        break;
      }

      default: {
        // Simple beep
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;
        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.2);
        duration = 0.2;
      }
    }

    // Auto-stop after duration
    setTimeout(() => {
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    }, duration * 1000 - 100);
  };

  // Audio presets with Web Audio API generated sounds
  const musicPresets = [
    {
      id: 'taverna',
      name: 'Taverna',
      icon: '🍺',
      description: 'Ambiente acolhedor de taverna',
      type: 'procedural',
      generator: 'tavern',
      color: '#d4a574'
    },
    {
      id: 'batalha',
      name: 'Batalha',
      icon: '⚔️',
      description: 'Música épica de combate',
      type: 'procedural',
      generator: 'battle',
      color: '#ff6b6b'
    },
    {
      id: 'floresta',
      name: 'Floresta',
      icon: '🌲',
      description: 'Sons da natureza',
      type: 'procedural',
      generator: 'forest',
      color: '#51cf66'
    },
    {
      id: 'dungeon',
      name: 'Dungeon',
      icon: '🏴󠁢󠁳󠁴󠁫󠁿',
      description: 'Atmosfera sombria subterrânea',
      type: 'procedural',
      generator: 'dungeon',
      color: '#495057'
    },
    {
      id: 'cidade',
      name: 'Cidade',
      icon: '🏘️',
      description: 'Movimento urbano medieval',
      type: 'procedural',
      generator: 'city',
      color: '#ffd43b'
    },
    {
      id: 'misterio',
      name: 'Mistério',
      icon: '🔍',
      description: 'Tensão e suspense',
      type: 'procedural',
      generator: 'mystery',
      color: '#c77dff'
    },
    {
      id: 'calmo',
      name: 'Calmo',
      icon: '☁️',
      description: 'Música suave e relaxante',
      type: 'procedural',
      generator: 'calm',
      color: '#74c0fc'
    }
  ];

  // Quick SFX sounds with Web Audio API
  const sfxSounds = [
    {
      id: 'espada',
      name: 'Espada',
      icon: '⚔️',
      type: 'sfx',
      generator: 'sword',
      description: 'Som de espada cortando'
    },
    {
      id: 'magia',
      name: 'Magia',
      icon: '✨',
      type: 'sfx',
      generator: 'magic',
      description: 'Efeito mágico'
    },
    {
      id: 'explosao',
      name: 'Explosão',
      icon: '💥',
      type: 'sfx',
      generator: 'explosion',
      description: 'Grande explosão'
    },
    {
      id: 'porta',
      name: 'Porta',
      icon: '🚪',
      type: 'sfx',
      generator: 'door',
      description: 'Porta rangendo'
    },
    {
      id: 'moedas',
      name: 'Moedas',
      icon: '💰',
      type: 'sfx',
      generator: 'coins',
      description: 'Som de moedas'
    },
    {
      id: 'passos',
      name: 'Passos',
      icon: '👣',
      type: 'sfx',
      generator: 'footsteps',
      description: 'Passos em pedra'
    }
  ];

  // Initialize and cleanup audio
  useEffect(() => {
    return () => {
      // Cleanup Web Audio nodes
      stopMusic();
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Context may already be closed
        }
        audioContextRef.current = null;
      }
    };
  }, []);

  const playPreset = async (preset) => {
    if (!isDM) return;

    setIsLoading(true);
    
    try {
      // Stop any existing sounds
      stopMusic();

      // Create audio context if needed
      const audioContext = createAudioContext();
      
      // Generate the ambient sound
      const soundData = generateAmbienceSound(preset.generator, audioContext);
      soundNodesRef.current[preset.id] = soundData;
      
      // Adjust volume
      soundData.gainNode.gain.value = volume * 0.1;
      
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
      alert('Could not generate audio. Your browser may not support Web Audio API.');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = () => {
    if (!isDM) return;

    if (isPlaying) {
      // Pause current sound
      if (currentPreset && soundNodesRef.current[currentPreset.id]) {
        const soundData = soundNodesRef.current[currentPreset.id];
        soundData.gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
      }
      setIsPlaying(false);
    } else if (currentPreset) {
      // Resume sound
      if (soundNodesRef.current[currentPreset.id]) {
        const soundData = soundNodesRef.current[currentPreset.id];
        soundData.gainNode.gain.setValueAtTime(volume * 0.1, audioContextRef.current.currentTime);
      } else {
        // Regenerate sound if nodes were lost
        playPreset(currentPreset);
        return;
      }
      setIsPlaying(true);
    }

    onAmbianceChange({
      type: 'music_toggle',
      isPlaying: !isPlaying
    });
  };

  const stopMusic = () => {
    if (!isDM) return;

    // Stop all sound nodes
    Object.keys(soundNodesRef.current).forEach(key => {
      const soundData = soundNodesRef.current[key];
      if (soundData && soundData.nodes) {
        soundData.nodes.forEach(node => {
          if (node.stop) {
            try {
              node.stop();
            } catch (e) {
              // Node may already be stopped
            }
          }
        });
      }
    });

    soundNodesRef.current = {};
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
      await generateSFXSound(sfx.generator);

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
    
    // Update current playing sound volume
    if (currentPreset && soundNodesRef.current[currentPreset.id]) {
      const soundData = soundNodesRef.current[currentPreset.id];
      soundData.gainNode.gain.setValueAtTime(newVolume * 0.1, audioContextRef.current.currentTime);
    }
    
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
          🎵 Ambiente controlado pelo Mestre
        </div>
        {currentPreset && (
          <div style={{
            marginTop: 'var(--spacing-sm)',
            color: 'var(--color-primary)',
            fontSize: '0.8rem'
          }}>
            Tocando: {currentPreset.icon} {currentPreset.name}
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
          🎵 Controle de Ambiente
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
              Nenhuma música tocando. Selecione um preset abaixo.
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
            Presets de Música
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
            Efeitos Sonoros
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
          background: 'rgba(81, 207, 102, 0.1)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          textAlign: 'center'
        }}>
          ✨ Todos os sons são gerados proceduralmente via Web Audio API!
        </div>
      </div>
    </div>
  );
};

export default Ambiance;