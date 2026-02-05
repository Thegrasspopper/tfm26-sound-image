
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

export interface SonicProfile {
  feelings: string[];
  rgb: { r: number; g: number; b: number };
  musicGenre: string;
  bpm: number;
  waveform: WaveformType;
  sequence: MusicalNote[];
  textureDescription: string;
  suggestedInstrument: InstrumentType;
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

export const GENRE_INSTRUMENTS: Record<string, InstrumentDefinition[]> = {
  pop: [
    { id: 'kick', label: 'Punchy Kick', icon: '🥁' },
    { id: 'clap', label: 'Crisp Pop Clap', icon: '👏' },
    { id: 'hat', label: 'Bright Hat', icon: '✨' },
    { id: 'rhodes', label: 'Electric Keys', icon: '🎹' },
    { id: 'pluck', label: 'Acoustic Guitar', icon: '🎸' },
    { id: 'pad', label: 'Synth Glow', icon: '🌈' },
    { id: 'vox', label: 'Chop Vox', icon: '🎤' },
  ],
  techno: [
    { id: 'kick', label: 'Industrial Kick', icon: '🏭' },
    { id: 'noise', label: 'White Noise', icon: '🌪️' },
    { id: 'acid', label: '303 Acid Lead', icon: '🧪' },
    { id: 'stab', label: 'Warehouse Stab', icon: '🔪' },
    { id: 'hat', label: 'Driven Hat', icon: '🎩' },
    { id: 'drone', label: 'Dark Drone', icon: '🧘' },
  ],
  rnb: [
    { id: 'sub', label: 'Smooth Bass', icon: '🌊' },
    { id: 'rim', label: 'Silk Rim', icon: '🥁' },
    { id: 'rhodes', label: 'Rhodes Keys', icon: '🎹' },
    { id: 'vox', label: 'Soul Vox', icon: '🎤' },
    { id: 'string', label: 'Lush Strings', icon: '🎻' },
    { id: 'clap', label: 'Soft Clap', icon: '👏' },
  ],
  reggae: [
    { id: 'rim', label: 'Reggae Rim', icon: '🇯🇲' },
    { id: 'brass', label: 'Horn Section', icon: '🎺' },
    { id: 'pluck', label: 'Guitar Skank', icon: '🎸' },
    { id: 'sub', label: 'Dub Sub', icon: '🔉' },
    { id: 'click', label: 'Clave Perc', icon: '🪵' },
    { id: 'snare', label: 'Tuned Snare', icon: '🥁' },
  ],
  darktrap: [
    { id: 'sub808', label: 'Grimy 808', icon: '💣' },
    { id: 'kick', label: 'Distorted Kick', icon: '🥁' },
    { id: 'snare', label: 'Sharp Snare', icon: '🧨' },
    { id: 'hat', label: 'Rolling Hi-Hat', icon: '🛸' },
    { id: 'string', label: 'Gothic String', icon: '🎻' },
    { id: 'bell', label: 'Nightmare Bell', icon: '🔔' },
  ],
};

export const getInstrumentsForGenre = (genre: string): InstrumentDefinition[] => {
  const normalized = genre.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('pop')) return GENRE_INSTRUMENTS.pop;
  if (normalized.includes('techno')) return GENRE_INSTRUMENTS.techno;
  if (normalized.includes('rnb')) return GENRE_INSTRUMENTS.rnb;
  if (normalized.includes('reggae')) return GENRE_INSTRUMENTS.reggae;
  if (normalized.includes('dark') || normalized.includes('trap')) return GENRE_INSTRUMENTS.darktrap;
  return GENRE_INSTRUMENTS.pop;
};
