import type { SonicTrack } from "../types";

export class WavAudioPlayer {
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private startedAt = 0;
  private playStartOffset = 0;
  private pausedOffset = 0;
  private isPlayingInternal = false;
  private volume = 1;
  private playbackRate = 1;

  constructor(
    private readonly getContextFn: () => AudioContext,
    private readonly getMasterGainFn: () => GainNode
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
    source.connect(this.getGainNode());

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
    const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.playbackRate;
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
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  public setPlaybackRate(rate: number): void {
    const nextRate = Number.isFinite(rate) ? Math.max(0.25, Math.min(rate, 4)) : 1;
    if (nextRate === this.playbackRate) return;

    if (this.isPlayingInternal && this.audioBuffer) {
      const ctx = this.getContextFn();
      const duration = this.audioBuffer.duration;
      const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.playbackRate;
      const position = duration > 0 ? (this.playStartOffset + elapsed) % duration : 0;
      this.playStartOffset = position;
      this.startedAt = ctx.currentTime;
    }

    this.playbackRate = nextRate;
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
  }

  public getCurrentTime(): number {
    if (!this.audioBuffer) return 0;
    const ctx = this.getContextFn();
    const duration = this.audioBuffer.duration;
    if (this.isPlayingInternal) {
      if (duration <= 0) return 0;
      const elapsed = Math.max(0, ctx.currentTime - this.startedAt) * this.playbackRate;
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
    this.pausedOffset = 0;
    return decoded;
  }

  private getGainNode(): GainNode {
    if (!this.gainNode) {
      const ctx = this.getContextFn();
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.getMasterGainFn());
    }
    return this.gainNode;
  }
}

export class WavAudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private defaultPlayer = new WavAudioPlayer(
    () => this.getContext(),
    () => this.getMasterGainNode()
  );
  private players = new Set<WavAudioPlayer>();
  private trackPlayers = new Map<string, WavAudioPlayer>();
  private activeTracks: SonicTrack[] = [];
  private masterVolume = 1;
  private targetBpm: number | null = null;

  constructor() {
    this.players.add(this.defaultPlayer);
  }

  // Multi-file support: create independent players and run them simultaneously.
  public createPlayer(): WavAudioPlayer {
    const player = new WavAudioPlayer(
      () => this.getContext(),
      () => this.getMasterGainNode()
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

  private getOrCreateTrackPlayer(trackId: string): WavAudioPlayer {
    const existing = this.trackPlayers.get(trackId);
    if (existing) return existing;

    const player = new WavAudioPlayer(
      () => this.getContext(),
      () => this.getMasterGainNode()
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
        typeof track.profile?.bpm === "number" && Number.isFinite(track.profile.bpm) && track.profile.bpm > 0
          ? track.profile.bpm
          : null;
      const trackTargetBpm =
        typeof track.targetBpm === "number" && Number.isFinite(track.targetBpm) && track.targetBpm > 0
          ? track.targetBpm
          : this.targetBpm;
      const playbackRate =
        trackTargetBpm && originalBpm ? trackTargetBpm / originalBpm : 1;
      player.setPlaybackRate(playbackRate);
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

  private getMasterGainNode(): GainNode {
    if (!this.masterGainNode) {
      const ctx = this.getContext();
      this.masterGainNode = ctx.createGain();
      this.masterGainNode.gain.value = this.masterVolume;
      this.masterGainNode.connect(ctx.destination);
    }
    return this.masterGainNode;
  }
}

export const wavAudioEngine = new WavAudioEngine();
