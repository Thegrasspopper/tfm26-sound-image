
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RefreshCw, Image as ImageIcon, Sparkles, AlertCircle, Music, Plus, Trash2, Volume2, VolumeX, Palette, Timer, Headphones, Square, Circle, Wand2, ChevronUp, Loader2, Download } from 'lucide-react';
// @ts-ignore
import MIDISoundsModule, { MIDISounds } from './services/midisoundsreact';
import { AppStatus, SonicTrack, InstrumentType, getInstrumentsForGenre, FilterState } from './types';
import { composeFromImage } from './services/geminiService';
import { synth } from './services/synthEngine';
import { getAllRequiredInstruments, getAllRequiredDrums } from './services/midiMapping';
import { SonicProfile } from './types';

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
  const [globalGenre, setGlobalGenre] = useState<string>("Modern Pop");
  const [masterVolume, setMasterVolume] = useState<number>(0.8);

  const midiSoundsRef = useRef<any>(null);
  const recordingIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (midiSoundsRef.current) {
        synth.setMidiSounds(midiSoundsRef.current);
    }
  }, [midiSoundsRef.current]);

  useEffect(() => {
    synth.setBpm(globalBpm);
  }, [globalBpm]);

  useEffect(() => {
    synth.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    synth.updateTracks(tracks);
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

  const waitForMidiEngine = async (timeoutMs: number = 8000) => {
    const startedAt = Date.now();
    while (!midiSoundsRef.current) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('MIDI engine did not initialize in time.');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    synth.setMidiSounds(midiSoundsRef.current);
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
    const wpApp = (window as any)?.WP_APP || {};
    const restUrl = wpApp.restUrl;
    const endpoint = wpApp.sequenceUploadEndpoint || (restUrl ? `${restUrl}suno/v1/upload-mp3?token=${encodeURIComponent(process.env.UPLOAD_TOKEN)}` : null);
    if (!endpoint) {
      throw new Error('WP upload endpoint not configured (window.WP_APP.sequenceUploadEndpoint or window.WP_APP.restUrl).');
    }

    const fileName = `sequence_${payload.trackId}_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.mp3`;
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('track_id', payload.trackId);
    formData.append('genre', payload.genre);
    formData.append('instrument', payload.instrument);
    formData.append('bpm', String(payload.bpm));
    formData.append('profile', JSON.stringify(payload.profile));

    const headers: Record<string, string> = {};
    if (wpApp.nonce) {
      headers['X-WP-Nonce'] = wpApp.nonce;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WP upload failed (${res.status}): ${errText || 'Unknown error'}`);
    }

    return res;
  };

  
  const autoExportAndUploadTrack = async (
    trackId: string,
    profile: SonicProfile,
    genre: string,
    volume: number
  ) => {
    setExportingTrackId(trackId);
    try {
      await waitForMidiEngine();
      const bpmToUse = profile.bpm || globalBpm;
      const blob = await synth.exportSequenceToMp3(
        profile.sequence,
        profile.suggestedInstrument,
        bpmToUse,
        volume
      );
      const uploadResult = await uploadSequenceBlobToWp(blob, {
        trackId,
        profile,
        genre,
        instrument: profile.suggestedInstrument,
        bpm: bpmToUse,
      });
      console.log(`Track ${trackId}: sequence MP3 exported and uploaded to WP. ${uploadResult.status} ${uploadResult.url}`);
    } catch (err: any) {
      console.error(`Track ${trackId}: auto export/upload failed`, err);
      setGlobalError(err?.message || 'Failed to export and upload sequence MP3.');
    } finally {
      setExportingTrackId(prev => (prev === trackId ? null : prev));
    }
  };



  // Add a new image.
  const addTrack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const id = Math.random().toString(36).substr(2, 9);
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageData = reader.result as string;
      const base64Data = imageData.split(',')[1];
      
      const tempTrack: SonicTrack = {
        id,
        image: imageData,
        status: AppStatus.ANALYZING,
        genre: globalGenre,
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
          status: AppStatus.READY,
          selectedInstrument: result.suggestedInstrument
        } : t));
        setGlobalError(null);
        void autoExportAndUploadTrack(id, result, globalGenre, 0.8);
      } catch (err: any) {
        setTracks(prev => prev.filter(t => t.id !== id));
        setGlobalError(err.message || "Failed to analyze image.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const regenerateTrack = async (id: string) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;

    setTracks(prev => prev.map(t => t.id === id ? { ...t, status: AppStatus.ANALYZING } : t));
    
    try {
      const base64Data = track.image.split(',')[1];
      const result = await composeFromImage(base64Data, track.genre);
      setTracks(prev => prev.map(t => t.id === id ? { 
        ...t, 
        profile: result, 
        status: AppStatus.READY,
        selectedInstrument: result.suggestedInstrument
      } : t));
      void autoExportAndUploadTrack(id, result, track.genre, track.volume ?? 0.8);
    } catch (err: any) {
      setTracks(prev => prev.map(t => t.id === id ? { ...t, status: AppStatus.READY } : t));
      setGlobalError("Style shift failed.");
    }
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

  const changeInstrument = (id: string, instrument: InstrumentType) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, selectedInstrument: instrument } : t));
  };

  const changeTrackGenre = (id: string, genre: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id === id) {
        const instruments = getInstrumentsForGenre(genre);
        return { ...t, genre, selectedInstrument: instruments[0].id };
      }
      return t;
    }));
  };

  const updateFilters = (id: string, key: keyof FilterState, val: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { 
      ...t, 
      filters: { ...t.filters, [key]: val }
    } : t));
  };

  const startPlayback = () => {
    const readyTracks = tracks.filter(t => t.status === AppStatus.READY);
    if (readyTracks.length === 0) return;
    setIsPlaying(true);
    synth.start(readyTracks, globalBpm, (step) => {
      setActiveStep(step);
    });
  };

  const stopPlayback = () => {
    if (isRecording) handleToggleRecording();
    synth.stop();
    setIsPlaying(false);
    setActiveStep(-1);
  };

  const handleToggleRecording = async () => {
    if (!isRecording) {
      setIsRecording(true);
      synth.startRecording();
    } else {
      setIsRecording(false);
      setIsEncoding(true);
      try {
        const blob = await synth.stopRecording();
        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          // Check for mp3/mpeg in the blob type for proper extension
          const isMp3 = blob.type.includes('mp3') || blob.type.includes('mpeg');
          const extension = isMp3 ? 'mp3' : 'webm';
          a.download = `SonicPalette_Master_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.${extension}`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);
        }
      } catch (e) {
        console.error("Recording export failed", e);
      } finally {
        setIsEncoding(false);
      }
    }
  };

  const exportTrackSequenceAsMp3 = async (track: SonicTrack) => {
    if (!track.profile?.sequence?.length) return;

    if (isPlaying) {
      stopPlayback();
    }

    setExportingTrackId(track.id);
    try {
      const blob = await synth.exportSequenceToMp3(
        track.profile.sequence,
        track.selectedInstrument,
        globalBpm,
        track.volume ?? 1
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `SonicPalette_Sequence_${track.id}_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.mp3`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (e: any) {
      console.error("Sequence MP3 export failed", e);
      setGlobalError(e?.message || "Failed to export sequence as MP3.");
    } finally {
      setExportingTrackId(null);
    }
  };

  const fetchSunoResults = async () => {
    const taskId = "2fac....";
    try {
      setSunoLoading(true);
      setSunoError(null);
      const restUrl = (window as any)?.WP_APP?.restUrl;
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

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-7xl mx-auto transition-all duration-1000">
      
      {MIDISounds && (
        <MIDISounds 
          ref={midiSoundsRef} 
          instruments={getAllRequiredInstruments()} 
          drums={getAllRequiredDrums()}
        />
      )}

      <svg className="hidden">
        {tracks.map((t: { id: any; filters: { r: number; g: number; b: number; }; }) => (
          <filter key={`filter-${t.id}`} id={`rgb-filter-${t.id}`}>
            <feColorMatrix type="matrix" values={`
              ${t.filters.r/100} 0 0 0 0
              0 ${t.filters.g/100} 0 0 0
              0 0 ${t.filters.b/100} 0 0
              0 0 0 1 0
            `} />
          </filter>
        ))}
      </svg>

      <div className="fixed inset-0 pointer-events-none opacity-20 transition-opacity duration-1000" style={{ 
        background: tracks.length > 0 
          ? `radial-gradient(circle at 50% 50%, rgb(${tracks[0].profile?.rgb.r || 15}, ${tracks[0].profile?.rgb.g || 23}, ${tracks[0].profile?.rgb.b || 42}), transparent)`
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
                disabled={tracks.filter(t => t.status === AppStatus.READY).length === 0 || isEncoding}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform active:scale-90 shadow-xl z-10 ${
                  isPlaying 
                    ? 'bg-red-500 text-white shadow-red-500/20' 
                    : 'bg-white text-slate-900 hover:bg-slate-100 shadow-white/10 disabled:opacity-20 disabled:cursor-not-allowed'
                }`}
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>

              <div className="flex items-center gap-2 relative">
                <button
                  onClick={handleToggleRecording}
                  disabled={tracks.filter(t => t.status === AppStatus.READY).length === 0 || isEncoding}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all transform active:scale-90 shadow-xl z-10 ${
                    isRecording 
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
                <Palette className="w-3 h-3 text-green-400" /> Default Genre
              </div>
              <select 
                value={globalGenre}
                onChange={(e) => setGlobalGenre(e.target.value)}
                className="bg-slate-800/50 text-white text-[12px] font-bold p-2 rounded-lg outline-none border border-white/10"
              >
                <option value="Techno">Techno</option>
                <option value="Pop">Pop</option>
                <option value="R&B">R&B</option>
                <option value="Reggae">Reggae</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full lg:w-auto">
            <label className="cursor-pointer group flex-1 lg:flex-initial">
              <input type="file" accept="image/*" className="hidden" onChange={addTrack} disabled={isProcessing} />
              <div className="bg-pink-600 hover:bg-pink-500 text-white transition-all flex items-center justify-center gap-3 py-4 px-8 rounded-2xl font-bold border border-white/10 shadow-lg active:scale-95 whitespace-nowrap">
                {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Analyze Image
              </div>
            </label>

            <button
              onClick={fetchSunoResults}
              disabled={sunoLoading}
              className={`flex items-center gap-2 py-3 px-4 rounded-2xl font-bold border border-white/10 shadow-lg ${sunoLoading ? 'bg-slate-700 text-slate-300 cursor-wait' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
            >
              {sunoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">Fetch Suno</span>
            </button>

            {sunoError && (
              <div className="text-xs text-red-400 ml-2">{sunoError}</div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {tracks.map((track) => {
            const currentInstruments = getInstrumentsForGenre(track.genre);
            return (
              <div 
                key={track.id} 
                className={`glass rounded-[2rem] overflow-hidden flex flex-col border-slate-700/30 transition-all duration-500 group relative ${
                  track.isMuted || (isAnySoloed && !track.isSoloed) ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'
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
                        <Palette className="w-3 h-3" /> Color Modulation
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {['brightness', 'contrast', 'saturation', 'r', 'g', 'b'].map((filter) => (
                        <div key={filter} className="space-y-1">
                          <div className="flex justify-between text-[8px] font-black text-slate-500 uppercase tracking-widest">
                            <span>{filter}</span>
                            <span className="text-pink-500">{track.filters[filter as keyof FilterState]}</span>
                          </div>
                          <input 
                            type="range" min="0" max="255" step="1" 
                            value={track.filters[filter as keyof FilterState]} 
                            onChange={(e) => updateFilters(track.id, filter as any, parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent pointer-events-none" />
                  
                  <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                      <button
                        onClick={() => exportTrackSequenceAsMp3(track)}
                        disabled={exportingTrackId === track.id || track.status !== AppStatus.READY}
                        className={`p-2 rounded-lg shadow-lg backdrop-blur-sm transition-all ${
                          exportingTrackId === track.id
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
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <select 
                        value={track.genre}
                        onChange={(e) => changeTrackGenre(track.id, e.target.value)}
                        className="bg-transparent text-pink-400 text-[10px] font-black outline-none cursor-pointer uppercase tracking-widest"
                      >
                        <option value="Techno" className="bg-slate-900">Techno</option>
                        <option value="Pop" className="bg-slate-900">Pop</option>
                        <option value="R&B" className="bg-slate-900">R&B</option>
                        <option value="Reggae" className="bg-slate-900">Reggae</option>
                        <option value="Dark Trap" className="bg-slate-900">Dark Trap</option>
                      </select>
                      <span className="opacity-20">|</span>
                      <select 
                        value={track.selectedInstrument}
                        onChange={(e) => changeInstrument(track.id, e.target.value as InstrumentType)}
                        className="bg-transparent text-white text-[10px] font-black outline-none cursor-pointer uppercase tracking-widest"
                      >
                        {currentInstruments.map(inst => (
                          <option key={inst.id} value={inst.id} className="bg-slate-900">
                            {inst.icon} {inst.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
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
                    <input 
                      type="range" min="0" max="2.0" step="0.01"
                      value={track.volume}
                      onChange={(e) => updateTrackVolume(track.id, parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>

                  <div className="grid grid-cols-[repeat(21,minmax(0,1fr))] gap-0.5 h-10">
                    {(track.profile?.sequence || Array(21).fill(null)).map((note, i) => (
                      <div 
                        key={i} 
                        className={`rounded-sm transition-all duration-150 relative ${
                          activeStep === i && !track.isMuted && (!isAnySoloed || track.isSoloed) ? 'bg-pink-500/60 shadow-lg shadow-pink-500/20 scale-y-110 z-10' : 'bg-slate-800/30'
                        }`}
                      >
                        {note && (
                          <div 
                            className={`absolute bottom-0 left-0 right-0 rounded-sm transition-all ${
                              activeStep === i && !track.isMuted && (!isAnySoloed || track.isSoloed) ? 'bg-white/50' : ''
                            }`}
                            style={{ 
                              height: `${Math.min(100, (note.intensity * 100))}%`,
                              backgroundColor: track.isMuted ? '#334155' : `rgb(${track.profile.rgb.r}, ${track.profile.rgb.g}, ${track.profile.rgb.b}, 0.4)`
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {tracks.length < 9 && !isProcessing && (
            <label className="border-2 border-dashed border-slate-700 rounded-[2rem] flex flex-col items-center justify-center p-12 text-center text-slate-500 hover:border-pink-500 hover:bg-pink-500/5 transition-all cursor-pointer group min-h-[350px]">
              <input type="file" accept="image/*" className="hidden" onChange={addTrack} />
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
