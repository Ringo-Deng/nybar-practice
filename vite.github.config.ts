import {fileURLToPath,URL} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

const projectRoot=fileURLToPath(new URL('.',import.meta.url));

export default defineConfig({
 root:fileURLToPath(new URL('./github-pages',import.meta.url)),
 base:'/nybar-practice/',
 publicDir:fileURLToPath(new URL('./public',import.meta.url)),
 resolve:{alias:{'@':projectRoot}},
 plugins:[react()],
 css:{postcss:fileURLToPath(new URL('./postcss.config.mjs',import.meta.url))},
 build:{outDir:fileURLToPath(new URL('./dist-github',import.meta.url)),emptyOutDir:true},
});
