
import { MusicalNote, SonicTrack, InstrumentType } from "../../types";
import { MIDI_MAP } from "./midiMapping";

/**
 * GLOBAL AUDIO INTERCEPTOR
 * This monkey-patches the Web Audio API to capture every node that tries to play sound.
 * This is the only 100% reliable way to record third-party audio components.
 */
const interceptedNodes = new Set<AudioNode>();
const originalConnect = AudioNode.prototype.connect;

(AudioNode.prototype as any).connect = function (destination: any, output?: number, input?: number) {
  // Check if connecting to the main output
  const isDestination = 
    destination instanceof AudioDestinationNode || 
    (destination && destination.context && destination === destination.context.destination);

  if (isDestination) {
    interceptedNodes.add(this);
    // If the recording bus is already globally registered, connect to it immediately
    const globalBus = (window as any)._synthRecordingBus;
    if (globalBus && globalBus.context === this.context) {
      try {
        originalConnect.call(this, globalBus, output, input);
      } catch (e) {
        // Silently handle connection errors
      }
    }
  }
  return originalConnect.apply(this, arguments as any);
};

export class SynthEngine {
  private midiSounds: any = null;
  private isPlaying: boolean = false;
  private currentStep: number = 0;
  private timeoutId: any = null;
  private activeTracks: SonicTrack[] = [];
  private bpm: number = 140;
  private masterVolume: number = 0.8;

  // Recording State
  private isRecordingInternal: boolean = false;
  private recordingBus: GainNode | null = null;
  private recordingSourceNode: AudioNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private leftSamples: Float32Array[] = [];
  private rightSamples: Float32Array[] = [];
  private lameLoaderPromise: Promise<any> | null = null;

  public setMidiSounds(instance: any) {
    this.midiSounds = instance;
    if (this.midiSounds && this.midiSounds.audioContext) {
      this.initRecordingBus();
    }
  }

  private initRecordingBus() {
    if (this.recordingBus || !this.midiSounds?.audioContext) return;
    
    const ctx = this.midiSounds.audioContext;
    this.recordingBus = ctx.createGain();
    
    // Register the bus globally so the interceptor can see it
    (window as any)._synthRecordingBus = this.recordingBus;

    // Retroactively connect all nodes that were already playing/connected to speakers
    interceptedNodes.forEach(node => {
      if (node.context === ctx) {
        try {
          originalConnect.call(node, this.recordingBus!);
        } catch (e) {}
      }
    });

    console.log("SynthEngine: Global recording bus initialized.");
  }

  public async start(tracks: SonicTrack[], bpm: number, onStep: (step: number) => void) {
    if (!this.midiSounds) {
        console.warn("MIDI Engine not initialized");
        return;
    }
    
    if (this.midiSounds.audioContext.state === 'suspended') {
      await this.midiSounds.audioContext.resume();
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.activeTracks = tracks;
    this.bpm = bpm;

    const playStep = () => {
      if (!this.isPlaying) return;
      const stepDuration = 60 / (this.bpm * 2);
      const isAnySoloed = this.activeTracks.some(t => t.isSoloed);

      this.activeTracks.forEach(track => {
        const canPlay = isAnySoloed ? track.isSoloed : !track.isMuted;
        if (canPlay && track.profile) {
          const seqLen = track.profile.sequence.length;
          const note = track.profile.sequence[this.currentStep % seqLen];
          if (note && note.intensity > 0.05) {
            this.playMIDINote(note, track.selectedInstrument, track.volume ?? 1.0);
          }
        }
      });
      
      onStep(this.currentStep % 21);
      this.currentStep++;
      this.timeoutId = setTimeout(playStep, stepDuration * 1000);
    };
    playStep();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timeoutId) clearTimeout(this.timeoutId);
  }

  public setBpm(bpm: number) { this.bpm = bpm; }
  
  public setMasterVolume(vol: number) {
    this.masterVolume = vol;
    if (this.midiSounds) {
        this.midiSounds.setMasterVolume(vol);
    }
  }

  public updateTracks(tracks: SonicTrack[]) { 
    this.activeTracks = tracks; 
  }

  public startRecording(sourceNode?: AudioNode) {
    if (!this.midiSounds?.audioContext) {
      console.error("Audio context not ready.");
      return;
    }
    
    const ctx = this.midiSounds.audioContext;
    const captureSource = sourceNode || this.recordingBus;
    if (!captureSource) {
      console.error("Recording source not ready.");
      return;
    }

    this.leftSamples = [];
    this.rightSamples = [];
    this.isRecordingInternal = true;
    this.recordingSourceNode = captureSource;

    // ScriptProcessor is used here because it guarantees sample-accurate capture
    // of the mixed output, which MediaRecorder often fails at for Web Audio.
    this.processor = ctx.createScriptProcessor(4096, 2, 2);
    
    this.processor.onaudioprocess = (e) => {
      if (!this.isRecordingInternal) return;
      // We MUST copy the data because the buffers are reused by the browser
      this.leftSamples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      this.rightSamples.push(new Float32Array(e.inputBuffer.getChannelData(1)));
      
      // Zero out the output to prevent doubling the volume (feedback)
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      for(let i=0; i<4096; i++) { outL[i] = 0; outR[i] = 0; }
    };

    captureSource.connect(this.processor);
    // Connect to destination to keep the processor alive/active
    this.processor.connect(ctx.destination);
    
    console.log("SynthEngine: PCM capture active.");
  }

