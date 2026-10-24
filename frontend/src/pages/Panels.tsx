import {useState} from 'react';
import type {Action, Graph, Scenario} from '../api/client';
import {Callout, Chip, Eyebrow, Stat} from '../components/ui';
import type {useWorkspace} from '../state/useWorkspace';
import {DH_HELP, KIND_LABEL, actionCost, assetName, checkLabel, connectionsAffected, describeEffect, solverMessage} from '../lib/explain';

type Ws = ReturnType<typeof useWorkspace>;
type Highlight = (action?: Action) => void;
const Dh = ({value}: {value: number | string}) => <span title={DH_HELP}>{value} dh</span>;
const hoverProps = (highlight: Highlight, action: Action) => ({onMouseEnter: () => highlight(action), onFocus: () => highlight(action), onMouseLeave: () => highlight(), onBlur: () => highlight()});

function ActionRow({action, scenario, before, highlight}: {action: Action; scenario: Scenario; before: Graph; highlight: Highlight}) {
  const used = connectionsAffected(action, before);
  const breakdown = action.effort_dh !== undefined ? `${action.effort_dh} effort + 2 × ${action.downtime_dh ?? 0} downtime` : undefined;
  return <details className="action" {...hoverProps(highlight, action)} data-testid="action-row">
    <summary><span className="mono id">{action.id}</span><span className="grow">{action.description}</span>{action.mandatory && <Chip tone="warn" title="The scenario requires this action in every plan">mandatory</Chip>}<Chip><Dh value={actionCost(action)}/></Chip></summary>
    <div className="action-body">
      <p>{describeEffect(action, scenario)}</p>
      <dl><div><dt>Type</dt><dd>{KIND_LABEL[action.kind]}</dd></div>
        <div><dt>Cost</dt><dd><Dh value={actionCost(action)}/>{breakdown && <small> ({breakdown})</small>}</dd></div>
        {action.params.asset_id && <div><dt>Asset</dt><dd>{assetName(scenario, action.params.asset_id)} <small className="mono">{action.params.asset_id}</small></dd></div>}
        {action.params.rule_id && <div><dt>Rule</dt><dd className="mono">{action.params.rule_id}</dd></div>}
        {action.params.finding_id && <div><dt>Finding</dt><dd className="mono">{action.params.finding_id}</dd></div>}
        <div><dt>Used by</dt><dd>{used} of {before.edges.length} modelled attack connections</dd></div></dl>
    </div></details>;
}

export function InspectPanel({scenario, graph, highlight}: {scenario: Scenario; graph: Graph; highlight: Highlight}) {
  const names = (ids: string[]) => ids.map(id => assetName(scenario, id)).join(' → ');
  const exposed = graph.reachable_targets.length;
  return <div className="panel-body">
    <header><Eyebrow>Question 1 · What does the network look like?</Eyebrow><h2>Inspect the model</h2></header>
    {exposed > 0
      ? <Callout tone="risk" title={`${exposed} of ${scenario.targets.length} critical targets are reachable from an attacker origin.`}>
        {graph.witness_path && <p>One modelled path: <b>{names(graph.witness_path)}</b></p>}</Callout>
      : <Callout tone="ok" title="No critical target is reachable in the current graph."/>}
    <div className="stats"><Stat value={scenario.assets.length} label="assets"/><Stat value={scenario.zones.length} label="zones"/><Stat value={scenario.findings.length} label="findings"/><Stat value={scenario.required_flows.length} label="required flows"/></div>
    <details open><summary>Required flows <small>services that must keep working</small></summary>
      <ul className="rows">{scenario.required_flows.map(flow => { const state = graph.flows.find(item => item.id === flow.id);
        return <li key={flow.id}><span className="mono id">{flow.id}</span><span className="grow">{flow.description} <small>{assetName(scenario, flow.src)} → {assetName(scenario, flow.dst)} :{flow.port}</small></span>
          <Chip tone={state?.permitted ? 'ok' : 'risk'}>{state?.permitted ? 'permitted' : 'broken'}</Chip></li>; })}</ul></details>
    <details><summary>Action catalogue <small>{scenario.actions.length} possible changes</small></summary>
      <div className="actions">{scenario.actions.map(action => <ActionRow key={action.id} action={action} scenario={scenario} before={graph} highlight={highlight}/>)}</div></details>
    <details><summary>Findings <small>{scenario.findings.length} synthetic weaknesses</small></summary>
      <ul className="rows">{scenario.findings.map(finding => <li key={finding.id}><span className="mono id">{finding.id}</span><span className="grow">{finding.title} <small>{finding.description}</small></span></li>)}</ul></details>
    <details><summary>Assets <small>{scenario.assets.length} modelled systems</small></summary>
      <ul className="rows">{scenario.assets.map(asset => <li key={asset.id}><span className="mono id">{asset.id}</span><span className="grow">{asset.name} <small>{asset.kind} · {asset.zone}{asset.services.length ? ` · ${asset.services.map(service => `${service.id}:${service.port}`).join(', ')}` : ''}</small></span></li>)}</ul></details>
  </div>;
}

