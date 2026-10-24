import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
export default defineConfig(({ mode })=>{
  const hosted=mode==='sheets';
  const loadCatalog=()=>readFileSync('.generated/hosted-catalog.json','utf8');
  return {
  root: 'src',
  envDir: process.cwd(),
  plugins: [react(),...(hosted?[{
    name:'pllingo-hosted-catalog',
    configureServer(server:import('vite').ViteDevServer){server.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0].endsWith('/hosted-catalog.json')){try{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(loadCatalog());}catch{res.statusCode=503;res.end('Run npm run prepare:sheets');}}else next();});},
    generateBundle(){this.emitFile({type:'asset',fileName:'hosted-catalog.json',source:loadCatalog()});}
  } as import('vite').Plugin]:[])],
  define:{'import.meta.env.VITE_BACKEND_MODE':JSON.stringify(hosted?'sheets':'local')},
  base: process.env.VITE_BASE_PATH || loadEnv(mode,process.cwd(),'VITE_').VITE_BASE_PATH || (hosted?'/PLLingo/':'/'),
  server: { host: '127.0.0.1', port: 5173, proxy: hosted?undefined:{ '/api': 'http://127.0.0.1:3001' }, fs: { allow: [process.cwd()], deny: ['**/.env*', '**/materials/**', '**/private-data/**', '**/.tools/**','**/.generated/**','**/apps-script-dist/**'] } },
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false, rollupOptions: { output: { manualChunks: { math:['katex'], markdown:['react-markdown','remark-math','rehype-katex'] } } } }
};});
