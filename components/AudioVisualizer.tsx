
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  audioBuffer: AudioBuffer | null;
  audioContext: AudioContext | null;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying, audioBuffer, audioContext }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Fix: Added an initial value of null to satisfy the TypeScript requirement for the useRef hook when a generic type is provided.
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !isPlaying || !audioContext) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#6366f1';
      
      const bars = 40;
      const barWidth = width / bars;
      
      for (let i = 0; i < bars; i++) {
        // Just a pseudo-visualizer since we don't have a real-time analyser node connected 
        // to the player in this simplified version, but we can animate it
        const h = Math.random() * height * 0.8;
        ctx.fillRect(i * barWidth + 2, height - h, barWidth - 4, h);
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, audioContext]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={100} 
      className="w-full h-24 rounded-lg bg-slate-900/50"
    />
  );
};

export default AudioVisualizer;
