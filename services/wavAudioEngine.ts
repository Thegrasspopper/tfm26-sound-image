import type { SonicTrack } from "../types";

export class WavAudioPlayer {
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private highPassNode: BiquadFilterNode | null = null;
  private lowShelfNode: BiquadFilterNode | null = null;
  private highShelfNode: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private reverbSendNode: GainNode | null = null;

  private startedAt = 0;
  private playStartOffset = 0;
  private pausedOffset = 0;
  private isPlayingInternal = false;
  private volume = 1;
  private trimGain = 1;
  private playbackRate = 1;
  private detuneCents = 0;
  private lowEqGainDb = 0;
  private highEqGainDb = 0;

  constructor(
    private readonly getContextFn: () => AudioContext,
    private readonly getMixInputFn: () => GainNode,
    private readonly getReverbInputFn: () => GainNode
  ) {}

  public async loadFromUrl(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load WAV (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return this.decode(arrayBuffer);
  }

  public async loadFromFile(file: File): Promise<AudioBuffer> {
    const isWav =
      file.name.toLowerCase().endsWith(".wav") ||
      file.type === "audio/wav" ||
      file.type === "audio/x-wav" ||
      file.type === "audio/wave";

    if (!isWav) {
      throw new Error("Only WAV files are supported.");
    }
    return this.decode(await file.arrayBuffer());
  }

  public async loadFromBlob(blob: Blob): Promise<AudioBuffer> {
    return this.decode(await blob.arrayBuffer());
  }

  public async play(): Promise<void> {
    if (!this.audioBuffer) {
      throw new Error("No WAV loaded.");
    }

    const ctx = this.getContextFn();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (this.isPlayingInternal) return;

    const source = ctx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.loop = true;
    source.playbackRate.value = this.playbackRate;
    source.detune.value = this.detuneCents;
    source.connect(this.getHighPassNode());

    source.onended = () => {
      if (this.sourceNode !== source) return;
      this.sourceNode = null;
      this.isPlayingInternal = false;
      this.pausedOffset = 0;
    };

    this.sourceNode = source;
    this.playStartOffset = this.pausedOffset;
    this.startedAt = ctx.currentTime;
    this.isPlayingInternal = true;
    source.start(0, this.pausedOffset);
  }

  public pause(): void {
    const ctx = this.getContextFn();
    if (!this.isPlayingInternal || !this.sourceNode) return;

    const duration = this.audioBuffer?.duration ?? 0;
    const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.getEffectivePlaybackRate();
    const position = this.playStartOffset + elapsed;
    this.pausedOffset = duration > 0 ? position % duration : 0;
    this.isPlayingInternal = false;

    const source = this.sourceNode;
    this.sourceNode = null;
    source.onended = null;
    source.stop();
    source.disconnect();
  }

  public stop(): void {
    if (this.sourceNode) {
      const source = this.sourceNode;
      this.sourceNode = null;
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.isPlayingInternal = false;
    this.playStartOffset = 0;
    this.pausedOffset = 0;
  }

  public seek(seconds: number): void {
    if (!this.audioBuffer) return;
    const clamped = Math.max(0, Math.min(seconds, this.audioBuffer.duration));
    const wasPlaying = this.isPlayingInternal;
    if (wasPlaying) this.stop();
    this.pausedOffset = clamped;
    if (wasPlaying) void this.play();
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(volume, 2));
    this.applyOutputGain();
  }

  public setPlaybackRate(rate: number): void {
    const nextRate = Number.isFinite(rate) ? Math.max(0.25, Math.min(rate, 4)) : 1;
    if (nextRate === this.playbackRate) return;

    if (this.isPlayingInternal && this.audioBuffer) {
      const ctx = this.getContextFn();
      const duration = this.audioBuffer.duration;
      const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.getEffectivePlaybackRate();
      const position = duration > 0 ? (this.playStartOffset + elapsed) % duration : 0;
      this.playStartOffset = position;
      this.startedAt = ctx.currentTime;
    }

    this.playbackRate = nextRate;
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
  }

  public setDetuneSemitones(semitones: number): void {
    const nextCents = Number.isFinite(semitones)
      ? Math.max(-2400, Math.min(2400, semitones * 100))
      : 0;
    if (nextCents === this.detuneCents) return;

    if (this.isPlayingInternal && this.audioBuffer) {
      const ctx = this.getContextFn();
      const duration = this.audioBuffer.duration;
      const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.getEffectivePlaybackRate();
      const position = duration > 0 ? (this.playStartOffset + elapsed) % duration : 0;
      this.playStartOffset = position;
      this.startedAt = ctx.currentTime;
    }

    this.detuneCents = nextCents;
    if (this.sourceNode) {
      this.sourceNode.detune.value = this.detuneCents;
    }
  }

  public setLowEqGainDb(gainDb: number): void {
    const next = Number.isFinite(gainDb) ? Math.max(-18, Math.min(18, gainDb)) : 0;
    this.lowEqGainDb = next;
    if (this.lowShelfNode) {
      this.lowShelfNode.gain.value = this.lowEqGainDb;
    }
  }

  public setHighEqGainDb(gainDb: number): void {
    const next = Number.isFinite(gainDb) ? Math.max(-18, Math.min(18, gainDb)) : 0;
    this.highEqGainDb = next;
    if (this.highShelfNode) {
      this.highShelfNode.gain.value = this.highEqGainDb;
    }
  }

  public getCurrentTime(): number {
    if (!this.audioBuffer) return 0;
    const ctx = this.getContextFn();
    const duration = this.audioBuffer.duration;
    if (this.isPlayingInternal) {
      if (duration <= 0) return 0;
      const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.getEffectivePlaybackRate();
      return (this.playStartOffset + elapsed) % duration;
    }
    return Math.min(duration, this.pausedOffset);
  }

  public getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  public isPlaying(): boolean {
    return this.isPlayingInternal;
  }

  public hasLoadedBuffer(): boolean {
    return !!this.audioBuffer;
  }

  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  public unload(): void {
    this.stop();
    this.audioBuffer = null;
  }

  private async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.stop();
    const ctx = this.getContextFn();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.audioBuffer = decoded;
    this.trimGain = this.estimateTrimGain(decoded);
    this.applyOutputGain();
    this.pausedOffset = 0;
    return decoded;
  }

