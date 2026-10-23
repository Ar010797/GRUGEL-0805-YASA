/**
 * Web Audio API synthesizer for crisp, pleasant RT bell / chime notification sound.
 * Guaranteed 100% offline, zero external dependencies, no 404 errors.
 */
export const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Harmonic double chime (Indonesian traditional kentongan / lonceng warta)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gain = ctx.createGain();

    // First Ding (High Bell)
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

    // Second Tone (Warm Chime)
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now);
    osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.18); // E6

    // Resonance
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(440, now);

    // Gain envelope with natural decay
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    osc1.connect(gain);
    osc2.connect(gain);
    osc3.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    osc1.stop(now + 1.4);
    osc2.stop(now + 1.4);
    osc3.stop(now + 1.4);
  } catch (err) {
    console.warn('Audio notification could not play:', err);
  }
};
