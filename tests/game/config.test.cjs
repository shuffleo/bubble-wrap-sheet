const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'../..');
const configPath=path.join(root,'config/level-design.json');
const schemaPath=path.join(root,'config/level-design.schema.json');
const scriptPath=path.join(root,'scripts/level-design-config.mjs');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const {LEVEL_DESIGN,LEVEL_DESIGN_REVISION}=require('../../.compiled/game/generated/level-design-config');

function runValidator(...arguments){
 return spawnSync(process.execPath,[scriptPath,...arguments],{cwd:root,encoding:'utf8'});
}

function temporaryConfig(t,mutate){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-level-design-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const value=structuredClone(config);
 mutate(value);
 const file=path.join(directory,'level-design.json');
 fs.writeFileSync(file,JSON.stringify(value,null,2));
 return {directory,file,value};
}

test('checked-in level design validates and generated TypeScript matches it',()=>{
 const result=runValidator('--check');
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(LEVEL_DESIGN,config);
 assert.equal(LEVEL_DESIGN_REVISION,config.revision);
});

test('schema failures report the exact JSON Pointer path',t=>{
 const {file}=temporaryConfig(t,value=>{value.categories.touch.rerollPrice=-1;});
 const result=runValidator('--config',file,'--schema',schemaPath,'--check');
 assert.equal(result.status,1);
 assert.match(result.stderr,/\/categories\/touch\/rerollPrice must be >= 0/);
});

test('semantic failures report the exact JSON Pointer path',t=>{
 const {file}=temporaryConfig(t,value=>{value.conveyor.speedStages[1].atMs=0;});
 const result=runValidator('--config',file,'--schema',schemaPath,'--check');
 assert.equal(result.status,1);
 assert.match(result.stderr,/\/conveyor\/speedStages\/1\/atMs must be strictly greater/);
});

test('generation reflects a changed tuning number',t=>{
 const {directory,file}=temporaryConfig(t,value=>{value.scoring.normalBase+=1;});
 const output=path.join(directory,'generated.ts');
 const result=runValidator('--config',file,'--schema',schemaPath,'--out',output);
 assert.equal(result.status,0,result.stderr);
 const generated=fs.readFileSync(output,'utf8');
 assert.match(generated,new RegExp(`"normalBase": ${config.scoring.normalBase+1}`));
 assert.match(generated,/export const LEVEL_DESIGN =/);
 assert.match(generated,/ as const;/);
});

test('all nine bubble sizes are ordered, bounded, and referenced levels exist',()=>{
 const names=['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL'];
 assert.deepEqual(Object.keys(config.sizes),names);
 assert.deepEqual(Object.values(config.sizes),[24,32,40,52,64,82,100,124,148]);
 for(const level of config.run.levels)assert.ok(names.includes(level.bubbleSize),`unknown size ${level.bubbleSize}`);
});

test('all numeric tuning leaves are finite',()=>{
 function visit(value,pointer=''){
  if(typeof value==='number')assert.ok(Number.isFinite(value),`${pointer||'/'} must be finite`);
  else if(Array.isArray(value))value.forEach((entry,index)=>visit(entry,`${pointer}/${index}`));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([key,entry])=>visit(entry,`${pointer}/${key}`));
 }
 visit(config);
});

test('categories price every unique upgrade and shop limits fit the pool',()=>{
 const upgrades=Object.keys(config.upgrades).sort();
 assert.equal(upgrades.length,14);
 for(const category of Object.values(config.categories))assert.deepEqual(Object.keys(category.upgradePrices).sort(),upgrades);
 assert.ok(config.run.shopOfferCount<=upgrades.length);
 assert.ok(config.run.shopPurchaseLimit<=config.run.shopOfferCount);
});

test('levels, shops, and calibration references are internally consistent',()=>{
 assert.equal(config.run.levels.length,config.run.levelCount);
 assert.deepEqual(config.run.levels.map(level=>level.id),[1,2,3,4,5]);
 assert.equal(new Set(config.run.levels.map(level=>level.id)).size,config.run.levelCount);
 assert.ok(config.run.levels.some(level=>level.id===config.calibration.sourceLevel));
 for(const level of config.run.shopsAfterLevels)assert.ok(level>0&&level<config.run.levelCount);
 for(const level of config.run.levels){
  assert.ok(['none','soft','calibrated-hard','conveyor'].includes(level.timer));
  assert.equal(level.sheetCount===0,level.timer==='conveyor');
  assert.deepEqual(Object.keys(level.medals),['metric','bronze','silver','gold','titanium']);
 }
});

test('medal thresholds get harder from bronze through titanium',()=>{
 for(const level of config.run.levels){
  const values=['bronze','silver','gold','titanium'].map(name=>level.medals[name]);
  for(let index=1;index<values.length;index++){
   if(level.medals.metric==='timeSeconds')assert.ok(values[index]<values[index-1]);
   else assert.ok(values[index]>values[index-1]);
  }
 }
});

test('hazard weights are positive and conveyor stages are ordered within duration',()=>{
 assert.ok(Object.values(config.hazards.selectionWeights).every(weight=>weight>0));
 assert.equal(config.conveyor.speedStages[0].atMs,0);
 for(let index=1;index<config.conveyor.speedStages.length;index++)assert.ok(config.conveyor.speedStages[index].atMs>config.conveyor.speedStages[index-1].atMs);
 assert.ok(config.conveyor.speedStages.every(stage=>stage.atMs<config.conveyor.durationMs));
 assert.ok(config.conveyor.clearanceTarget>0&&config.conveyor.clearanceTarget<=1);
});

test('production and standalone HTML embed the complete same revision',()=>{
 const read=file=>{
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const match=html.match(/<script id="level-design-config" type="application\/json" data-revision="([^"]+)">(.*?)<\/script>/s);
  assert.ok(match,`${file} is missing its embedded level design`);
  return {revision:match[1],config:JSON.parse(match[2])};
 };
 const production=read('dist/index.html');
 const standalone=read('standalone.html');
 assert.equal(production.revision,config.revision);
 assert.equal(standalone.revision,config.revision);
 assert.deepEqual(production.config,config);
 assert.deepEqual(standalone.config,config);
});

test('production and standalone HTML embed the tuning schema',()=>{
 const schema=JSON.parse(fs.readFileSync(schemaPath,'utf8'));
 for(const file of ['dist/index.html','standalone.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const match=html.match(/<script id="level-design-schema" type="application\/json">(.*?)<\/script>/s);
  assert.ok(match,`${file} is missing its embedded schema`);
  assert.deepEqual(JSON.parse(match[1]),schema);
 }
});
