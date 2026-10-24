const base=import.meta.env.VITE_API_BASE_URL||'/api/v1';
export async function api<T>(path:string, init?:RequestInit):Promise<T>{const r=await fetch(base+path,{headers:{'Content-Type':'application/json'},...init}); const body=await r.json(); if(!r.ok) throw new Error(body.error?.message||'Request failed'); return body;}
export type ScenarioSummary={id:string,name:string,description:string,synthetic:boolean,fingerprint:string,counts:Record<string,number>};
export type Scenario=any; export type Graph=any; export type Plan=any; export type Verification=any;
export const listScenarios=()=>api<{scenarios:ScenarioSummary[]}>('/scenarios');
export const getScenario=(id:string)=>api<Scenario>('/scenarios/'+encodeURIComponent(id));
export const getGraph=(scenario_id:string,action_ids:string[])=>api<Graph>('/graph',{method:'POST',body:JSON.stringify({scenario_id,action_ids})});
export const planScenario=(scenario_id:string,strategy:string,max_nodes:number)=>api<Plan>('/plan',{method:'POST',body:JSON.stringify({scenario_id,strategy,max_nodes})});
export const verifyPlan=(payload:any)=>api<Verification>('/verify',{method:'POST',body:JSON.stringify(payload)});
