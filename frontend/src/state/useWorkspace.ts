import {useEffect, useRef, useState} from 'react';
import {errorMessage, getGraph, getScenario, planScenario, verifyPlan} from '../api/client';
import type {Graph, Plan, Receipt, Scenario, Verification} from '../api/client';

export type Tab = 'Inspect' | 'Plan' | 'Verify' | 'Compare' | 'Receipt';
export type IntegrityResult = {matches: boolean; expected: string; actual: string; verdict: string};

/** One epoch covers the entire request, including the graph fetched after a plan/verification. */
export function useWorkspace(id: string) {
  const [scenario, setScenario] = useState<Scenario>();
  const [before, setBefore] = useState<Graph>();
  const [after, setAfter] = useState<Graph>();
  const [plan, setPlan] = useState<Plan>();
  const [verification, setVerification] = useState<Verification>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [integrity, setIntegrity] = useState<IntegrityResult>();
  const [selected, setSelected] = useState<string[]>([]);
  const [claim, setClaim] = useState('');
  const [strategy, setStrategy] = useState('exact');
  const [maxNodes, setMaxNodes] = useState('200000');
  const [tab, setTab] = useState<Tab>('Inspect');
  const [view, setView] = useState<'before' | 'after'>('before');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);

  useEffect(() => {
    const token = ++epoch.current;
    Promise.all([getScenario(id), getGraph(id, [])]).then(([model, graph]) => {
      if (token !== epoch.current) return;
      setScenario(model); setBefore(graph);
    }).catch(error => { if (token === epoch.current) setError(errorMessage(error)); });
    return () => { ++epoch.current; };
  }, [id]);

  const invalidate = () => {
    ++epoch.current;
    setBusy(false); setVerification(undefined); setIntegrity(undefined); setError('');
  };
  const editSelected = (ids: string[]) => {
    invalidate(); setSelected(ids); setAfter(undefined); setView('before'); setPlan(undefined);
  };
  const editClaim = (value: string) => { invalidate(); setClaim(value); };
  const editStrategy = (value: string) => { invalidate(); setStrategy(value); };
  const editBudget = (value: string) => { invalidate(); setMaxNodes(value); };

  const compute = async (next: Tab = 'Plan') => {
    invalidate(); setPlan(undefined); setReceipt(undefined); setAfter(undefined); setView('before');
    if (!/^\d+$/.test(maxNodes) || !Number.isSafeInteger(Number(maxNodes)) || Number(maxNodes) < 1 || Number(maxNodes) > 2000000) {
      setError('Search budget must be a whole number from 1 to 2000000.'); return;
    }
    const token = ++epoch.current;
    setBusy(true);
    try {
      const result = await planScenario(id, strategy, Number(maxNodes));
      if (token !== epoch.current) return;
      const graph = result.receipt && result.action_ids ? await getGraph(id, result.action_ids) : undefined;
      if (token !== epoch.current) return;
      setPlan(result); setSelected(result.action_ids || []); setClaim('');
      setVerification(result.verification || undefined); setReceipt(result.receipt || undefined);
      setAfter(graph); setView(graph ? 'after' : 'before'); setTab(next);
    } catch (error) { if (token === epoch.current) setError(errorMessage(error)); }
    finally { if (token === epoch.current) setBusy(false); }
  };

  const verify = async () => {
    invalidate();
    if (claim !== '' && (!/^\d+$/.test(claim) || !Number.isSafeInteger(Number(claim)))) {
      setError('Claimed cost must be a non-negative whole number.'); return;
    }
    const token = ++epoch.current;
    const actions = [...selected];
    setBusy(true);
    try {
      const result = await verifyPlan({scenario_id: id, action_ids: actions, ...(claim === '' ? {} : {claimed_total_cost_dh: Number(claim)})});
      if (token !== epoch.current) return;
      const graph = await getGraph(id, actions);
      if (token !== epoch.current) return;
      setVerification(result); setReceipt(result.receipt); setAfter(graph); setView('after'); setTab('Verify');
    } catch (error) { if (token === epoch.current) setError(errorMessage(error)); }
    finally { if (token === epoch.current) setBusy(false); }
  };

  const reverify = async () => {
    if (!receipt) return;
    const displayed = receipt;
    const token = ++epoch.current;
    setBusy(true); setError(''); setIntegrity(undefined);
    try {
      const result = await verifyPlan({
        scenario_id: displayed.scenario_id, action_ids: displayed.action_ids,
        claimed_total_cost_dh: displayed.total_cost_dh, claimed_solver_status: displayed.claimed_solver_status,
      });
      if (token !== epoch.current) return;
      const actual = result.receipt.receipt_fingerprint;
      setIntegrity({matches: actual === displayed.receipt_fingerprint, expected: displayed.receipt_fingerprint, actual, verdict: result.verdict});
    } catch (error) { if (token === epoch.current) setError(errorMessage(error)); }
    finally { if (token === epoch.current) setBusy(false); }
  };

  return {scenario, before, after, graph: view === 'after' && after ? after : before, plan, verification, receipt, integrity,
    selected, claim, strategy, maxNodes, tab, view, busy, error, setTab, setView,
    editSelected, editClaim, editStrategy, editBudget, compute, verify, reverify};
}
