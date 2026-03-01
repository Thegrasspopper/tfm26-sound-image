
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  audioBuffer: AudioBuffer | null;
  audioContext: AudioContext | null;
  getCurrentTime?: () => number;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying, audioBuffer, audioContext, getCurrentTime }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !audioContext || !audioBuffer) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const samples = audioBuffer.getChannelData(0);
    const duration = Math.max(audioBuffer.duration, 0.0001);
    const bars = 64;
    const barWidth = width / bars;

    const draw = () => {
      const themeStyles = getComputedStyle(document.documentElement);
      const vizBg = themeStyles.getPropertyValue('--viz-bg').trim() || 'rgba(15,23,42,0.65)';
      const vizProgress = themeStyles.getPropertyValue('--viz-progress').trim() || '#34d399';
      const vizBase = themeStyles.getPropertyValue('--viz-base').trim() || '#94a3b8';
      const vizPlayhead = themeStyles.getPropertyValue('--viz-playhead').trim() || '#ffffff';

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = vizBg;
      ctx.fillRect(0, 0, width, height);

      const playhead = getCurrentTime ? getCurrentTime() : 0;
      const progress = Math.max(0, Math.min(1, playhead / duration));
      const progressX = progress * width;

      for (let i = 0; i < bars; i++) {
        const start = Math.floor((i / bars) * samples.length);
        const end = Math.floor(((i + 1) / bars) * samples.length);
        let peak = 0;
        for (let s = start; s < end; s++) {
          const v = Math.abs(samples[s] ?? 0);
          if (v > peak) peak = v;
        }

        const h = Math.max(2, peak * height * 0.9);
        const x = i * barWidth + 1;
        const y = (height - h) / 2;
        ctx.fillStyle = x <= progressX ? vizProgress : vizBase;
        ctx.globalAlpha = x <= progressX ? 0.95 : 0.5;
        ctx.fillRect(x, y, Math.max(1, barWidth - 2), h);
      }

      ctx.globalAlpha = 1;
      if (isPlaying) {
        ctx.strokeStyle = vizPlayhead;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, height);
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, audioBuffer, audioContext, getCurrentTime]);

  return (
    <canvas 
      ref={canvasRef} 
      width={380} 
      height={100} 
      className="w-full h-14 rounded-lg"
    />
  );
};

export default AudioVisualizer;
