import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=path.join(root,'dist');
const port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');

const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.wav':'audio/wav','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json'};
const reloadScript='<script>(()=>{const events=new EventSource(\"/__game_reload\");events.addEventListener(\"build\",()=>location.reload());})();</script>';
const clients=new Set();
let rebuildTimer;

function build(){
 try{
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'inherit'});
  for(const response of clients)response.write('event: build\ndata: ready\n\n');
  console.log('Game build complete.');
 }catch(error){
  console.error('Game build failed. Fix the error to resume live reload.');
  if(!error.status)console.error(error.message);
 }
}

function scheduleBuild(){
 clearTimeout(rebuildTimer);
 rebuildTimer=setTimeout(build,80);
}

build();

const server=http.createServer(async(request,response)=>{
 try{
  if(!['GET','HEAD'].includes(request.method||'')){response.writeHead(405);response.end();return;}
  const url=new URL(request.url||'/','http://localhost');
  if(url.pathname==='/__game_reload'){
   response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
   response.write(': connected\n\n');
   clients.add(response);
   request.on('close',()=>clients.delete(response));
   return;
  }
  let name=decodeURIComponent(url.pathname);
  if(name==='/'||name.endsWith('/'))name+='index.html';
  const file=path.resolve(publicRoot,'.'+name);
  if(!file.startsWith(publicRoot+path.sep)||name.includes('\0')){response.writeHead(403);response.end();return;}
  let bytes=await fsp.readFile(file);
  if(path.extname(file)==='.html')bytes=Buffer.from(bytes.toString('utf8').replace('</body>',`${reloadScript}</body>`));
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-cache'});
  response.end(request.method==='HEAD'?undefined:bytes);
 }catch(error){
  response.writeHead(error?.code==='ENOENT'?404:400);
  response.end('Not found.');
 }
});

const watchers=[
 fs.watch(path.join(root,'config'),{recursive:true},scheduleBuild),
 fs.watch(path.join(root,'src/game'),{recursive:true},(_event,filename)=>{
  if(filename&&String(filename).replaceAll('\\','/').startsWith('generated/'))return;
  scheduleBuild();
 })
];

server.listen(port,'127.0.0.1',()=>console.log(`Bubble Wrap game development: http://127.0.0.1:${port}`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});

function close(){
 clearTimeout(rebuildTimer);
 for(const watcher of watchers)watcher.close();
 for(const response of clients)response.end();
 server.close();
}
process.on('SIGINT',close);
process.on('SIGTERM',close);
