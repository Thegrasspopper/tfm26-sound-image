import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.SUNO_API_KEY': JSON.stringify(env.SUNO_API_KEY),
        'process.env.FAL_KEY': JSON.stringify(env.FAL_KEY),
        'process.env.UPLOAD_TOKEN': JSON.stringify(env.UPLOAD_TOKEN),
        'process.env.WP_APP_REST_URL': JSON.stringify(env.WP_APP_REST_URL),
        'process.env.WP_APP_SEQUENCE_UPLOAD_ENDPOINT': JSON.stringify(env.WP_APP_SEQUENCE_UPLOAD_ENDPOINT),
        'process.env.WP_APP_NONCE': JSON.stringify(env.WP_APP_NONCE),
        'process.env.WP_APP_FAL_AUDIO_TO_AUDIO_ENDPOINT': JSON.stringify(env.WP_APP_FAL_AUDIO_TO_AUDIO_ENDPOINT),

      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: ['midi-sounds-react']
      },
      ssr: {
        noExternal: ['midi-sounds-react']
      }, 
      base: "./", 
      build: {
        manifest: true,
        outDir: "dist",
      },
    };
});
