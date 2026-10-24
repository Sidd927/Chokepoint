import {useCallback, useEffect, useRef, useState} from 'react';
import {errorMessage, getGraph, getScenario, listScenarios, planScenario} from '../api/client';
import type {Action, Graph, Plan, Scenario} from '../api/client';

export type Story = {
  scenario: Scenario; before: Graph; after: Graph; plan: Plan;
  /** A cheap single action that, applied alone, breaks a required flow. Found by asking the real graph endpoint. */
  careless?: {action: Action; graph: Graph; brokenFlowIds: string[]};
};
export type StoryState = {status: 'loading'} | {status: 'error'; message: string} | {status: 'ready'; story: Story};

const looksValid = (scenario: Scenario, graph: Graph) => Array.isArray(scenario?.assets) && Array.isArray(scenario?.actions) && Array.isArray(graph?.nodes) && Array.isArray(graph?.edges);

/**
 * Loads one real synthetic scenario (prefers the small canonical one) and derives the narrative from live API results:
 * the baseline graph, the plan the solver returns, the graph after that plan, and a genuinely flow-breaking quick fix.
 */
export function useStory(): {state: StoryState; retry: () => void} {
  const [state, setState] = useState<StoryState>({status: 'loading'});
  const epoch = useRef(0);
  const load = useCallback(() => {
    const token = ++epoch.current;
    setState({status: 'loading'});
    (async () => {
      const list = (await listScenarios()).scenarios;
      const pick = list.find(item => item.id === 'canonical_city') ?? [...list].sort((a, b) => a.counts.assets - b.counts.assets)[0];
      if (!pick) throw new Error('The API returned no scenarios.');
      const [scenario, before, plan] = await Promise.all([getScenario(pick.id), getGraph(pick.id, []), planScenario(pick.id, 'exact', 200000)]);
      if (!looksValid(scenario, before)) throw new Error('The API returned an unexpected scenario shape.');
      if (!plan.action_ids || !plan.receipt || !plan.verification) throw new Error(`The solver returned status ${plan.solver_status}; there is no verified plan to show.`);
      const after = await getGraph(pick.id, plan.action_ids);
      let careless: Story['careless'];
      for (const action of scenario.actions.filter(item => item.kind === 'remove_rule' && !item.mandatory)) {
        const graph = await getGraph(pick.id, [action.id]);
        const brokenFlowIds = graph.flows.filter(flow => !flow.permitted).map(flow => flow.id);
        if (brokenFlowIds.length) { careless = {action, graph, brokenFlowIds}; break; }
      }
      if (token === epoch.current) setState({status: 'ready', story: {scenario, before, after, plan, careless}});
    })().catch(error => { if (token === epoch.current) setState({status: 'error', message: errorMessage(error)}); });
  }, []);
  useEffect(() => { load(); return () => { ++epoch.current; }; }, [load]);
  return {state, retry: load};
}