  private getGainNode(): GainNode {
    if (!this.gainNode) {
      const ctx = this.getContextFn();
      this.gainNode = ctx.createGain();
      this.applyOutputGain();
      this.gainNode.connect(this.getMixInputFn());

      const send = this.getReverbSendNode();
      this.gainNode.connect(send);
      send.connect(this.getReverbInputFn());
    }
    return this.gainNode;
  }

  private getHighPassNode(): BiquadFilterNode {
    if (!this.highPassNode) {
      const ctx = this.getContextFn();
      this.highPassNode = ctx.createBiquadFilter();
      this.highPassNode.type = "highpass";
      this.highPassNode.frequency.value = 32;
      this.highPassNode.Q.value = 0.707;
      this.highPassNode.connect(this.getLowShelfNode());
    }
    return this.highPassNode;
  }

  private getLowShelfNode(): BiquadFilterNode {
    if (!this.lowShelfNode) {
      const ctx = this.getContextFn();
      this.lowShelfNode = ctx.createBiquadFilter();
      this.lowShelfNode.type = "lowshelf";
      this.lowShelfNode.frequency.value = 180;
      this.lowShelfNode.gain.value = this.lowEqGainDb;
      this.lowShelfNode.connect(this.getHighShelfNode());
    }
    return this.lowShelfNode;
  }

  private getHighShelfNode(): BiquadFilterNode {
    if (!this.highShelfNode) {
      const ctx = this.getContextFn();
      this.highShelfNode = ctx.createBiquadFilter();
      this.highShelfNode.type = "highshelf";
      this.highShelfNode.frequency.value = 4800;
      this.highShelfNode.gain.value = this.highEqGainDb;
      this.highShelfNode.connect(this.getCompressorNode());
    }
    return this.highShelfNode;
  }

