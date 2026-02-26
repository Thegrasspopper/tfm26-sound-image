
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RefreshCw, Image as Sparkles, Music, Plus, Trash2, Volume2, VolumeX, Palette, Timer, Headphones, Square, Circle, Wand2, ChevronUp, Loader2, Download, Upload } from 'lucide-react';
// @ts-ignore
import MIDISoundsModule, { MIDISounds } from './services/deprecated/midisoundsreact';
import { AppStatus, SonicTrack, InstrumentType, getInstrumentsForGenre, FilterState } from './types';
import { composeFromImage } from './services/geminiService';
import { SonicProfile } from './types';
import { runTextoToAuidoWithFalAce, FalTextToAudioAceResult } from './services/falService';
import { wavAudioEngine } from "./services/wavAudioEngine";
import AudioVisualizer from './components/AudioVisualizer';

// Handle potential ESM wrapping of the CJS library
const App: React.FC = () => {
  const [tracks, setTracks] = useState<SonicTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState<string | null>(null);
  const [sunoLoading, setSunoLoading] = useState(false);
  const [sunoError, setSunoError] = useState<string | null>(null);
  const [sunoItems, setSunoItems] = useState<any[] | null>(null);
  const [exportingTrackId, setExportingTrackId] = useState<string | null>(null);

  const [globalBpm, setGlobalBpm] = useState<number>(120);
  const [audioDurationSec, setAudioDurationSec] = useState<number>(10);
  const [showAdvancedAudio, setShowAdvancedAudio] = useState(false);
  const [audioGenInstrumental, setAudioGenInstrumental] = useState(true);
  const [audioGenGuidanceScale, setAudioGenGuidanceScale] = useState<number>(15);
  const [audioGenNumberOfSteps, setAudioGenNumberOfSteps] = useState<string>('');
  const [audioGenScheduler, setAudioGenScheduler] = useState<"euler" | "heun">("euler");
  const [audioGenGuidanceType, setAudioGenGuidanceType] = useState<"cfg" | "apg" | "cfg_star">("cfg");
  const [audioGenGranularityScale, setAudioGenGranularityScale] = useState<string>('');
  const [audioGenGuidanceInterval, setAudioGenGuidanceInterval] = useState<string>('');
  const [audioGenGuidanceIntervalDecay, setAudioGenGuidanceIntervalDecay] = useState<string>('');
  const [audioGenMinimumGuidanceScale, setAudioGenMinimumGuidanceScale] = useState<string>('');
  const [audioGenTagGuidanceScale, setAudioGenTagGuidanceScale] = useState<string>('');
  const [audioGenLyricGuidanceScale, setAudioGenLyricGuidanceScale] = useState<string>('');
  const [globalGenre, setGlobalGenre] = useState<string>("Modern Pop");
  const [masterVolume, setMasterVolume] = useState<number>(0.8);

  const midiSoundsRef = useRef<any>(null);
  const recordingIntervalRef = useRef<any>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (midiSoundsRef.current) {
      //synth.setMidiSounds(midiSoundsRef.current);
    }
  }, [midiSoundsRef.current]);

  useEffect(() => {
    wavAudioEngine.setTargetBpm(globalBpm);
  }, [globalBpm]);

  useEffect(() => {
    wavAudioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    wavAudioEngine.updateTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const parseOptionalAudioParam = (value: string) => {
    if (value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const exportProject = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      globalBpm,
      globalGenre,
      masterVolume,
      tracks,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonic-palette-project-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const restoreTrackAudio = async (nextTracks: SonicTrack[]) => {
    const withAudio = nextTracks.filter((t) => typeof t.audioUrl === 'string' && t.audioUrl.length > 0);
    if (withAudio.length === 0) return;

    await Promise.allSettled(
      withAudio.map((track) => wavAudioEngine.loadTrackFromUrl(track.id, track.audioUrl as string))
    );
  };

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.tracks)) {
        throw new Error('Invalid project file.');
      }

      const importedTracks: SonicTrack[] = parsed.tracks.map((t: any, index: number) => ({
        id: String(t.id || `track_${index}_${Date.now()}`),
        image: String(t.image || ''),
        profile: t.profile,
        audioUrl: typeof t.audioUrl === 'string' ? t.audioUrl : undefined,
        audioPrompt: typeof t.audioPrompt === 'string' ? t.audioPrompt : undefined,
        targetBpm: typeof t.targetBpm === 'number' ? t.targetBpm : undefined,
        pitchSemitones: typeof t.pitchSemitones === 'number' ? t.pitchSemitones : 0,
        selectedInstrument: t.selectedInstrument,
        genre: String(t.genre || parsed.globalGenre || globalGenre),
        isMuted: !!t.isMuted,
        isSoloed: !!t.isSoloed,
        volume: typeof t.volume === 'number' ? t.volume : 0.8,
        status: t.status ?? AppStatus.READY,
        filters: t.filters ?? { brightness: 100, contrast: 100, saturation: 100, r: 100, g: 100, b: 100 },
      }));

      stopPlayback();
      const nextGlobalBpm = typeof parsed.globalBpm === 'number' ? parsed.globalBpm : globalBpm;
      const nextGenre = typeof parsed.globalGenre === 'string' ? parsed.globalGenre : globalGenre;
      const nextMasterVolume = typeof parsed.masterVolume === 'number' ? parsed.masterVolume : masterVolume;

      setGlobalBpm(nextGlobalBpm);
      setGlobalGenre(nextGenre);
      setMasterVolume(nextMasterVolume);
      setTracks(importedTracks);
      wavAudioEngine.updateTracks(importedTracks);
      await restoreTrackAudio(importedTracks);
      // Force a rerender after async audio buffers finish loading so the Play button re-evaluates.
      setTracks((prev) => [...prev]);
      setGlobalError(null);
      startPlayback();
    } catch (err: any) {
      console.error('Project import failed', err);
      setGlobalError(err?.message || 'Failed to import project.');
    } finally {
      e.target.value = '';
    }
  };

  const getWpAppConfig = () => {
    const windowWpApp = (window as any)?.WP_APP || {};
    const envWpApp = {
      restUrl: process.env.WP_APP_REST_URL,
    };

    // Local .env.local values provide defaults; runtime window.WP_APP can override them.
    return { ...envWpApp, ...windowWpApp };
  };

  const uploadSequenceBlobToWp = async (
    blob: Blob,
    payload: {
      trackId: string;
      profile: SonicProfile;
      genre: string;
      instrument: InstrumentType;
      bpm: number;
    }
  ) => {
    const wpApp = getWpAppConfig();
    const restUrl = wpApp.restUrl;
    const endpoint = wpApp.sequenceUploadEndpoint || (restUrl ? `${restUrl}suno/v1/upload-mp3?token=${encodeURIComponent(process.env.UPLOAD_TOKEN)}` : null);
    if (!endpoint) {
      throw new Error('WP upload endpoint not configured (window.WP_APP.sequenceUploadEndpoint or window.WP_APP.restUrl).');
    }

    const fileName = `sequence_${payload.trackId}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.mp3`;
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('track_id', payload.trackId);
    formData.append('genre', payload.genre);
    formData.append('instrument', payload.instrument);
    formData.append('bpm', String(payload.bpm));
    formData.append('profile', JSON.stringify(payload.profile));

    const headers: Record<string, string> = {};

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WP upload failed (${response.status}): ${errText || 'Unknown error'}`);
    }

    return response.json();
  };


  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });

  const addTrackFromFile = async (file: File) => {
    const id = Math.random().toString(36).substr(2, 9);
    const imageData = await readFileAsDataUrl(file);
    const base64Data = imageData.split(',')[1];

    const tempTrack: SonicTrack = {
      id,
      image: imageData,
      status: AppStatus.ANALYZING,
      genre: globalGenre,
      targetBpm: globalBpm,
      pitchSemitones: 0,
      isMuted: false,
      isSoloed: false,
      volume: 0.8,
      profile: null as any,
      selectedInstrument: 'kick' as InstrumentType,
      filters: { brightness: 100, contrast: 100, saturation: 100, r: 100, g: 100, b: 100 }
    };
    setTracks(prev => [...prev, tempTrack]);

    try {
      const result = await composeFromImage(base64Data, globalGenre);
      console.log("Result:", result);
      setTracks(prev => prev.map(t => t.id === id ? {
        ...t,
        profile: result,
        targetBpm: t.targetBpm,
        status: AppStatus.READY,
      } : t));

      const audioPrompt = `Create a ${result.emotion.label.toLowerCase()}-inspired minimalist instrumental in ${result.musicalParameters.mode} mode at ${result.musicalParameters.tempo} BPM. 
          Use ${result.soundDesign.instrument} as the main element, played in the ${result.musicalParameters.register} register with ${result.musicalParameters.articulation} articulation. 
          Texture should be ${result.soundDesign.texture} with ${result.soundDesign.space}. 
          Keep it as a single realistic, mix-ready instrumental layer.`;

      const aduioPrompt3 = `Create a ${result.emotion.label.toLowerCase()} instrumental layer 
            with energy level ${result.emotion.arousal}/100 
            and harmonic tension level ${result.musicalParameters.harmonic_tension}/10.

            Use ${result.soundDesign.instrument} with ${result.soundDesign.waveform}.
            Tempo ${result.musicalParameters.tempo} BPM.
            Keep rhythmic density at level ${result.musicalParameters.rhythmic_density}/10.
            Minimalist structure, single layer, production-ready realism.`

      const optionalAceParams = {
        number_of_steps: parseOptionalAudioParam(audioGenNumberOfSteps),
        granularity_scale: parseOptionalAudioParam(audioGenGranularityScale),
        guidance_interval: parseOptionalAudioParam(audioGenGuidanceInterval),
        guidance_interval_decay: parseOptionalAudioParam(audioGenGuidanceIntervalDecay),
        minimum_guidance_scale: parseOptionalAudioParam(audioGenMinimumGuidanceScale),
        tag_guidance_scale: parseOptionalAudioParam(audioGenTagGuidanceScale),
        lyric_guidance_scale: parseOptionalAudioParam(audioGenLyricGuidanceScale),
      };
      const falInput: FalTextToAudioAceResult = {
        prompt: audioPrompt,
        guidance_scale: Math.max(0, audioGenGuidanceScale),
        instrumental: audioGenInstrumental,
        duration: Math.max(1, Math.min(60, Math.round(audioDurationSec))),
        scheduler: audioGenScheduler,
        guidance_type: audioGenGuidanceType,
        ...(optionalAceParams.number_of_steps !== undefined ? { number_of_steps: Math.round(optionalAceParams.number_of_steps) } : {}),
        ...(optionalAceParams.granularity_scale !== undefined ? { granularity_scale: optionalAceParams.granularity_scale } : {}),
        ...(optionalAceParams.guidance_interval !== undefined ? { guidance_interval: optionalAceParams.guidance_interval } : {}),
        ...(optionalAceParams.guidance_interval_decay !== undefined ? { guidance_interval_decay: optionalAceParams.guidance_interval_decay } : {}),
        ...(optionalAceParams.minimum_guidance_scale !== undefined ? { minimum_guidance_scale: optionalAceParams.minimum_guidance_scale } : {}),
        ...(optionalAceParams.tag_guidance_scale !== undefined ? { tag_guidance_scale: optionalAceParams.tag_guidance_scale } : {}),
        ...(optionalAceParams.lyric_guidance_scale !== undefined ? { lyric_guidance_scale: optionalAceParams.lyric_guidance_scale } : {}),
      };

      const falResult = await runTextoToAuidoWithFalAce(falInput);
      console.log("Result: ", falResult);
      setTracks(prev => prev.map(t => t.id === id ? { ...t, audioUrl: falResult.audio.url, audioPrompt2: audioPrompt } : t));
      setGlobalError(null);
      await wavAudioEngine.loadTrackFromUrl(id, falResult.audio.url);
      startPlayback();
    } catch (err: any) {
      setTracks(prev => prev.filter(t => t.id !== id));
      setGlobalError(err.message || "Failed to analyze image.");
    }
  };

  // Add one or more images from a single file picker action.
  const addTrack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []) as File[];
    if (files.length === 0) return;

    setIsProcessing(true);
    try {
      for (const file of files) {
        await addTrackFromFile(file);
      }
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const regenerateTrack = async (id: string) => {
    // TODO add function to regenerate the picture and allow user to configured some of the setting before sending.
    console.log("Not in use")
  };

  const removeTrack = (id: string) => {
    const newTracks = tracks.filter(t => t.id !== id);
    setTracks(newTracks);
    if (newTracks.length === 0) {
      stopPlayback();
    }
  };

  const toggleMute = (id: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, isMuted: !t.isMuted } : t));
  };

  const toggleSolo = (id: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, isSoloed: !t.isSoloed } : t));
  };

  const updateTrackVolume = (id: string, volume: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, volume } : t));
  };

  const changeTrackBpm = (id: string, bpm: number) => {
    const next = Math.max(40, Math.min(240, Math.round(bpm || 0)));
    setTracks(prev => prev.map(t => t.id === id ? { ...t, targetBpm: next } : t));
  };

  const changeTrackPitch = (id: string, semitones: number) => {
    const next = Math.max(-12, Math.min(12, Math.round(semitones || 0)));
    setTracks(prev => prev.map(t => t.id === id ? { ...t, pitchSemitones: next } : t));
  };

  const updateFilters = (id: string, key: keyof FilterState, val: number) => {
    setTracks(prev => prev.map(t => t.id === id ? {
      ...t,
      filters: { ...t.filters, [key]: val }
    } : t));
  };

  const startPlayback = () => {
    if (!wavAudioEngine.hasAnyLoadedBuffer()) return;
    setActiveStep(-1);
    setIsPlaying(true);
    wavAudioEngine.playAll().catch((err) => {
      console.error("WAV playback failed", err);
      setIsPlaying(false);
      setGlobalError(err?.message || "Failed to play WAV audio.");
    });
  };

  const stopPlayback = () => {
    if (isRecording) handleToggleRecording();
    wavAudioEngine.stopAll();
    setIsPlaying(false);
    setActiveStep(-1);
  };

  const handleToggleRecording = async () => {
    if (!isRecording) {
      try {
        await wavAudioEngine.startRecording();
        setIsRecording(true);
        setGlobalError(null);
      } catch (err: any) {
        console.error("Recording start failed", err);
        setGlobalError(err?.message || "Failed to start recording.");
      }
      return;
    }

    setIsRecording(false);
    setIsEncoding(true);
    try {
      const blob = await wavAudioEngine.stopRecording();
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const isOgg = blob.type.includes('ogg');
        const isWebm = blob.type.includes('webm');
        const extension = isOgg ? 'ogg' : isWebm ? 'webm' : 'webm';
        a.download = `SonicPalette_WAV_Mix_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      }
    } catch (err: any) {
      console.error("Recording stop/export failed", err);
      setGlobalError(err?.message || "Failed to export recording.");
    } finally {
      setIsEncoding(false);
    }
  };

  const exportTrackSequenceAsMp3 = async (track: SonicTrack) => {
    if (!track.audioUrl) {
      setGlobalError("No generated audio URL is available for this track.");
      return;
    }

    try {
      setExportingTrackId(track.id);
      setGlobalError(null);

      const response = await fetch(track.audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download track audio (${response.status})`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;

      const guessedExtension =
        blob.type.includes('wav') ? 'wav'
        : blob.type.includes('mpeg') ? 'mp3'
        : blob.type.includes('ogg') ? 'ogg'
        : 'wav';

      a.download = `track_${track.id}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${guessedExtension}`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }, 100);
    } catch (err: any) {
      console.error("Track audio export failed", err);
      setGlobalError(err?.message || "Failed to export track audio.");
    } finally {
      setExportingTrackId(null);
    }
  };

  const fetchSunoResults = async () => {
    const taskId = "2fac....";
    try {
      setSunoLoading(true);
      setSunoError(null);
      const restUrl = getWpAppConfig().restUrl;
      if (!restUrl) throw new Error('REST URL not configured (window.WP_APP.restUrl)');
      const res = await fetch(`${restUrl}suno/v1/results?task_id=${encodeURIComponent(taskId)}`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = await res.json();
      console.log(json.items);
      setSunoItems(json.items || []);
    } catch (err: any) {
      console.error(err);
      setSunoError(err?.message || 'Failed to fetch Suno results');
    } finally {
      setSunoLoading(false);
    }
  };

  const isAnySoloed = tracks.some(t => t.isSoloed);
  const canPlayWav = wavAudioEngine.hasAnyLoadedBuffer() && !isEncoding;

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-7xl mx-auto transition-all duration-1000">
      <div className="fixed inset-0 pointer-events-none opacity-20 transition-opacity duration-1000" style={{
        background: tracks.length > 0
          ? `radial-gradient(circle at 50% 50%, transparent)`
          : '#0f172a'
      }} />

      <header className="w-full text-center mb-8 z-10">
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="bg-pink-600 p-3 rounded-2xl shadow-xl shadow-pink-500/20">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 uppercase">
            SonicPalette <span className="text-xs font-mono align-top text-slate-500 ml-2">PRO STUDIO</span>
          </h1>
        </div>
        <p className="text-slate-400 font-medium tracking-widest uppercase text-[10px]">Neural Composition • Techno • Pop • R&B • Reggae</p>
      </header>

      <main className="w-full flex flex-col gap-6 z-10">

        <section className="glass p-6 rounded-[2.5rem] flex flex-col lg:flex-row items-center justify-between gap-8 border-slate-700/30 shadow-2xl overflow-hidden relative">
          <div className="flex flex-wrap items-center gap-6 lg:gap-10">
            <div className="flex items-center gap-4">
              <button
                onClick={isPlaying ? stopPlayback : startPlayback}
                disabled={!canPlayWav}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform active:scale-90 shadow-xl z-10 ${isPlaying
                    ? 'bg-red-500 text-white shadow-red-500/20'
                    : canPlayWav
                      ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-emerald-500/30 ring-2 ring-emerald-200/40'
                      : 'bg-slate-700 text-slate-500 shadow-none opacity-50 cursor-not-allowed'
                  }`}
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>

              <div className="flex items-center gap-2 relative">
                <button
                  onClick={handleToggleRecording}
                  disabled={!wavAudioEngine.hasAnyLoadedBuffer() || isEncoding}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all transform active:scale-90 shadow-xl z-10 ${isRecording
                      ? 'bg-red-600 text-white shadow-red-600/40'
                      : isEncoding
                        ? 'bg-slate-700 text-pink-400 cursor-wait'
                        : 'bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20'
                    }`}
                >
                  {isEncoding ? <Loader2 className="w-5 h-5 animate-spin" /> : isRecording ? <Square className="w-5 h-5 fill-current" /> : <Circle className="w-5 h-5 fill-current" />}
                </button>
                {isRecording && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                )}
              </div>

              {(isRecording || isEncoding) && (
                <div className="hidden sm:block font-mono text-pink-500 font-bold tabular-nums">
                  {isEncoding ? "ENCODING MP3..." : formatTime(recordingTime)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <Timer className="w-3 h-3" /> Master BPM
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range" min="60" max="160" step="1"
                  value={globalBpm}
                  onChange={(e) => setGlobalBpm(parseInt(e.target.value))}
                  className="w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
                <span className="text-2xl font-black text-white w-10 text-center">{globalBpm}</span>
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800 hidden lg:block" />

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <Volume2 className="w-3 h-3 text-indigo-400" /> Master Volume
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range" min="0" max="1.5" step="0.01"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                  className="w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-2xl font-black text-white w-10 text-center">{(masterVolume * 100).toFixed(0)}</span>
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800 hidden lg:block" />

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <Timer className="w-3 h-3 text-emerald-400" /> Audio Duration
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={audioDurationSec}
                  onChange={(e) => {
                    const next = parseInt(e.target.value || '1', 10);
                    setAudioDurationSec(Math.max(1, Math.min(60, Number.isFinite(next) ? next : 10)));
                  }}
                  className="w-16 bg-slate-800/50 text-white text-[12px] font-bold p-2 rounded-lg outline-none border border-white/10"
                />
                <span className="text-sm font-black text-white w-8 text-center tabular-nums">{audioDurationSec}</span>
                <span className="text-xs font-black tracking-widest uppercase text-slate-400">sec</span>
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800 hidden lg:block" />

            <div className="h-10 w-px bg-slate-800 hidden lg:block" />

            <div className="space-y-2 min-w-[280px]">
              <button
                type="button"
                onClick={() => setShowAdvancedAudio(prev => !prev)}
                className="w-full flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 hover:bg-slate-700/60"
              >
                <span className="flex items-center gap-2">
                  <Wand2 className="w-3 h-3 text-pink-400" />
                  Advanced Audio
                </span>
                <ChevronUp className={`w-4 h-4 transition-transform ${showAdvancedAudio ? 'rotate-180' : ''}`} />
              </button>

              {showAdvancedAudio && (
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3 grid grid-cols-2 gap-3">
                  <label className="col-span-2 flex items-center justify-between text-xs text-slate-200">
                    <span>Instrumental</span>
                    <input
                      type="checkbox"
                      checked={audioGenInstrumental}
                      onChange={(e) => setAudioGenInstrumental(e.target.checked)}
                      className="h-4 w-4 accent-pink-500"
                    />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Guidance</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={audioGenGuidanceScale}
                      onChange={(e) => setAudioGenGuidanceScale(Math.max(0, parseFloat(e.target.value || '0')))}
                      className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none"
                    />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Steps</span>
                    <input
                      type="number"
                      min="1"
                      value={audioGenNumberOfSteps}
                      onChange={(e) => setAudioGenNumberOfSteps(e.target.value)}
                      placeholder="default"
                      className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none"
                    />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Scheduler</span>
                    <select
                      value={audioGenScheduler}
                      onChange={(e) => setAudioGenScheduler(e.target.value as "euler" | "heun")}
                      className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none"
                    >
                      <option value="euler">euler</option>
                      <option value="heun">heun</option>
                    </select>
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Guidance Type</span>
                    <select
                      value={audioGenGuidanceType}
                      onChange={(e) => setAudioGenGuidanceType(e.target.value as "cfg" | "apg" | "cfg_star")}
                      className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none"
                    >
                      <option value="cfg">cfg</option>
                      <option value="apg">apg</option>
                      <option value="cfg_star">cfg_star</option>
                    </select>
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Granularity</span>
                    <input type="number" step="0.1" value={audioGenGranularityScale} onChange={(e) => setAudioGenGranularityScale(e.target.value)} placeholder="default" className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none" />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Guidance Interval</span>
                    <input type="number" step="0.01" value={audioGenGuidanceInterval} onChange={(e) => setAudioGenGuidanceInterval(e.target.value)} placeholder="default" className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none" />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Interval Decay</span>
                    <input type="number" step="0.01" value={audioGenGuidanceIntervalDecay} onChange={(e) => setAudioGenGuidanceIntervalDecay(e.target.value)} placeholder="default" className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none" />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Min Guidance</span>
                    <input type="number" step="0.1" value={audioGenMinimumGuidanceScale} onChange={(e) => setAudioGenMinimumGuidanceScale(e.target.value)} placeholder="default" className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none" />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Tag Guidance</span>
                    <input type="number" step="0.1" value={audioGenTagGuidanceScale} onChange={(e) => setAudioGenTagGuidanceScale(e.target.value)} placeholder="default" className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none" />
                  </label>

                  <label className="text-[10px] text-slate-300 space-y-1">
                    <span className="uppercase tracking-widest">Lyric Guidance</span>
                    <input type="number" step="0.1" value={audioGenLyricGuidanceScale} onChange={(e) => setAudioGenLyricGuidanceScale(e.target.value)} placeholder="default" className="w-full bg-slate-800 text-white rounded px-2 py-1.5 text-xs border border-white/10 outline-none" />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 w-full lg:w-auto">
            <button
              onClick={exportProject}
              disabled={tracks.length === 0}
              className={`flex items-center gap-2 py-3 px-4 rounded-2xl font-bold border border-white/10 shadow-lg ${tracks.length === 0
                  ? 'bg-slate-700 text-slate-300 cursor-not-allowed'
                  : 'bg-emerald-700 text-white hover:bg-emerald-600'
                }`}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <input
              ref={projectImportInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportProject}
            />
            <button
              onClick={() => projectImportInputRef.current?.click()}
              className="flex items-center gap-2 py-3 px-4 rounded-2xl font-bold border border-white/10 shadow-lg bg-slate-800 text-white hover:bg-slate-700"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {tracks.map((track) => {
            const currentInstruments = getInstrumentsForGenre(track.genre);
            return (
              <div
                key={track.id}
                className={`glass rounded-[2rem] overflow-hidden flex flex-col border-slate-700/30 transition-all duration-500 group relative ${track.isMuted || (isAnySoloed && !track.isSoloed) ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'
                  } ${track.isSoloed ? 'ring-2 ring-pink-500/50' : ''}`}
              >
                {track.status === AppStatus.ANALYZING && (
                  <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md z-30 flex flex-col items-center justify-center gap-4 text-center p-6">
                    <RefreshCw className="w-10 h-10 text-pink-400 animate-spin" />
                    <p className="text-sm font-bold text-white uppercase tracking-widest animate-pulse">Scanning Visual DNA...</p>
                  </div>
                )}

                <div className="relative aspect-video overflow-hidden bg-black">
                  <img
                    src={track.image}
                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                    style={{
                      filter: `brightness(${track.filters.brightness}%) contrast(${track.filters.contrast}%) saturate(${track.filters.saturation}%) url(#rgb-filter-${track.id})`
                    }}
                  />

                  <div className={`absolute bottom-0 left-0 right-0 glass-dark backdrop-blur-2xl border-t border-white/10 z-20 p-4 transition-transform duration-500 ${showSettings === track.id ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}>
                    <button
                      onClick={() => setShowSettings(showSettings === track.id ? null : track.id)}
                      className="w-full h-8 -mt-4 flex items-center justify-center text-slate-400 hover:text-white group/btn"
                    >
                      <ChevronUp className={`w-4 h-4 transition-transform ${showSettings === track.id ? 'rotate-180' : ''}`} />
                    </button>

                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-400 flex items-center gap-2">
                        <Music className="w-3 h-3" /> Audio Prompt
                      </h4>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">
                        Prompt used for text-to-audio
                      </p>
                      <p className="text-xs leading-relaxed text-slate-200 break-words">
                        {track.audioPrompt2 || 'No audio prompt saved for this track yet.'}
                      </p>
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent pointer-events-none" />

                  <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                    <button
                      onClick={() => exportTrackSequenceAsMp3(track)}
                      disabled={exportingTrackId === track.id || track.status !== AppStatus.READY}
                      className={`p-2 rounded-lg shadow-lg backdrop-blur-sm transition-all ${exportingTrackId === track.id
                          ? 'bg-slate-700 text-slate-300 cursor-wait'
                          : 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                        }`}
                    >
                      {exportingTrackId === track.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => regenerateTrack(track.id)}
                      className="p-2 bg-pink-600/90 hover:bg-pink-500 text-white rounded-lg shadow-lg backdrop-blur-sm transition-all"
                    >
                      <Wand2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeTrack(track.id)}
                      className="p-2 bg-slate-800/80 text-slate-400 hover:text-red-400 rounded-lg backdrop-blur-sm transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-5 bg-slate-900/40 flex flex-col gap-4">

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSolo(track.id)}
                        className={`p-2 rounded-lg transition-all ${track.isSoloed ? 'bg-pink-500 text-slate-900' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                      >
                        <Headphones className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleMute(track.id)}
                        className={`p-2 rounded-lg transition-all ${track.isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                      >
                        {track.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] normal-case tracking-normal">
                      <span className="text-slate-400">BPM</span>
                      <input
                        type="range"
                        min="40"
                        max="240"
                        step="1"
                        value={track.targetBpm ?? track.profile?.bpm ?? globalBpm}
                        onChange={(e) => changeTrackBpm(track.id, parseInt(e.target.value || '0', 10))}
                        className="w-16 bg-slate-800 text-white rounded px-1 py-1 text-[15px] font-bold outline-none"
                      />
                      <span className="text-white text-xs font-bold w-8 text-center tabular-nums">
                        {Math.round(track.targetBpm ?? track.profile?.bpm ?? globalBpm)}
                      </span>
                    </label>
                  </div>
                  <div>

                    <label className="flex items-center gap-2 text-[10px] normal-case tracking-normal">
                      <Timer className="w-3 h-3 text-slate-80" />
                      <input
                        type="range" min="0" max="2.0" step="0.01"
                        value={track.volume}
                        onChange={(e) => updateTrackVolume(track.id, parseFloat(e.target.value))}
                        className="w-16 bg-slate-800 text-white rounded px-2 py-1 text-[15px] font-bold outline-none"
                      />
                      <span className="text-white text-xs font-bold w-8 text-center tabular-nums">
                        {(track.volume * 100).toFixed(0)}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-[10px] normal-case tracking-normal">
                      <Music className="w-3 h-3 text-slate-200" />
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="1"
                        value={track.pitchSemitones ?? 0}
                        onChange={(e) => changeTrackPitch(track.id, parseInt(e.target.value || '0', 10))}
                        className="w-16 bg-slate-800 text-white rounded px-2 py-1 text-[15px] font-bold outline-none"
                      />
                      <span className="text-white text-xs font-bold w-10 text-center tabular-nums">
                        {(track.pitchSemitones ?? 0) > 0 ? `+${track.pitchSemitones}` : (track.pitchSemitones ?? 0)}
                      </span>
                    </label>
                  </div>

                  <AudioVisualizer
                    isPlaying={wavAudioEngine.isTrackPlaying(track.id)}
                    audioBuffer={wavAudioEngine.getTrackAudioBuffer(track.id)}
                    audioContext={wavAudioEngine.getAudioContextIfAvailable()}
                    getCurrentTime={() => wavAudioEngine.getTrackCurrentTime(track.id)}
                  />
                </div>
              </div>
            );
          })}

          {tracks.length < 9 && !isProcessing && (
            <label className="border-2 border-dashed border-slate-700 rounded-[2rem] flex flex-col items-center justify-center p-12 text-center text-slate-500 hover:border-pink-500 hover:bg-pink-500/5 transition-all cursor-pointer group min-h-[350px]">
              <input type="file" accept="image/*" multiple className="hidden" onChange={addTrack} />
              <div className="bg-slate-800 p-6 rounded-full group-hover:bg-pink-500 group-hover:text-white transition-all mb-4">
                <Plus className="w-8 h-8" />
              </div>
              <p className="font-bold text-sm uppercase tracking-widest mb-1">Upload Visual</p>
              <p className="text-[10px] opacity-60">Ready to Sequence</p>
            </label>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
