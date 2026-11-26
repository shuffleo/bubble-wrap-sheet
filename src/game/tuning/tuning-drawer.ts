import {RESTART_POLICY_LABEL} from './tuning-policy';
import {setTuningValue,tuningFields,validateTuningValue,type JsonSchemaNode,type TuningField} from './tuning-fields';
import {gameVendors} from '../game-vendors';

const SESSION_KEY='bubble-survival-tuning-v1';

export interface TuningDrawerHandle {
 readonly element:HTMLElement;
 readonly config:Record<string,unknown>;
 close():void;
}

function embedded(id:string):Record<string,unknown> {
 const node=document.getElementById(id);
 if(!node)throw new Error(`Missing embedded ${id}`);
 return JSON.parse(node.textContent||'{}');
}

function readSession(base:Record<string,unknown>):Record<string,unknown> {
 try{
  const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
  return saved?.revision===base.revision&&saved?.config&&typeof saved.config==='object'?saved.config:structuredClone(base);
 }catch{return structuredClone(base);}
}

interface DynamicBinding {
 on(event:'change',handler:(event:{value:unknown})=>void):DynamicBinding;
}

interface DynamicFolder {
 addBinding(target:Record<string,unknown>,key:string,options:Record<string,unknown>):DynamicBinding;
}

export function createTuningDrawer():TuningDrawerHandle {
 const base=embedded('level-design-config'),schema=embedded('level-design-schema') as JsonSchemaNode;
 let merged=readSession(base);
 const drawer=document.createElement('aside');drawer.id='tuning-drawer';drawer.setAttribute('aria-labelledby','tuning-heading');
 drawer.innerHTML=`<header class="tuning-head"><div><span class="game-label">Development only</span><h2 id="tuning-heading">Level design</h2></div><button type="button" data-tuning-action="close" aria-label="Close tuning drawer"><span class="material-symbols-rounded" aria-hidden="true">close</span></button></header>
  <div class="tuning-meta"><span>Revision <b>${String(base.revision)}</b></span><span id="tuning-status" role="status" data-valid="true">Schema fields ready</span></div>
  <div id="tuning-pane-host"></div>
  <footer class="tuning-footer"><button type="button" data-tuning-action="reset">Reset session</button><button type="button" data-tuning-action="export">Export JSON</button></footer>`;
 document.body.append(drawer);
 const container=drawer.querySelector<HTMLElement>('#tuning-pane-host')!,status=drawer.querySelector<HTMLElement>('#tuning-status')!;
 const pane=new (gameVendors().Pane)({container});
 const byGroup=new Map<string,TuningField[]>();
 for(const field of tuningFields(schema,merged)){
  const values=byGroup.get(field.group)||[];values.push(field);byGroup.set(field.group,values);
 }
 for(const [group,fields] of byGroup){
  const folder=pane.addFolder({title:group.replace(/([a-z])([A-Z])/g,'$1 $2'),expanded:group==='sizes'||group==='scoring'}) as unknown as DynamicFolder;
  for(const field of fields){
   const target:Record<string,unknown>={value:field.value};
   const options:Record<string,unknown>={label:`${field.label} · ${RESTART_POLICY_LABEL[field.restart]}`};
   if(field.minimum!==undefined)options.min=field.minimum;
   if(field.maximum!==undefined)options.max=field.maximum;
   if(field.step!==undefined)options.step=field.step;
   if(field.options)options.options=Object.fromEntries(field.options.map(option=>[String(option),option]));
   folder.addBinding(target,'value',options).on('change',event=>{
    const value=event.value;
    const error=validateTuningValue(field,value);
    if(error){status.dataset.valid='false';status.textContent=`${field.label}: ${error}`;return;}
    merged=setTuningValue(merged,field.pointer,value);
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({revision:base.revision,config:merged}));}catch{}
    status.dataset.valid='true';status.textContent=`Valid override · ${RESTART_POLICY_LABEL[field.restart]}`;
    if(field.restart==='none')window.dispatchEvent(new CustomEvent('bubble:tuning-change',{detail:{pointer:field.pointer,value,restart:field.restart}}));
   });
  }
 }
 const close=()=>{pane.dispose();drawer.remove();};
 drawer.querySelector<HTMLButtonElement>('[data-tuning-action=close]')!.addEventListener('click',close);
 drawer.querySelector<HTMLButtonElement>('[data-tuning-action=reset]')!.addEventListener('click',()=>{sessionStorage.removeItem(SESSION_KEY);location.reload();});
 drawer.querySelector<HTMLButtonElement>('[data-tuning-action=export]')!.addEventListener('click',()=>{
  const blob=new Blob([`${JSON.stringify(merged,null,2)}\n`],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='level-design.json';link.click();URL.revokeObjectURL(url);
  status.dataset.valid='true';status.textContent='Exported complete validated-field JSON.';
 });
 return {element:drawer,get config(){return merged;},close};
}