  private getCompressorNode(): DynamicsCompressorNode {
    if (!this.compressorNode) {
      const ctx = this.getContextFn();
      this.compressorNode = ctx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -18;
      this.compressorNode.knee.value = 18;
      this.compressorNode.ratio.value = 2;
      this.compressorNode.attack.value = 0.01;
      this.compressorNode.release.value = 0.2;
      this.compressorNode.connect(this.getGainNode());
    }
    return this.compressorNode;
  }

  private getReverbSendNode(): GainNode {
    if (!this.reverbSendNode) {
      const ctx = this.getContextFn();
      this.reverbSendNode = ctx.createGain();
      this.reverbSendNode.gain.value = 0.12;
    }
    return this.reverbSendNode;
  }

  private applyOutputGain(): void {
    if (!this.gainNode) return;
    this.gainNode.gain.value = this.volume * this.trimGain;
  }

  private estimateTrimGain(buffer: AudioBuffer): number {
    const channels = Math.max(1, buffer.numberOfChannels);
    const maxSamples = Math.min(buffer.length, 48_000);
    if (maxSamples === 0) return 1;

    let sumSquares = 0;
    for (let channel = 0; channel < channels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < maxSamples; i++) {
        const sample = data[i];
        sumSquares += sample * sample;
      }
    }

    const rms = Math.sqrt(sumSquares / (maxSamples * channels));
    if (!Number.isFinite(rms) || rms <= 1e-6) return 1;

    const targetRms = 0.12;
    const raw = targetRms / rms;
    return Math.max(0.35, Math.min(2.5, raw));
  }

  private getEffectivePlaybackRate(): number {
    const detuneMultiplier = Math.pow(2, this.detuneCents / 1200);
    return this.playbackRate * detuneMultiplier;
  }
}

export class WavAudioEngine {
  private audioContext: AudioContext | null = null;
  private mixInputNode: GainNode | null = null;
  private glueCompressorNode: DynamicsCompressorNode | null = null;
  private masterGainNode: GainNode | null = null;
  private masterAnalyserNode: AnalyserNode | null = null;
  private reverbInputNode: GainNode | null = null;
  private reverbConvolverNode: ConvolverNode | null = null;
  private reverbReturnGainNode: GainNode | null = null;
  private defaultPlayer = new WavAudioPlayer(
    () => this.getContext(),
    () => this.getMixInputNode(),
    () => this.getReverbInputNode()
  );
  private players = new Set<WavAudioPlayer>();
  private trackPlayers = new Map<string, WavAudioPlayer>();
  private activeTracks: SonicTrack[] = [];
  private masterVolume = 1;
  private targetBpm: number | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: BlobPart[] = [];

  constructor() {
    this.players.add(this.defaultPlayer);
  }

  // Multi-file support: create independent players and run them simultaneously.
  public createPlayer(): WavAudioPlayer {
    const player = new WavAudioPlayer(
      () => this.getContext(),
      () => this.getMixInputNode(),
      () => this.getReverbInputNode()
    );
    this.players.add(player);
    return player;
  }

  public destroyPlayer(player: WavAudioPlayer): void {
    if (player === this.defaultPlayer) return;
    player.unload();
    this.players.delete(player);
  }

  public stopAll(): void {
    this.players.forEach((player) => player.stop());
  }

  public async playAll(): Promise<void> {
    this.applyTrackMixState();
    const trackBoundPlayers = new Set(this.trackPlayers.values());
    const trackPlayable = this.activeTracks
      .map((track) => this.trackPlayers.get(track.id))
      .filter((player): player is WavAudioPlayer => !!player && player.hasLoadedBuffer());

    const fallbackPlayable = Array.from(this.players).filter(
      (player) => !trackBoundPlayers.has(player) && player.hasLoadedBuffer()
    );

    const playable = trackPlayable.length > 0 ? trackPlayable : fallbackPlayable;
    await Promise.all(playable.map((player) => player.play()));
  }

  public async playTrack(trackId: string): Promise<void> {
    this.applyTrackMixState();
    const player = this.trackPlayers.get(trackId);
    if (!player || !player.hasLoadedBuffer()) return;
    await player.play();
  }