  public async stopRecording(): Promise<Blob | null> {
    if (!this.processor || !this.isRecordingInternal) return null;

    this.isRecordingInternal = false;
    const proc = this.processor;
    const source = this.recordingSourceNode;

    // Clean up nodes
    proc.disconnect();
    if (source) {
      try {
        source.disconnect(proc);
      } catch (e) {}
    }
    this.processor = null;
    this.recordingSourceNode = null;

    if (this.leftSamples.length === 0) {
      console.warn("No samples captured.");
      return null;
    }

    return this.encodeSamplesToMp3();
  }

  public async exportSequenceToMp3(
    sequence: MusicalNote[],
    instrument: InstrumentType,
    bpm: number,
    volume: number = 1
  ): Promise<Blob> {
    if (!this.midiSounds?.audioContext) {
      throw new Error("MIDI engine not initialized.");
    }
    if (!Array.isArray(sequence) || sequence.length === 0) {
      throw new Error("Sequence is empty.");
    }

    if (this.midiSounds.audioContext.state === "suspended") {
      await this.midiSounds.audioContext.resume();
    }
    this.initRecordingBus();

    const captureNode: AudioNode | null = this.midiSounds?.echo?.output || this.recordingBus;
    if (!captureNode) {
      throw new Error("Recording source unavailable.");
    }

    const previousVolume = this.masterVolume;
    this.setMasterVolume(0);
    this.startRecording(captureNode);
    await new Promise(resolve => setTimeout(resolve, 150));

    const stepDuration = 60 / (Math.max(1, bpm) * 2);
    sequence.forEach((note, index) => {
      const whenMs = Math.floor(index * stepDuration * 1000);
      setTimeout(() => {
        if (note && note.intensity > 0.05) {
          this.playMIDINote(note, instrument, volume);
        }
      }, whenMs);
    });

    const totalMs = Math.ceil(sequence.length * stepDuration * 1000) + 1200;
    await new Promise(resolve => setTimeout(resolve, totalMs));

    try {
      const blob = await this.stopRecording();
      if (!blob || blob.size === 0) {
        throw new Error("Failed to encode MP3.");
      }
      return blob;
    } finally {
      this.setMasterVolume(previousVolume);
    }
  }

  private async encodeSamplesToMp3(): Promise<Blob> {
    const lame = await this.getLameEncoder();

    const sampleRate = this.midiSounds.audioContext.sampleRate;
    const mp3encoder = new lame.Mp3Encoder(2, sampleRate, 128);
    const mp3Data: Uint8Array[] = [];

    // Combine chunks into full arrays
    const totalSamples = this.leftSamples.length * 4096;
    const flatL = new Float32Array(totalSamples);
    const flatR = new Float32Array(totalSamples);
    
    for (let i = 0; i < this.leftSamples.length; i++) {
      flatL.set(this.leftSamples[i], i * 4096);
      flatR.set(this.rightSamples[i], i * 4096);
    }

    const blockSize = 1152; // LAME-specific block size
    for (let i = 0; i < flatL.length; i += blockSize) {
      const leftInt = new Int16Array(blockSize);
      const rightInt = new Int16Array(blockSize);
      
      for (let j = 0; j < blockSize && (i + j) < flatL.length; j++) {
        // Convert and clamp Float32 to Int16
        leftInt[j] = Math.max(-32768, Math.min(32767, flatL[i + j] * 32768));
        rightInt[j] = Math.max(-32768, Math.min(32767, flatR[i + j] * 32768));
      }

      const mp3buf = mp3encoder.encodeBuffer(leftInt, rightInt);
      if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(new Uint8Array(endBuf));

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
  }

  private async getLameEncoder(): Promise<any> {
    const w = window as any;
    if (w.lamejs?.Mp3Encoder) return w.lamejs;

    if (!this.lameLoaderPromise) {
      this.lameLoaderPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-lamejs-loader="1"]') as HTMLScriptElement | null;

        const done = () => {
          if (w.lamejs?.Mp3Encoder) {
            resolve(w.lamejs);
          } else {
            reject(new Error("LAME encoder not loaded."));
          }
        };

        if (existing) {
          if ((existing as any)._loaded) {
            done();
            return;
          }
          existing.addEventListener("load", done, { once: true });
          existing.addEventListener("error", () => reject(new Error("Failed to load LAME encoder script.")), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
        script.async = true;
        script.setAttribute("data-lamejs-loader", "1");
        script.addEventListener("load", () => {
          (script as any)._loaded = true;
          done();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error("Failed to load LAME encoder script.")), { once: true });
        document.head.appendChild(script);
      });
    }

    return this.lameLoaderPromise;
  }

  private playMIDINote(note: MusicalNote, instrument: InstrumentType, trackVolume: number) {
    if (!this.midiSounds) return;

    const mapping = MIDI_MAP[instrument];
    const velocity = note.intensity * trackVolume;
    
    if (mapping.drum !== undefined) {
        this.midiSounds.playDrum(mapping.drum, 0, velocity);
    } else if (mapping.instrument !== undefined) {
        const midiNote = Math.round(12 * Math.log2(note.frequency / 440) + 69);
        this.midiSounds.playChordNow(mapping.instrument, [midiNote], note.duration || 0.5, velocity);
    }
  }
}

export const synth = new SynthEngine();
