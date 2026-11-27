export type RestartPolicy='none'|'sheet'|'level'|'run';

export function tuningRestartPolicy(pointer:string):RestartPolicy {
 if(pointer.startsWith('/ui/'))return 'none';
 if(pointer.startsWith('/sizes/'))return 'sheet';
 if(pointer.startsWith('/categories/')||pointer.startsWith('/scoring/'))return 'level';
 return 'run';
}

export const RESTART_POLICY_LABEL:Record<RestartPolicy,string>={
 none:'Applies now',
 sheet:'Next sheet',
 level:'Restart level',
 run:'New run'
};
