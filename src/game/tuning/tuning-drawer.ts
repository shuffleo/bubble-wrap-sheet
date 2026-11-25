import {RESTART_POLICY_LABEL} from './tuning-policy';
import {setTuningValue,tuningFields,validateTuningValue,type JsonSchemaNode,type TuningField} from './tuning-fields';

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

function inputFor(field:TuningField):HTMLInputElement|HTMLSelectElement {
 if(field.kind==='select'){
  const select=document.createElement('select');
  for(const option of field.options||[]){const node=document.createElement('option');node.value=String(option);node.textContent=String(option);node.selected=option===field.value;select.append(node);}
  return select;
 }
 const input=document.createElement('input');input.type=field.kind==='boolean'?'checkbox':field.kind;
 if(field.kind==='boolean')input.checked=Boolean(field.value);
 else input.value=String(field.value);
 if(field.minimum!==undefined)input.min=String(field.minimum);
 if(field.maximum!==undefined)input.max=String(field.maximum);
 if(field.step!==undefined)input.step=String(field.step);
 return input;
}

function readSession(base:Record<string,unknown>):Record<string,unknown> {
 try{
  const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
  return saved?.revision===base.revision&&saved?.config&&typeof saved.config==='object'?saved.config:structuredClone(base);
 }catch{return structuredClone(base);}
}

export function createTuningDrawer():TuningDrawerHandle {
 const base=embedded('level-design-config'),schema=embedded('level-design-schema') as JsonSchemaNode;
 let merged=readSession(base);
 const drawer=document.createElement('aside');drawer.id='tuning-drawer';drawer.setAttribute('aria-labelledby','tuning-heading');
 drawer.innerHTML=`<header class="tuning-head"><div><span class="game-label">Development only</span><h2 id="tuning-heading">Level design</h2></div><button type="button" data-tuning-action="close" aria-label="Close tuning drawer">×</button></header>
  <div class="tuning-meta"><span>Revision <b>${String(base.revision)}</b></span><span id="tuning-status" role="status" data-valid="true">Schema fields ready</span></div>
  <div id="tuning-fields"></div>
  <footer class="tuning-footer"><button type="button" data-tuning-action="reset">Reset session</button><button type="button" data-tuning-action="export">Export JSON</button></footer>`;
 document.body.append(drawer);
 const container=drawer.querySelector<HTMLElement>('#tuning-fields')!,status=drawer.querySelector<HTMLElement>('#tuning-status')!;
 const byGroup=new Map<string,TuningField[]>();
 for(const field of tuningFields(schema,merged)){
  const values=byGroup.get(field.group)||[];values.push(field);byGroup.set(field.group,values);
 }
 for(const [group,fields] of byGroup){
  const details=document.createElement('details');details.className='tuning-group';details.open=group==='sizes'||group==='scoring';
  const summary=document.createElement('summary');summary.textContent=group.replace(/([a-z])([A-Z])/g,'$1 $2');details.append(summary);
  for(const field of fields){
   const row=document.createElement('label');row.className='tuning-field';row.dataset.pointer=field.pointer;
   const copy=document.createElement('span');copy.className='tuning-field-copy';copy.innerHTML=`<b>${field.label}</b><small>${field.pointer}</small>`;
   const policy=document.createElement('span');policy.className='tuning-policy';policy.dataset.restart=field.restart;policy.textContent=RESTART_POLICY_LABEL[field.restart];
   const input=inputFor(field);input.dataset.tuningInput=field.pointer;
   const apply=()=>{
    const value=field.kind==='boolean'?(input as HTMLInputElement).checked:field.kind==='number'?Number(input.value):input.value;
    const error=validateTuningValue(field,value);
    if(error){status.dataset.valid='false';status.textContent=`${field.label}: ${error}`;return;}
    merged=setTuningValue(merged,field.pointer,value);
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({revision:base.revision,config:merged}));}catch{}
    status.dataset.valid='true';status.textContent=`Valid override · ${RESTART_POLICY_LABEL[field.restart]}`;
    if(field.restart==='none')window.dispatchEvent(new CustomEvent('bubble:tuning-change',{detail:{pointer:field.pointer,value,restart:field.restart}}));
   };
   input.addEventListener(field.kind==='text'?'change':'input',apply);
   row.append(copy,policy,input);details.append(row);
  }
  container.append(details);
 }
 const close=()=>drawer.remove();
 drawer.querySelector<HTMLButtonElement>('[data-tuning-action=close]')!.addEventListener('click',close);
 drawer.querySelector<HTMLButtonElement>('[data-tuning-action=reset]')!.addEventListener('click',()=>{sessionStorage.removeItem(SESSION_KEY);location.reload();});
 drawer.querySelector<HTMLButtonElement>('[data-tuning-action=export]')!.addEventListener('click',()=>{
  const blob=new Blob([`${JSON.stringify(merged,null,2)}\n`],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='level-design.json';link.click();URL.revokeObjectURL(url);
  status.dataset.valid='true';status.textContent='Exported complete validated-field JSON.';
 });
 return {element:drawer,get config(){return merged;},close};
}
