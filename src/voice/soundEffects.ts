function playTone(frequency: number, volume: number, attack: number, duration: number): void {
  let audioContext: AudioContext;
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) throw new Error('AudioContext unavailable');
    audioContext = new AudioContextClass();
  } catch (error) {
    console.error('Failed to create AudioContext:', error);
    return;
  }
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(volume, audioContext.currentTime + attack);
  gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

export function playStartSound(): void { playTone(660, 0.7, 0.02, 0.2); }
export function playSendSound(): void { playTone(500, 0.5, 0.01, 0.1); }
export function playThinkingSound(): void { playTone(440, 0.2, 0.01, 0.15); }