export function PlanPanel({state, highlight}: {state: Ws; highlight: Highlight}) {
  const {scenario, plan, strategy, maxNodes, busy, before, after} = state;
  if (!scenario || !before) return null;
  const preserved = after ? after.flows.filter(flow => flow.permitted).length : undefined;
  const optimal = plan?.solver_status === 'OPTIMAL';
  const hasPlan = !!plan && (plan.solver_status === 'OPTIMAL' || plan.solver_status === 'FEASIBLE_NOT_PROVEN');
  return <div className="panel-body">
    <header><Eyebrow>Question 3 · What should we change?</Eyebrow><h2>Plan remediation</h2>
      <p className="lede">A remediation plan is a set of security changes from the scenario’s catalogue that cuts every modelled attack path to the critical targets while keeping required services working.</p></header>
    <div className="form-grid">
      <label>Search strategy<select value={strategy} onChange={event => state.editStrategy(event.target.value)}><option value="exact">Exact search (proves optimality)</option><option value="greedy">Greedy heuristic (fast, not proven)</option></select></label>
      <label>Search budget<input aria-label="Search budget" type="number" min="1" max="2000000" value={maxNodes} onChange={event => state.editBudget(event.target.value)}/><small>Maximum search states to evaluate.</small></label></div>
    <button data-testid="compute-plan" className="btn btn-primary" onClick={state.compute} disabled={busy} aria-busy={busy}>{busy ? 'Computing…' : plan ? 'Recompute plan' : 'Compute plan'}</button>
    {!plan && !busy && <p className="empty">No plan yet. Compute one to see actions, cost and the before/after graph.</p>}
    {plan && <div className="result" data-testid="plan-result">
      <Callout tone={optimal ? 'ok' : hasPlan ? 'warn' : 'risk'} title={<>Solver status: <span data-testid="solver-status" className="mono">{plan.solver_status}</span></>}>
        {solverMessage(plan.solver_status)}{plan.proof?.budget_exhausted && ' The search budget was exhausted.'}</Callout>
      {plan.action_ids?.length === 0 && optimal ? <Callout tone="ok" title="No remediation required for this model."/> : hasPlan && <>
        <div className="stats"><Stat value={<span data-testid="plan-cost">{plan.total_cost_dh ?? '—'} dh</span>} label="total cost" help={DH_HELP}/><Stat value={plan.action_count} label="actions"/>
          <Stat value={plan.proof?.nodes_evaluated ?? 0} label="states searched"/>
          {after && <Stat tone={after.reachable_targets.length === 0 ? 'ok' : 'risk'} value={`${after.reachable_targets.length}/${scenario.targets.length}`} label="targets still reachable"/>}
          {after && <Stat tone={preserved === after.flows.length ? 'ok' : 'risk'} value={`${preserved}/${after.flows.length}`} label="required flows kept"/>}</div>
        {plan.verification && <Callout tone={plan.verification.verdict === 'VERIFIED' ? 'ok' : 'risk'} title={`Independent verifier: ${plan.verification.verdict}`}>
          The verifier re-checked this plan from the raw scenario. <button type="button" className="link" onClick={() => state.setTab('Verify')}>See the checks</button></Callout>}
        <h3>Recommended actions</h3>
        <div className="actions">{plan.actions.map(action => <ActionRow key={action.id} action={action} scenario={scenario} before={before} highlight={highlight}/>)}</div>
        {plan.limitations && plan.limitations.length > 0 && <details><summary>Limitations of this result</summary><ul className="bullets">{plan.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>}</>}
    </div>}
  </div>;
}

export function VerifyPanel({state}: {state: Ws}) {
  const {scenario, selected, claim, verification, busy} = state;
  if (!scenario) return null;
  const failed = verification?.checks?.filter(check => !check.passed) ?? [];
  return <div className="panel-body">
    <header><Eyebrow>Question 5 · Can we trust it?</Eyebrow><h2>Verify a plan independently</h2>
      <p className="lede">The verifier is a separate package. It re-reads the scenario, recomputes costs, flows and reachability, and does not trust the solver’s claims. Choose any set of actions, including your own, and check it.</p></header>
    <fieldset className="picker"><legend>Actions to verify <small>({selected.length} selected)</small></legend>
      <div className="picker-grid">{scenario.actions.map(action => <label className="check" key={action.id}><input data-testid="check-row" type="checkbox" checked={selected.includes(action.id)} onChange={event => state.editSelected(event.target.checked ? [...selected, action.id] : selected.filter(id => id !== action.id))}/>
        <span><b className="mono">{action.id}</b> {action.description}</span></label>)}</div></fieldset>
    <label>Claimed total cost <small>(optional, dh)</small><input aria-label="Claimed total cost" inputMode="numeric" value={claim} onChange={event => state.editClaim(event.target.value)}/></label>
    <button data-testid="verify-run" className="btn btn-primary" onClick={state.verify} disabled={busy} aria-busy={busy}>{busy ? 'Verifying…' : 'Run independent verification'}</button>
    {!verification && !busy && <p className="empty">No verification yet. Compute a plan, or select actions and run the verifier.</p>}
    {verification && <div data-testid="verify-verdict" className={`verdict ${verification.verdict === 'VERIFIED' ? 'verdict-ok' : 'verdict-bad'}`}>
      <div className="verdict-head"><span aria-hidden="true">{verification.verdict === 'VERIFIED' ? '✓' : '✕'}</span><div><Eyebrow>Verdict</Eyebrow><h3>{verification.verdict}</h3></div></div>
      {failed.length > 0 && <Callout tone="risk" title={`${failed.length} check${failed.length > 1 ? 's' : ''} failed`}>This plan is rejected and must not be treated as a valid remediation.</Callout>}
      <ul className="checks">{verification.checks?.map(check => { const [title, why] = checkLabel(check.code);
        return <li key={check.code} className={check.passed ? 'pass' : 'fail'}><span className="mark" aria-label={check.passed ? 'passed' : 'failed'}>{check.passed ? '✓' : '✕'}</span>
          <span className="grow"><b>{title}</b><small>{why}</small></span><span className="mono detail" title={check.detail}>{check.code}: {check.detail}</span></li>; })}</ul>
      <p className="fine">Verified means: these checks pass in the modelled network. It does not prove the plan is the cheapest, and it says nothing about any real network.</p>
      {state.receipt && <button type="button" className="btn btn-secondary" onClick={() => state.setTab('Receipt')}>Open generated receipt</button>}
    </div>}
  </div>;
}

export function ComparePanel({scenario, before, after, plan}: {scenario: Scenario; before: Graph; after?: Graph; plan?: Ws['plan']}) {
  const afterIds = new Set(after?.edges.map(edge => edge.id));
  const removed = after ? before.edges.filter(edge => !afterIds.has(edge.id)) : [];
  const preserved = after?.flows.filter(flow => flow.permitted).length;
  return <div className="panel-body">
    <header><Eyebrow>Question 4 · What improved?</Eyebrow><h2>Before and after</h2></header>
    <div className="compare">
      <div data-testid="compare-before" className="side side-before"><Eyebrow>Before</Eyebrow><strong>{before.reachable_targets.length}<small> / {scenario.targets.length}</small></strong><p>critical targets reachable</p><small>{before.edges.length} modelled attack connections</small></div>
      <div data-testid="compare-after" className={`side ${after ? (after.reachable_targets.length ? 'side-before' : 'side-after') : 'side-neutral'}`}><Eyebrow>After</Eyebrow>
        <strong>{after ? after.reachable_targets.length : '—'}{after && <small> / {scenario.targets.length}</small>}</strong><p>{after ? 'critical targets reachable' : 'compute or verify a plan to compare'}</p>
        <small>{after ? `${after.edges.length} attack connections · ${after.applied_action_ids.length} actions applied` : '—'}</small></div>
    </div>
    {!after ? <p className="empty">Nothing to compare yet. The graph shown is the baseline.</p> : <>
      <h3>Critical targets</h3>
      <ul className="rows">{scenario.targets.map(id => <li key={id}><span className="grow">{assetName(scenario, id)}</span>
        <Chip tone={before.reachable_targets.includes(id) ? 'risk' : 'ok'}>before: {before.reachable_targets.includes(id) ? 'reachable' : 'cut off'}</Chip><Chip tone={after.reachable_targets.includes(id) ? 'risk' : 'ok'}>after: {after.reachable_targets.includes(id) ? 'reachable' : 'cut off'}</Chip></li>)}</ul>
      <h3>Required flows <small>{preserved}/{after.flows.length} still permitted</small></h3>
      <ul className="rows">{after.flows.map(flow => <li key={flow.id}><span className="mono id">{flow.id}</span><span className="grow">{scenario.required_flows.find(item => item.id === flow.id)?.description}</span><Chip tone={flow.permitted ? 'ok' : 'risk'}>{flow.permitted ? 'kept' : 'broken'}</Chip></li>)}</ul>
      <details><summary>{removed.length} attack connections removed <small>the graph shows them as dashed “blocked” arrows</small></summary>
        <ul className="rows">{removed.map(edge => <li key={edge.id}><span className="grow">{assetName(scenario, edge.source)} → {assetName(scenario, edge.target)}</span></li>)}</ul></details>
      <p className="fine">Selected plan: {after.applied_action_ids.join(', ') || 'none'}{plan?.total_cost_dh !== undefined && plan.total_cost_dh !== null ? ` · cost ${plan.total_cost_dh} dh` : ''}. This is a model comparison, not a deployment confirmation.</p></>}
  </div>;
}

export function ReceiptPanel({receipt, onReverify, busy, integrity}: {receipt?: Ws['receipt']; onReverify: () => void; busy: boolean; integrity?: Ws['integrity']}) {
  const [note, setNote] = useState<{tone: 'ok' | 'risk'; text: string}>();
  if (!receipt) return <div className="panel-body"><header><Eyebrow>Evidence</Eyebrow><h2>Verification receipt</h2></header><p className="empty">No receipt yet. Compute a plan or run verification to generate one.</p></div>;
  const json = JSON.stringify(receipt, null, 2);
  const status = receipt.verification.status;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setNote({tone: 'ok', text: `${what} copied.`}); } catch { setNote({tone: 'risk', text: 'Copy failed: the browser did not grant clipboard access. Use Download instead.'}); } };
  return <div className="panel-body">
    <header><Eyebrow>Evidence</Eyebrow><h2>Verification receipt</h2></header>
    <div className="digest"><div><Eyebrow>SHA-256 digest</Eyebrow><code data-testid="receipt-digest">{receipt.receipt_fingerprint}</code></div><Chip tone={status === 'VERIFIED' ? 'ok' : 'risk'}>{status}</Chip></div>
    <dl className="facts">
      <div><dt>Scenario</dt><dd className="mono">{receipt.scenario_id}</dd></div>
      <div><dt>Scenario digest</dt><dd className="mono">{receipt.scenario_fingerprint.slice(0, 23)}…</dd></div>
      <div><dt>Actions</dt><dd className="mono">{receipt.action_ids.join(', ') || 'none'}</dd></div>
      <div><dt>Total cost</dt><dd><Dh value={receipt.total_cost_dh}/> · {receipt.action_count} actions</dd></div>
      <div><dt>Solver status claimed</dt><dd>{receipt.claimed_solver_status ?? 'not provided'}</dd></div>
      <div><dt>Verifier</dt><dd className="mono">{receipt.verifier}</dd></div>
      <div><dt>Targets reachable after</dt><dd>{receipt.verification.targets_reachable_after.length ? receipt.verification.targets_reachable_after.join(', ') : 'none'}</dd></div>
      <div><dt>Required flows broken</dt><dd>{receipt.verification.flows_broken.length ? receipt.verification.flows_broken.join(', ') : 'none'}</dd></div>
    </dl>
    <div className="receipt-actions">
      <a className="btn btn-primary" data-testid="receipt-download" download={`chokepoint-${receipt.scenario_id}-${receipt.receipt_fingerprint.slice(7, 15)}.receipt.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}>Download receipt (JSON)</a>
      <button className="btn btn-secondary" data-testid="receipt-copy" onClick={() => copy(json, 'Receipt JSON')}>Copy JSON</button>
      <button className="btn btn-secondary" onClick={() => copy(receipt.receipt_fingerprint, 'Digest')}>Copy digest</button>
      <button className="btn btn-secondary" data-testid="receipt-reverify" onClick={onReverify} disabled={busy}>Re-verify displayed receipt</button></div>
    {note && <Callout tone={note.tone} role="status">{note.text}</Callout>}
    {integrity && <Callout testId="receipt-integrity" tone={integrity.matches ? 'ok' : 'risk'} title={integrity.matches ? 'Receipt fingerprint matches' : 'Receipt fingerprint mismatch'} role="status">
      The verifier recomputed this receipt (verdict {integrity.verdict}). <span className="mono">Expected {integrity.expected}<br/>Returned {integrity.actual}</span></Callout>}
    <details><summary>Full receipt JSON</summary><pre data-testid="receipt-json">{json}</pre></details>
    <p className="fine">The digest is a SHA-256 integrity fingerprint of the canonical receipt. It is not a digital signature, does not authenticate who produced it, and is not proof of real-world security.</p>
  </div>;
}
