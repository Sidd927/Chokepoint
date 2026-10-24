export type ScenarioSummary = {
  id: string; name: string; description: string; synthetic: boolean;
  fingerprint: string; counts: Record<string, number>;
};
export type Asset = {
  id: string; name: string; zone: string; kind: string;
  services: {id: string; port: number; finding_ids: string[]}[];
  credentials: {target_asset: string; service_id: string}[];
};
export type Action = {
  id: string; kind: 'patch_finding' | 'vault_credentials' | 'remove_rule' | 'restrict_rule';
  params: {asset_id?: string; finding_id?: string; rule_id?: string};
  description: string; mandatory: boolean; effort_dh?: number; downtime_dh?: number; cost_dh?: number;
};
export type Rule = {id: string; src: string; dst: string; ports: number[] | 'any'; label: string};
export type Scenario = Omit<ScenarioSummary, 'counts'> & {
  zones: {id: string; name: string}[]; assets: Asset[];
  findings: {id: string; title: string; description: string}[];
  rules: Rule[]; required_flows: {id: string; src: string; dst: string; port: number; description: string}[];
  origins: string[]; targets: string[]; actions: Action[];
};
export type Reason = {type: string; service_id: string; port: number; finding_id: string | null; rule_ids: string[]};
export type Graph = {
  scenario_id: string; applied_action_ids: string[];
  nodes: {id: string; name: string; zone: string; kind: string; is_origin: boolean; is_target: boolean; reachable: boolean}[];
  edges: {id: string; source: string; target: string; reasons: Reason[]}[];
  rules: {id: string; status: 'active' | 'removed' | 'restricted'}[];
  flows: {id: string; permitted: boolean; granting_rule_ids: string[]}[];
  reachable_targets: string[]; witness_path: string[] | null;
};
export type Check = {code: string; passed: boolean; detail: string};
export type Receipt = {
  schema: string; verifier: string; scenario_id: string; scenario_fingerprint: string;
  action_ids: string[]; action_costs: {id: string; cost_dh: number}[];
  total_cost_dh: number; action_count: number; claimed_solver_status: string | null;
  verification: {status: string; checks: Check[]; targets_reachable_after: string[]; flows_broken: string[]; violations: {code: string; detail: string}[]};
  receipt_fingerprint: string;
};
export type Verification = {
  verdict: string; checks: Check[]; violations: {code: string; detail: string}[]; receipt: Receipt;
};
export type Plan = {
  solver_status: string; action_ids: string[] | null; total_cost_dh: number | null;
  action_count: number; actions: Action[]; proof?: {exhaustive?: boolean; budget_exhausted?: boolean; nodes_evaluated?: number; max_nodes?: number};
  verification: Verification | null; receipt: Receipt | null; limitations?: string[]; method?: string;
};
export type VerifyRequest = {
  scenario_id: string; action_ids: string[]; claimed_total_cost_dh?: number;
  claimed_solver_status?: string | null;
};

const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base + path, { ...init, headers: {'Content-Type': 'application/json', ...init?.headers} });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`API returned an unreadable response (${response.status}).`); }
  if (!response.ok) throw new Error(body.error?.message || `Request failed (${response.status}).`);
  return body as T;
}
export const getHealth = () => api<{status: string}>('/health');
export const listScenarios = () => api<{scenarios: ScenarioSummary[]}>('/scenarios');
export const getScenario = (id: string) => api<Scenario>('/scenarios/' + encodeURIComponent(id));
export const getGraph = (scenario_id: string, action_ids: string[]) => api<Graph>('/graph', {method: 'POST', body: JSON.stringify({scenario_id, action_ids})});
export const planScenario = async (scenario_id: string, strategy: string, max_nodes: number) => {
  if (!Number.isSafeInteger(max_nodes) || max_nodes < 1 || max_nodes > 2000000) throw new Error('Search budget must be a whole number from 1 to 2000000.');
  return api<Plan>('/plan', {method: 'POST', body: JSON.stringify({scenario_id, strategy, max_nodes})});
};
export const verifyPlan = async (payload: VerifyRequest) => {
  if (payload.claimed_total_cost_dh !== undefined && (!Number.isSafeInteger(payload.claimed_total_cost_dh) || payload.claimed_total_cost_dh < 0)) throw new Error('Claimed cost must be a non-negative whole number.');
  return api<Verification>('/verify', {method: 'POST', body: JSON.stringify(payload)});
};
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request failed. Please try again.';
