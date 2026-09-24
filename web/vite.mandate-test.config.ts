import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
  esbuild:{jsx:'automatic'},
  css:{postcss:{plugins:[tailwindcss()]}},
  server:{host:'127.0.0.1',port:5194,strictPort:true},
});
