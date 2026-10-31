import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url)),'next/router':fileURLToPath(new URL('./node_modules/vinext/dist/shims/router.js',import.meta.url)),'next/link':fileURLToPath(new URL('./node_modules/vinext/dist/shims/link.js',import.meta.url))}},
  esbuild:{jsx:'automatic'},
  css:{postcss:{plugins:[tailwindcss()]}},
  server:{host:'127.0.0.1',port:5194,strictPort:true},
});
