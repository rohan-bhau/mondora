import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync,readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');process.chdir(root);
const secret=()=>randomBytes(32).toString('hex');
const readEnv=path=>existsSync(path)?Object.fromEntries(readFileSync(path,'utf8').split('\n').filter(l=>/^[A-Z_]+=\S/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim()];})):{};
function addMissing(path,values){const existing=readEnv(path);for(const [key,value] of Object.entries(values))if(!(key in existing))appendFileSync(path,`\n${key}=${value}\n`,{mode:0o600});}
if(!existsSync('strapi/.env'))writeFileSync('strapi/.env','',{mode:0o600});
addMissing('strapi/.env',{
  APP_KEYS:`${secret()},${secret()}`,
  ADMIN_JWT_SECRET:secret(),
  API_TOKEN_SALT:secret(),
  TRANSFER_TOKEN_SALT:secret(),
  ENCRYPTION_KEY:secret(),
  STUDIO_TOKEN:readEnv('.env.local').STUDIO_TOKEN||secret(),
});
const cms=readEnv('strapi/.env');
const token=readEnv('strapi/.env').STUDIO_TOKEN;
addMissing('.env.local',{STRAPI_URL:'http://127.0.0.1:1337',STUDIO_TOKEN:token,OLLAMA_URL:cms.OLLAMA_URL||'http://127.0.0.1:11434',OLLAMA_MODEL:cms.OLLAMA_MODEL||'qwen2.5:3b'});
if(readEnv('.env.local').STUDIO_TOKEN!==token)throw new Error('STUDIO_TOKEN differs between .env.local and strapi/.env. Align the values before starting; existing secrets were not overwritten.');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit'});if(result.error||result.status!==0)throw new Error(`${command} ${args.join(' ')} failed. ${result.error?.message||''}`);}
if(!process.argv.includes('--config-only')){
  run('npm',['ci','--prefix','strapi']);
  if(!existsSync('.venv/bin/python'))run('python3',['-m','venv','.venv']);
  run('.venv/bin/python',['-m','pip','install','--upgrade','yt-dlp[default]']);
}
console.log('Configuration ready. Existing secrets and saved sessions preserved.');
console.log('Pull the local model once: ollama pull '+readEnv('.env.local').OLLAMA_MODEL);
console.log('Start Ollama, then run npm run dev.');
