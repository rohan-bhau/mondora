import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');process.chdir(root);
if(!existsSync('.env.local')||!existsSync('strapi/.env')){console.error('Run npm run setup:local first.');process.exit(1);}
for(const port of [3000,1337])await new Promise((ok,reject)=>{const s=createServer();s.once('error',()=>reject(new Error(`Port ${port} is already in use. Stop the previous development service, then run npm run dev again.`)));s.listen(port,'127.0.0.1',()=>s.close(ok));});
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)if(child.pid){try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}}process.exitCode=code;}
function start(label,cmd,args,cwd){const child=spawn(cmd,args,{cwd,env:{...process.env,BROWSER:'false',STRAPI_TELEMETRY_DISABLED:'true'},detached:process.platform!=='win32',stdio:['inherit','pipe','pipe']});children.push(child);for(const stream of [child.stdout,child.stderr]){let pending='';stream.on('data',data=>{pending+=data;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)console.log(`[${label}] ${line}`);});}child.on('error',e=>{console.error(`[${label}] ${e.message}`);stop(1);});child.on('exit',code=>{if(!stopping)stop(code||1);});return child;}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
start('Strapi',process.execPath,['node_modules/@strapi/strapi/bin/strapi.js','develop','--no-watch-admin'],resolve('strapi'));
let ready=false;
for(let attempt=0;attempt<600 && !stopping;attempt++) {
  try{const response=await fetch('http://127.0.0.1:1337/_health',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
}
if(!stopping) {
  if(ready)start('Next.js',process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1'],root);
  else{console.error('[Strapi] Startup timed out. See the service logs above.');stop(1);}
}
