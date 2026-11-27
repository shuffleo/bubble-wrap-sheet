import type {CalibrationSummary,CalibrationWindow} from './timed-level';

const CALIBRATION_DIAGNOSTICS_KEY='bubble-survival-calibration-diagnostics-v1';

function defaultStorage():Pick<Storage,'getItem'|'setItem'|'removeItem'>|null {
 try{return typeof sessionStorage==='undefined'?null:sessionStorage;}catch{return null;}
}

export function readCalibrationDiagnostics(storage:Pick<Storage,'getItem'>|null=defaultStorage()):CalibrationSummary|null {
 if(!storage)return null;
 try{
  const value=JSON.parse(storage.getItem(CALIBRATION_DIAGNOSTICS_KEY)||'null');
  if(!Number.isFinite(value?.popsPerSecond)||!Number.isFinite(value?.sampledWindowMs)||!Array.isArray(value?.windows))return null;
  if(!value.windows.every((window:unknown)=>{
   if(!window||typeof window!=='object')return false;
   const candidate=window as Record<string,unknown>;
   return Number.isFinite(candidate.manualPops)&&Number.isFinite(candidate.durationMs)&&Number.isFinite(candidate.popsPerSecond);
  }))return null;
  return {...value,windows:value.windows as CalibrationWindow[]} as CalibrationSummary;
 }catch{return null;}
}

export function saveCalibrationDiagnostics(summary:CalibrationSummary,storage:Pick<Storage,'setItem'>|null=defaultStorage()):void {
 try{storage?.setItem(CALIBRATION_DIAGNOSTICS_KEY,JSON.stringify(summary));}catch{}
}

export function clearCalibrationDiagnostics(storage:Pick<Storage,'removeItem'>|null=defaultStorage()):void {
 try{storage?.removeItem(CALIBRATION_DIAGNOSTICS_KEY);}catch{}
}

export function calibrationDiagnosticsText(summary:CalibrationSummary|null):string {
 if(!summary)return 'No Level 2 sample yet.';
 return `${summary.popsPerSecond.toFixed(2)} pop/s · ${summary.windows.length} windows · ${(summary.sampledWindowMs/1000).toFixed(1)}s sampled`;
}
