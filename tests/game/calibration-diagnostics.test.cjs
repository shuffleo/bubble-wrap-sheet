const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calibrationDiagnosticsText,clearCalibrationDiagnostics,readCalibrationDiagnostics,saveCalibrationDiagnostics}=require('../../.compiled/game/calibration-diagnostics');

function memoryStorage(){
 let value=null;
 return {getItem:()=>value,setItem:(_key,next)=>{value=next;},removeItem:()=>{value=null;}};
}

test('calibration diagnostics survive reopening the tuning route',()=>{
 const storage=memoryStorage();
 const summary={popsPerSecond:4.25,sampledWindowMs:6000,windows:[{manualPops:12,durationMs:3000,popsPerSecond:4},{manualPops:13.5,durationMs:3000,popsPerSecond:4.5}]};
 saveCalibrationDiagnostics(summary,storage);
 assert.deepEqual(readCalibrationDiagnostics(storage),summary);
 assert.equal(calibrationDiagnosticsText(summary),'4.25 pop/s · 2 windows · 6.0s sampled');
 clearCalibrationDiagnostics(storage);
 assert.equal(readCalibrationDiagnostics(storage),null);
});

test('missing calibration diagnostics stay explicit',()=>{
 assert.equal(readCalibrationDiagnostics(null),null);
 assert.equal(calibrationDiagnosticsText(null),'No Level 2 sample yet.');
});
