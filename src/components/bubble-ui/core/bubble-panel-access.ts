/** UI opt-in, not authentication. No pathname/hash substring matching. */
export function panelAllowed(search:string=typeof location==='undefined'?'':location.search):boolean {
 const values=new URLSearchParams(search).getAll('panel');
 return values.length===1&&values[0]==='show';
}
