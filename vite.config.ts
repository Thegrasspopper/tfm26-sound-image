import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import OpenAI from 'openai';

const openAIDevProxyPlugin = (apiKey?: string) => ({
  name: 'openai-dev-proxy',
  configureServer(server: any) {
    if (!apiKey) {
      server.middlewares.use('/api/openai/chat/completions', (_req: any, res: any) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Missing OPENAI_API_KEY in server environment.');
      });
      return;
    }

    const client = new OpenAI({ apiKey });

    server.middlewares.use('/api/openai/chat/completions', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        const payload = JSON.parse(raw);
        const completion = await client.chat.completions.create(payload);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(completion));
      } catch (error: any) {
        res.statusCode = error?.status || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: error?.message || 'OpenAI proxy error',
          details: error?.error || undefined,
        }));
      }
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), openAIDevProxyPlugin(env.OPENAI_API_KEY)],
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