  public pauseTrack(trackId: string): void {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    player.pause();
  }

  public async toggleTrackPlayback(trackId: string): Promise<boolean> {
    const player = this.trackPlayers.get(trackId);
    if (!player || !player.hasLoadedBuffer()) return false;

    if (player.isPlaying()) {
      player.pause();
      return false;
    }

    await this.playTrack(trackId);
    return true;
  }

  public isAnyPlayerPlaying(): boolean {
    return Array.from(this.players).some((player) => player.isPlaying());
  }

  public hasAnyLoadedBuffer(): boolean {
    return Array.from(this.players).some((player) => player.hasLoadedBuffer());
  }

  public updateTracks(tracks: SonicTrack[]): void {
    this.activeTracks = tracks;

    const liveIds = new Set(tracks.map((track) => track.id));
    for (const [trackId, player] of this.trackPlayers.entries()) {
      if (liveIds.has(trackId)) continue;
      player.unload();
      this.players.delete(player);
      this.trackPlayers.delete(trackId);
    }

    this.applyTrackMixState();
  }

  public async loadTrackFromUrl(trackId: string, url: string): Promise<AudioBuffer> {
    const player = this.getOrCreateTrackPlayer(trackId);
    const buffer = await player.loadFromUrl(url);
    this.applyTrackMixState();
    return buffer;
  }

  public async loadTrackFromFile(trackId: string, file: File): Promise<AudioBuffer> {
    const player = this.getOrCreateTrackPlayer(trackId);
    const buffer = await player.loadFromFile(file);
    this.applyTrackMixState();
    return buffer;
  }

  public async loadTrackFromBlob(trackId: string, blob: Blob): Promise<AudioBuffer> {
    const player = this.getOrCreateTrackPlayer(trackId);
    const buffer = await player.loadFromBlob(blob);
    this.applyTrackMixState();
    return buffer;
  }

