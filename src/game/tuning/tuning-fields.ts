import {tuningRestartPolicy,type RestartPolicy} from './tuning-policy';

export interface JsonSchemaNode {
 type?:string;
 const?:unknown;
 enum?:unknown[];
 minimum?:number;
 maximum?:number;
 exclusiveMinimum?:number;
 exclusiveMaximum?:number;
 properties?:Record<string,JsonSchemaNode>;
 items?:JsonSchemaNode;
 $ref?:string;
}

export interface TuningField {
 pointer:string;
 group:string;
 label:string;
 kind:'number'|'boolean'|'select'|'text';
 value:string|number|boolean;
 minimum?:number;
 maximum?:number;
 step?:number;
 options?:unknown[];
 restart:RestartPolicy;
 schema:JsonSchemaNode;
}

function resolve(schema:JsonSchemaNode,root:JsonSchemaNode):JsonSchemaNode {
 if(!schema.$ref)return schema;
 if(!schema.$ref.startsWith('#/'))throw new Error(`Unsupported schema reference: ${schema.$ref}`);
 let value:unknown=root;
 for(const part of schema.$ref.slice(2).split('/'))value=(value as Record<string,unknown>)[part.replace(/~1/g,'/').replace(/~0/g,'~')];
 return value as JsonSchemaNode;
}

function label(pointer:string):string {
 const parts=pointer.split('/'),raw=parts[parts.length-1].replace(/~1/g,'/').replace(/~0/g,'~');
 if(/^\d+$/.test(raw))return `Item ${Number(raw)+1}`;
 return raw.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\b\w/g,(letter:string)=>letter.toUpperCase());
}

function walk(schema:JsonSchemaNode,value:unknown,pointer:string,group:string,root:JsonSchemaNode,fields:TuningField[]){
 const resolved=resolve(schema,root);
 if(resolved.properties&&value&&typeof value==='object'&&!Array.isArray(value)){
  for(const [key,child] of Object.entries(resolved.properties)){
   if(!Object.prototype.hasOwnProperty.call(value,key))continue;
   walk(child,(value as Record<string,unknown>)[key],`${pointer}/${key}`,group,root,fields);
  }
  return;
 }
 if(resolved.items&&Array.isArray(value)){
  value.forEach((entry,index)=>walk(resolved.items!,entry,`${pointer}/${index}`,group,root,fields));
  return;
 }
 if(!['string','number','boolean'].includes(typeof value))return;
 const kind=resolved.enum?'select':typeof value==='number'?'number':typeof value==='boolean'?'boolean':'text';
 fields.push({
  pointer,group,label:label(pointer),kind,value:value as string|number|boolean,
  minimum:resolved.minimum,maximum:resolved.maximum,
  step:resolved.type==='integer'?1:typeof value==='number'?0.01:undefined,
  options:resolved.enum,restart:tuningRestartPolicy(pointer),schema:resolved
 });
}

export function tuningFields(schema:JsonSchemaNode,config:Record<string,unknown>):TuningField[] {
 const fields:TuningField[]=[];
 for(const [group,node] of Object.entries(schema.properties||{})){
  if(group==='schemaVersion'||group==='revision'||!Object.prototype.hasOwnProperty.call(config,group))continue;
  walk(node,config[group],`/${group}`,group,schema,fields);
 }
 return fields;
}

export function setTuningValue<T extends Record<string,unknown>>(config:T,pointer:string,value:unknown):T {
 const clone=structuredClone(config);
 const parts=pointer.slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));
 let target:unknown=clone;
 for(let index=0;index<parts.length-1;index++)target=(target as Record<string,unknown>)[parts[index]];
 (target as Record<string,unknown>)[parts[parts.length-1]]=value;
 return clone;
}

export function validateTuningValue(field:TuningField,value:unknown):string|null {
 if(field.kind==='number'){
  if(typeof value!=='number'||!Number.isFinite(value))return 'Enter a finite number.';
  if(field.minimum!==undefined&&value<field.minimum)return `Minimum ${field.minimum}.`;
  if(field.maximum!==undefined&&value>field.maximum)return `Maximum ${field.maximum}.`;
  if(field.schema.exclusiveMinimum!==undefined&&value<=field.schema.exclusiveMinimum)return `Must be greater than ${field.schema.exclusiveMinimum}.`;
  if(field.schema.exclusiveMaximum!==undefined&&value>=field.schema.exclusiveMaximum)return `Must be less than ${field.schema.exclusiveMaximum}.`;
 }
 if(field.options&&!field.options.includes(value))return 'Choose an allowed value.';
 return null;
}
