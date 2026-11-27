import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const DEFAULT_LEVEL_DESIGN_PATH=path.join(repositoryRoot,'config/level-design.json');
export const DEFAULT_LEVEL_DESIGN_SCHEMA_PATH=path.join(repositoryRoot,'config/level-design.schema.json');
export const DEFAULT_GENERATED_CONFIG_PATH=path.join(repositoryRoot,'src/game/generated/level-design-config.ts');

export class LevelDesignValidationError extends Error{
 constructor(issues){
  super(`Invalid level design:\n${issues.map(issue=>`${issue.path} ${issue.message}`).join('\n')}`);
  this.name='LevelDesignValidationError';
  this.issues=issues;
 }
}

function readJson(file,label){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}
 catch(error){
  const detail=error instanceof SyntaxError?error.message:`${label} could not be read: ${error.message}`;
  throw new LevelDesignValidationError([{path:'/',message:detail}]);
 }
}

function escapePointer(value){
 return String(value).replaceAll('~','~0').replaceAll('/','~1');
}

function issuePath(error){
 let result=error.instancePath||'/';
 if(error.keyword==='required')result=`${result==='/'?'':result}/${escapePointer(error.params.missingProperty)}`;
 if(error.keyword==='additionalProperties')result=`${result==='/'?'':result}/${escapePointer(error.params.additionalProperty)}`;
 return result||'/';
}

function semanticIssues(config){
 const issues=[];
 const add=(path,message)=>issues.push({path,message});
 const sizeEntries=Object.entries(config.sizes);
 for(let index=1;index<sizeEntries.length;index++){
  if(sizeEntries[index][1]<=sizeEntries[index-1][1])add(`/sizes/${sizeEntries[index][0]}`,'must be larger than the preceding size');
 }
 for(const [name,category] of Object.entries(config.categories)){
  if(category.calibrationMinPopsPerSecond>category.calibrationMaxPopsPerSecond)add(`/categories/${name}/calibrationMaxPopsPerSecond`,'must be greater than or equal to calibrationMinPopsPerSecond');
 }
 if(config.scoring.velocity.minimumMultiplier>config.scoring.velocity.maximumMultiplier)add('/scoring/velocity/maximumMultiplier','must be greater than or equal to minimumMultiplier');
 if(config.scoring.deadline.minimumMultiplier>config.scoring.deadline.maximumMultiplier)add('/scoring/deadline/maximumMultiplier','must be greater than or equal to minimumMultiplier');
 if(config.run.levels.length!==config.run.levelCount)add('/run/levels',`must contain exactly levelCount (${config.run.levelCount}) entries`);
 const levelIds=new Set();
 config.run.levels.forEach((level,index)=>{
  if(levelIds.has(level.id))add(`/run/levels/${index}/id`,'must be unique');
  levelIds.add(level.id);
  if(level.id!==index+1)add(`/run/levels/${index}/id`,`must be ${index+1} so levels stay ordered`);
  if(level.timer==='conveyor'&&level.sheetCount!==0)add(`/run/levels/${index}/sheetCount`,'must be 0 for a conveyor level');
  if(level.timer!=='conveyor'&&level.sheetCount===0)add(`/run/levels/${index}/sheetCount`,'must be positive outside a conveyor level');
  const targets=['bronze','silver','gold','titanium'].map(name=>level.medals[name]);
  const lowerIsBetter=level.medals.metric==='timeSeconds';
  for(let target=1;target<targets.length;target++){
   const ordered=lowerIsBetter?targets[target]<targets[target-1]:targets[target]>targets[target-1];
   if(!ordered)add(`/run/levels/${index}/medals/${['bronze','silver','gold','titanium'][target]}`,`must be ${lowerIsBetter?'lower':'higher'} than the preceding medal`);
  }
 });
 config.run.shopsAfterLevels.forEach((level,index)=>{
  if(level>=config.run.levelCount)add(`/run/shopsAfterLevels/${index}`,'must refer to a level before the final level');
 });
 const upgradeCount=Object.keys(config.upgrades).length;
 if(config.run.shopOfferCount>upgradeCount)add('/run/shopOfferCount',`must not exceed the ${upgradeCount} unique upgrades`);
 if(config.run.shopPurchaseLimit>config.run.shopOfferCount)add('/run/shopPurchaseLimit','must not exceed shopOfferCount');
 if(!levelIds.has(config.calibration.sourceLevel))add('/calibration/sourceLevel','must refer to an existing level');
 if(config.calibration.hardDeadlineMinSeconds>config.calibration.hardDeadlineMaxSeconds)add('/calibration/hardDeadlineMaxSeconds','must be greater than or equal to hardDeadlineMinSeconds');
 if(config.hazards.memoryFoam.warningMs>config.hazards.memoryFoam.intervalMs)add('/hazards/memoryFoam/warningMs','must not exceed intervalMs');
 let previous=-1;
 config.conveyor.speedStages.forEach((stage,index)=>{
  if(index===0&&stage.atMs!==0)add('/conveyor/speedStages/0/atMs','must start at 0');
  if(stage.atMs<=previous)add(`/conveyor/speedStages/${index}/atMs`,'must be strictly greater than the preceding stage');
  if(stage.atMs>=config.conveyor.durationMs)add(`/conveyor/speedStages/${index}/atMs`,'must occur before durationMs');
  previous=stage.atMs;
 });
 return issues;
}

