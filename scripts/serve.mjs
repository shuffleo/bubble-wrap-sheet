import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(base,process.env.SERVE_DIR||'dist');
const port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.wav':'audio/wav','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405);res.end();return;}
  let name=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);
  if(name==='/'||name.endsWith('/'))name+='index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)||name.includes('\0')){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){res.writeHead(error?.code==='ENOENT'?404:400);res.end('Not found. Run npm run build first.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Bubble Wrap: http://127.0.0.1:${port}`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
process.on('SIGINT',()=>server.close());
