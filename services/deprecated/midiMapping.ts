
import { InstrumentType } from "../../types";

/**
 * Mapping TrapPalette instruments to General MIDI Program numbers 
 * and Drum Kit sounds used by midi-sounds-react.
 */
export const MIDI_MAP: Record<InstrumentType, { instrument?: number, drum?: number }> = {
  // Drums (using the midi-sounds internal drum IDs)
  kick: { drum: 5 },     // Bass Drum
  snare: { drum: 12 },   // Snare Drum
  hat: { drum: 35 },     // Closed Hi-Hat
  rim: { drum: 17 },     // Rimshot
  clap: { drum: 21 },    // Clap
  tom: { drum: 28 },     // Tom
  
  // Pitched Instruments (General MIDI Program Numbers)
  sub808: { instrument: 38 }, // Synth Bass 1
  sub: { instrument: 39 },    // Synth Bass 2
  rhodes: { instrument: 4 },  // Electric Piano 1
  string: { instrument: 48 }, // Ensemble Strings 1
  pluck: { instrument: 24 },  // Nylon Guitar
  bell: { instrument: 14 },   // Tubular Bells
  brass: { instrument: 62 },  // Synth Brass 1
  flute: { instrument: 73 },  // Flute
  vox: { instrument: 54 },    // Voice Oohs
  pad: { instrument: 89 },    // Pad 2 (Warm)
  acid: { instrument: 84 },   // Lead 5 (Charang)
  stab: { instrument: 55 },   // Synth Vox
  chord: { instrument: 95 },  // Pad 8 (Sweep)
  wind: { instrument: 122 },  // Seashore (Noise)
  noise: { instrument: 122 },
  drone: { instrument: 103 }, // Sci-Fi
  click: { instrument: 115 }, // Woodblock
};

export const getAllRequiredInstruments = () => {
  const instruments = new Set<number>();
  Object.values(MIDI_MAP).forEach(m => {
    if (m.instrument !== undefined) instruments.add(m.instrument);
  });
  return Array.from(instruments);
};

export const getAllRequiredDrums = () => {
  const drums = new Set<number>();
  Object.values(MIDI_MAP).forEach(m => {
    if (m.drum !== undefined) drums.add(m.drum);
  });
  return Array.from(drums);
};
