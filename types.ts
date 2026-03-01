
export enum AppStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export type InstrumentType = 
  | 'kick' | 'hat' | 'snare' | 'acid' | 'stab' | 'sub' 
  | 'pad' | 'bell' | 'drone' | 'noise' | 'click' | 'rhodes'
  | 'wind' | 'string' | 'pluck' | 'brass' | 'tom' | 'chord'
  | 'sub808' | 'rim' | 'clap' | 'flute' | 'vox';

export interface MusicalNote {
  frequency: number;
  duration: number; // in seconds
  intensity: number; // 0 to 1
}

  export interface Emotion {
    valence: number;
    arousal: number;
    dominance: number;
    label: string;
  }

  export interface MusicalParameters {
    tempo: number;
    mode: string;
    articulation: string;
    register: string;
    rhythmic_density: number;
    harmonic_tension: number;
    spectral_brightness: number;
    attack_speed: string;
  }

  export interface SoundDesign {
    instrument: string;
    waveform: string;
    texture: string;
    space: string;
  }

  export interface SonicProfile {
    emotion: Emotion;
    musicalParameters: MusicalParameters;
    soundDesign: SoundDesign;
  }

export interface SonicProfile {
  emotion: Emotion;
  musicalParameters: MusicalParameters;
  soundDesign: SoundDesign;
}

export interface FilterState { 
  brightness: number; 
  contrast: number; 
  saturation: number;
  r: number;
  g: number;
  b: number;
}

export interface SonicTrack {
  id: string;
  image: string;
  profile: SonicProfile;
  audioUrl?: string;
  audioPrompt?: string;
  sourceBpm?: number;
  targetBpm?: number;
  pitchSemitones?: number;
  lowEqGainDb?: number;
  highEqGainDb?: number;
  selectedInstrument: InstrumentType;
  genre: string;
  isMuted: boolean;
  isSoloed: boolean;
  volume: number;
  status: AppStatus;
  filters: FilterState;
}

export interface InstrumentDefinition {
  id: InstrumentType;
  label: string;
  icon: string;
}

export const GEMINI_ALLOWED_INSTRUMENTS = [
  "guitar",
  "violin",
  "piano",
  "flute",
  "drums",
  "electric guitar",
  "banjo",
  "horn",
  "trumpet",
] as const;

