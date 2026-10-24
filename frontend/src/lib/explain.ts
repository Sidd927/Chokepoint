import type {Action, Graph, Scenario} from '../api/client';

export const DH_HELP = 'dh = decihours: effort + 2 × downtime, as defined by the scenario. A planning unit, not currency.';

export const assetName = (scenario: Scenario, id?: string) => scenario.assets.find(asset => asset.id === id)?.name ?? id ?? 'unknown asset';

/** Cost of an action in dh, using the same formula as the backend (effort + 2 x downtime). */
export const actionCost = (action: Action) => action.cost_dh ?? ((action.effort_dh ?? 0) + 2 * (action.downtime_dh ?? 0));

/** Plain-language statement of what an action changes, derived only from scenario data. */
export function describeEffect(action: Action, scenario: Scenario): string {
  const asset = assetName(scenario, action.params.asset_id);
  switch (action.kind) {
    case 'patch_finding': {
      const finding = scenario.findings.find(item => item.id === action.params.finding_id);
      return `Fixes ${finding ? `“${finding.title}”` : 'finding'} (${action.params.finding_id}) on ${asset}, removing exploit steps that rely on it.`;
    }
    case 'vault_credentials':
      return `Moves credentials stored on ${asset} into a vault, so they can no longer be reused to log in to other assets.`;
    case 'remove_rule': {
      const rule = scenario.rules.find(item => item.id === action.params.rule_id);
      return `Deletes firewall rule ${action.params.rule_id}${rule ? ` (“${rule.label}”: ${rule.src} → ${rule.dst})` : ''}.`;
    }
    case 'restrict_rule': {
      const rule = scenario.rules.find(item => item.id === action.params.rule_id);
      return `Narrows firewall rule ${action.params.rule_id}${rule ? ` (“${rule.label}”)` : ''} so it only allows the required flows it was created for.`;
    }
  }
}

export const KIND_LABEL: Record<Action['kind'], string> = {
  patch_finding: 'Patch', vault_credentials: 'Vault credentials', remove_rule: 'Remove rule', restrict_rule: 'Restrict rule',
};

/** How many modelled attack connections (in the given graph) rely on what this action changes. */
export function connectionsAffected(action: Action, graph: Graph): number {
  const {asset_id, finding_id, rule_id} = action.params;
  return graph.edges.filter(edge => edge.reasons.some(reason => {
    if (action.kind === 'patch_finding') return reason.finding_id === finding_id && edge.target === asset_id;
    if (action.kind === 'vault_credentials') return reason.type === 'credential' && edge.source === asset_id;
    return rule_id !== undefined && reason.rule_ids.includes(rule_id);
  })).length;
}

const CHECKS: Record<string, [string, string]> = {
  TARGETS_UNREACHABLE: ['Critical targets are cut off', 'No critical target can be reached from an attacker origin after the actions are applied.'],
  FLOWS_PRESERVED: ['Required flows still work', 'Every operational flow the city needs is still permitted by at least one rule.'],
  COST_RECOMPUTED: ['Cost recomputed from the scenario', 'The verifier added up the action costs itself.'],
  COST_CLAIM_MATCHES: ['Claimed cost is correct', 'The cost stated for the plan equals the recomputed cost.'],
  COST_CAP_RESPECTED: ['Within the budget cap', 'The plan does not exceed the scenario’s cost cap (if one is set).'],
  PLAN_HAS_MANDATORY: ['Mandatory actions included', 'Every action the scenario marks as mandatory is in the plan.'],
  PLAN_IDS_KNOWN: ['Actions exist in the catalogue', 'Every selected action ID is defined by the scenario.'],
  PLAN_IDS_UNIQUE: ['No duplicate actions', 'Each action appears at most once.'],
  PLAN_NO_EXCLUSIONS: ['No conflicting actions', 'No two selected actions exclude each other.'],
  SCENARIO_WELL_FORMED: ['Scenario is well-formed', 'The verifier validated the scenario file with its own parser.'],
};
export const checkLabel = (code: string): [string, string] => CHECKS[code] ?? [code, ''];

export const solverMessage = (status: string) =>
  status === 'OPTIMAL' ? 'Exact search finished: no cheaper plan exists in this catalogue.'
  : status === 'FEASIBLE_NOT_PROVEN' ? 'A working plan was found, but the search budget ran out before proving no cheaper plan exists.'
  : 'The solver did not produce a plan it could verify.';
