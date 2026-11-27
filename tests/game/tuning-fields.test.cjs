const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setTuningValue,tuningFields,validateTuningValue}=require('../../.compiled/game/tuning/tuning-fields');
const {tuningRestartPolicy}=require('../../.compiled/game/tuning/tuning-policy');

const config=JSON.parse(fs.readFileSync('config/level-design.json','utf8'));
const schema=JSON.parse(fs.readFileSync('config/level-design.schema.json','utf8'));
const fields=tuningFields(schema,config);

test('schema generates editable fields for every tuning group',()=>{
 const expected=Object.keys(config).filter(key=>!['schemaVersion','revision'].includes(key)).sort();
 assert.deepEqual([...new Set(fields.map(field=>field.group))].sort(),expected);
 assert.ok(fields.length>80);
 assert.ok(fields.some(field=>field.pointer==='/run/levels/0/timer'&&field.kind==='select'));
 assert.ok(fields.some(field=>field.pointer==='/upgrades/velocityBuff/enabled'&&field.kind==='boolean'));
});

test('pointer updates clone config without mutating the source',()=>{
 const changed=setTuningValue(config,'/scoring/normalBase',14);
 assert.equal(changed.scoring.normalBase,14);
 assert.equal(config.scoring.normalBase,10);
});

test('field validation enforces schema bounds and enums',()=>{
 const score=fields.find(field=>field.pointer==='/scoring/normalBase');
 const timer=fields.find(field=>field.pointer==='/run/levels/0/timer');
 assert.equal(validateTuningValue(score,-1),'Minimum 0.');
 assert.equal(validateTuningValue(score,12),null);
 assert.equal(validateTuningValue(timer,'invalid'),'Choose an allowed value.');
});

test('restart labels distinguish immediate, sheet, level, and run changes',()=>{
 assert.equal(tuningRestartPolicy('/ui/scorePulseMs'),'none');
 assert.equal(tuningRestartPolicy('/sizes/M'),'sheet');
 assert.equal(tuningRestartPolicy('/scoring/normalBase'),'level');
 assert.equal(tuningRestartPolicy('/hazards/doubleLayer/layers'),'run');
});
