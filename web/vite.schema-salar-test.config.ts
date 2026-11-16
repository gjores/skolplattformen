import { defineConfig } from 'vite';
import base from './vite.mandate-test.config.ts';
export default defineConfig({ ...base, server: { ...base.server, port: 5246, strictPort: true } });
