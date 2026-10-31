import { defineConfig } from 'vite';
import base from './vite.mandate-test.config';
export default defineConfig({ ...base, server: { ...base.server, port: 5197, strictPort: true } });