  public removeTrack(trackId: string): void {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    player.unload();
    this.players.delete(player);
    this.trackPlayers.delete(trackId);
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(volume, 2));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterVolume;
    }
  }

  public setTargetBpm(bpm: number | null): void {
    const normalized =
      typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 ? bpm : null;
    this.targetBpm = normalized;
    this.applyTrackMixState();
  }

  public setTrackLowEqGainDb(trackId: string, gainDb: number): void {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    player.setLowEqGainDb(gainDb);
  }

  public setTrackHighEqGainDb(trackId: string, gainDb: number): void {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    player.setHighEqGainDb(gainDb);
  }

  public isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  public async startRecording(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (this.mediaRecorder?.state === "recording") return;

    const destination = this.getRecordingDestination();
    const mimeTypeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    const mimeType = mimeTypeCandidates.find((type) => {
      try {
        return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    });

    this.recordingChunks = [];
    this.mediaRecorder = mimeType
      ? new MediaRecorder(destination.stream, { mimeType })
      : new MediaRecorder(destination.stream);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordingChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
  }

  public stopRecording(): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        resolve(null);
        return;
      }
      if (recorder.state === "inactive") {
        const blob = this.recordingChunks.length
          ? new Blob(this.recordingChunks, { type: this.recordingChunks[0] instanceof Blob ? this.recordingChunks[0].type : "audio/webm" })
          : null;
        this.recordingChunks = [];
        this.mediaRecorder = null;
        resolve(blob);
        return;
      }

      recorder.onstop = () => {
        const type =
          (this.recordingChunks.find((chunk): chunk is Blob => chunk instanceof Blob)?.type) ||
          recorder.mimeType ||
          "audio/webm";
        const blob = this.recordingChunks.length ? new Blob(this.recordingChunks, { type }) : null;
        this.recordingChunks = [];
        this.mediaRecorder = null;
        resolve(blob);
      };
      recorder.onerror = (event: any) => {
        this.recordingChunks = [];
        this.mediaRecorder = null;
        reject(event?.error || new Error("Recording failed."));
      };

      try {
        recorder.stop();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Backward-compatible single-player API (delegates to default player)
  public loadFromUrl(url: string): Promise<AudioBuffer> {
    return this.defaultPlayer.loadFromUrl(url);
  }

  public loadFromFile(file: File): Promise<AudioBuffer> {
    return this.defaultPlayer.loadFromFile(file);
  }

  public loadFromBlob(blob: Blob): Promise<AudioBuffer> {
    return this.defaultPlayer.loadFromBlob(blob);
  }

  public play(): Promise<void> {
    return this.defaultPlayer.play();
  }

  public pause(): void {
    this.defaultPlayer.pause();
  }

  public stop(): void {
    this.defaultPlayer.stop();
  }

  public seek(seconds: number): void {
    this.defaultPlayer.seek(seconds);
  }

  public setVolume(volume: number): void {
    this.defaultPlayer.setVolume(volume);
  }

  public getCurrentTime(): number {
    return this.defaultPlayer.getCurrentTime();
  }

  public getDuration(): number {
    return this.defaultPlayer.getDuration();
  }

  public isPlaying(): boolean {
    return this.defaultPlayer.isPlaying();
  }

  public hasLoadedBuffer(): boolean {
    return this.defaultPlayer.hasLoadedBuffer();
  }

  public unload(): void {
    this.defaultPlayer.unload();
  }

  public getVisualizerAudioBuffer(): AudioBuffer | null {
    const player = this.getPrimaryVisualizerPlayer();
    return player?.getAudioBuffer() ?? null;
  }

  public getVisualizerCurrentTime(): number {
    const player = this.getPrimaryVisualizerPlayer();
    return player?.getCurrentTime() ?? 0;
  }

  public getTrackAudioBuffer(trackId: string): AudioBuffer | null {
    return this.trackPlayers.get(trackId)?.getAudioBuffer() ?? null;
  }

  public getTrackCurrentTime(trackId: string): number {
    return this.trackPlayers.get(trackId)?.getCurrentTime() ?? 0;
  }

  public isTrackPlaying(trackId: string): boolean {
    return this.trackPlayers.get(trackId)?.isPlaying() ?? false;
  }

  public getAudioContextIfAvailable(): AudioContext | null {
    return this.audioContext;
  }

  public getMasterAnalyserNode(): AnalyserNode | null {
    this.ensureMixGraph();
    return this.masterAnalyserNode;
  }

  private getOrCreateTrackPlayer(trackId: string): WavAudioPlayer {
    const existing = this.trackPlayers.get(trackId);
    if (existing) return existing;

    const player = new WavAudioPlayer(
      () => this.getContext(),
      () => this.getMixInputNode(),
      () => this.getReverbInputNode()
    );
    this.trackPlayers.set(trackId, player);
    this.players.add(player);
    return player;
  }

  private applyTrackMixState(): void {
    if (this.activeTracks.length === 0) return;
    const isAnySoloed = this.activeTracks.some((track) => track.isSoloed);

    this.activeTracks.forEach((track) => {
      const player = this.trackPlayers.get(track.id);
      if (!player) return;
      const canPlay = isAnySoloed ? track.isSoloed : !track.isMuted;
      const originalBpm =
        typeof track.sourceBpm === "number" && Number.isFinite(track.sourceBpm) && track.sourceBpm > 0
          ? track.sourceBpm
          : (
            typeof track.profile?.musicalParameters?.tempo === "number" &&
            Number.isFinite(track.profile.musicalParameters.tempo) &&
            track.profile.musicalParameters.tempo > 0
              ? track.profile.musicalParameters.tempo
              : null
          );
      const trackTargetBpm =
        typeof track.targetBpm === "number" && Number.isFinite(track.targetBpm) && track.targetBpm > 0
          ? track.targetBpm
          : this.targetBpm;
      const playbackRate =
        trackTargetBpm && originalBpm ? trackTargetBpm / originalBpm : 1;
      player.setLowEqGainDb(track.lowEqGainDb ?? 0);
      player.setHighEqGainDb(track.highEqGainDb ?? 0);
      player.setPlaybackRate(playbackRate);
      player.setDetuneSemitones(track.pitchSemitones ?? 0);
      player.setVolume(canPlay ? (track.volume ?? 1) : 0);
    });
  }

  private getPrimaryVisualizerPlayer(): WavAudioPlayer | null {
    for (const track of this.activeTracks) {
      const player = this.trackPlayers.get(track.id);
      if (player?.hasLoadedBuffer()) return player;
    }
    return this.defaultPlayer.hasLoadedBuffer() ? this.defaultPlayer : null;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
    }
    return this.audioContext;
  }

  private getMixInputNode(): GainNode {
    this.ensureMixGraph();
    return this.mixInputNode as GainNode;
  }

  private getReverbInputNode(): GainNode {
    this.ensureMixGraph();
    return this.reverbInputNode as GainNode;
  }

  private getMasterGainNode(): GainNode {
    this.ensureMixGraph();
    return this.masterGainNode as GainNode;
  }

  private ensureMixGraph(): void {
    if (
      this.mixInputNode &&
      this.glueCompressorNode &&
      this.masterGainNode &&
      this.reverbInputNode &&
      this.reverbConvolverNode &&
      this.reverbReturnGainNode
    ) {
      return;
    }

    const ctx = this.getContext();

    if (!this.mixInputNode) {
      this.mixInputNode = ctx.createGain();
      this.mixInputNode.gain.value = 1;
    }

    if (!this.glueCompressorNode) {
      this.glueCompressorNode = ctx.createDynamicsCompressor();
      this.glueCompressorNode.threshold.value = -14;
      this.glueCompressorNode.knee.value = 20;
      this.glueCompressorNode.ratio.value = 1.6;
      this.glueCompressorNode.attack.value = 0.015;
      this.glueCompressorNode.release.value = 0.22;
    }

    if (!this.masterGainNode) {
      this.masterGainNode = ctx.createGain();
      this.masterGainNode.gain.value = this.masterVolume;
      this.masterGainNode.connect(ctx.destination);
      this.masterGainNode.connect(this.getRecordingDestination());
      this.masterGainNode.connect(this.getMasterAnalyserNodeInternal());
    }

    if (!this.reverbInputNode) {
      this.reverbInputNode = ctx.createGain();
      this.reverbInputNode.gain.value = 1;
    }

    if (!this.reverbConvolverNode) {
      this.reverbConvolverNode = ctx.createConvolver();
      this.reverbConvolverNode.buffer = this.createShortRoomImpulse(ctx);
    }

    if (!this.reverbReturnGainNode) {
      this.reverbReturnGainNode = ctx.createGain();
      this.reverbReturnGainNode.gain.value = 0.14;
    }

    this.mixInputNode.disconnect();
    this.glueCompressorNode.disconnect();
    this.reverbInputNode.disconnect();
    this.reverbConvolverNode.disconnect();
    this.reverbReturnGainNode.disconnect();

    this.mixInputNode.connect(this.glueCompressorNode);
    this.glueCompressorNode.connect(this.masterGainNode);

    this.reverbInputNode.connect(this.reverbConvolverNode);
    this.reverbConvolverNode.connect(this.reverbReturnGainNode);
    this.reverbReturnGainNode.connect(this.masterGainNode);
  }

  private createShortRoomImpulse(ctx: AudioContext): AudioBuffer {
    const lengthSeconds = 0.55;
    const length = Math.max(1, Math.floor(ctx.sampleRate * lengthSeconds));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.4);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }

    return impulse;
  }

  private getMasterAnalyserNodeInternal(): AnalyserNode {
    if (!this.masterAnalyserNode) {
      const ctx = this.getContext();
      this.masterAnalyserNode = ctx.createAnalyser();
      this.masterAnalyserNode.fftSize = 2048;
      this.masterAnalyserNode.smoothingTimeConstant = 0.85;
    }
    return this.masterAnalyserNode;
  }

  private getRecordingDestination(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      const ctx = this.getContext();
      this.recordingDestination = ctx.createMediaStreamDestination();
      if (this.masterGainNode) {
        this.masterGainNode.connect(this.recordingDestination);
      }
    }
    return this.recordingDestination;
  }
}

export const wavAudioEngine = new WavAudioEngine();