export function validateLevelDesign({
 configPath=DEFAULT_LEVEL_DESIGN_PATH,
 schemaPath=DEFAULT_LEVEL_DESIGN_SCHEMA_PATH
}={}){
 const schema=readJson(schemaPath,'Level-design schema');
 const config=readJson(configPath,'Level-design config');
 const ajv=new Ajv({allErrors:true,strict:true});
 const valid=ajv.validate(schema,config);
 const issues=valid?[]:ajv.errors.map(error=>({path:issuePath(error),message:error.message||'is invalid'}));
 issues.push(...(valid?semanticIssues(config):[]));
 if(issues.length)throw new LevelDesignValidationError(issues);
 return config;
}

export function generatedLevelDesignSource(config){
 return `// Generated by scripts/level-design-config.mjs from config/level-design.json.\n// Do not edit this file directly.\nexport const LEVEL_DESIGN = ${JSON.stringify(config,null,2)} as const;\nexport const LEVEL_DESIGN_REVISION = LEVEL_DESIGN.revision;\nexport type LevelDesign = typeof LEVEL_DESIGN;\n`;
}

export function writeGeneratedLevelDesign(config,outputPath=DEFAULT_GENERATED_CONFIG_PATH){
 const source=generatedLevelDesignSource(config);
 fs.mkdirSync(path.dirname(outputPath),{recursive:true});
 if(!fs.existsSync(outputPath)||fs.readFileSync(outputPath,'utf8')!==source)fs.writeFileSync(outputPath,source);
 return source;
}

export function generateLevelDesign(options={}){
 const config=validateLevelDesign(options);
 if(options.outputPath!==null)writeGeneratedLevelDesign(config,options.outputPath||DEFAULT_GENERATED_CONFIG_PATH);
 return config;
}

function parseArguments(argv){
 const options={};
 for(let index=0;index<argv.length;index++){
  const argument=argv[index];
  if(argument==='--check'){options.outputPath=null;continue;}
  const key=argument==='--config'?'configPath':argument==='--schema'?'schemaPath':argument==='--out'?'outputPath':null;
  if(!key)throw new Error(`Unknown argument: ${argument}`);
  if(index+1>=argv.length)throw new Error(`Missing value for ${argument}`);
  options[key]=path.resolve(argv[++index]);
 }
 return options;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const options=parseArguments(process.argv.slice(2));
  const config=generateLevelDesign(options);
  console.log(`Level design ${config.revision} is valid${options.outputPath===null?'.':` and generated at ${path.relative(process.cwd(),options.outputPath||DEFAULT_GENERATED_CONFIG_PATH)}.`}`);
 }catch(error){
  console.error(error.message);
  process.exitCode=1;
 }
}
