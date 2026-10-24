import {useState} from 'react';
import type {ReactNode} from 'react';
import type {Action, Graph, Scenario} from '../api/client';
import {Callout} from '../components/ui';
import type {useWorkspace} from '../state/useWorkspace';
import {DH_HELP, KIND_LABEL, actionCost, assetName, checkLabel, connectionsAffected, describeEffect, solverMessage} from '../lib/explain';

type Ws = ReturnType<typeof useWorkspace>;
type Highlight = (action?: Action) => void;
const Dh = ({value}: {value: number | string}) => <span title={DH_HELP}>{value}&nbsp;dh</span>;
const hoverProps = (highlight: Highlight, action: Action) => ({onMouseEnter: () => highlight(action), onFocus: () => highlight(action), onMouseLeave: () => highlight(), onBlur: () => highlight()});

/** Collapsed-by-default section: a one-line summary first, detail on demand. */
export function Disclosure({title, meta, open, children}: {title: string; meta?: ReactNode; open?: boolean; children: ReactNode}) {
  return <details className="disclosure" open={open}><summary><span>{title}</span>{meta && <small>{meta}</small>}</summary><div className="disclosure-body">{children}</div></details>;
}

function ActionRow({action, scenario, before, highlight}: {action: Action; scenario: Scenario; before: Graph; highlight: Highlight}) {
  const used = connectionsAffected(action, before);
  const breakdown = action.effort_dh !== undefined ? `${action.effort_dh} effort + 2 × ${action.downtime_dh ?? 0} downtime` : undefined;
  return <details className="action" {...hoverProps(highlight, action)} data-testid="action-row">
    <summary><span className="mono id">{action.id}</span><span className="grow">{action.description}{action.mandatory && <small className="tag" title="The scenario requires this action in every plan"> · required</small>}</span><span className="cost"><Dh value={actionCost(action)}/></span></summary>
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

const Empty = ({title, children, action}: {title: string; children: ReactNode; action?: ReactNode}) =>
  <div className="empty-state"><h2 className="headline">{title}</h2><p className="lede">{children}</p>{action}</div>;

export function InspectPanel({scenario, graph, highlight, onPlan, busy}: {scenario: Scenario; graph: Graph; highlight: Highlight; onPlan: () => void; busy: boolean}) {
  const names = (ids: string[]) => ids.map(id => assetName(scenario, id)).join(' → ');
  const exposed = graph.reachable_targets.length;
  const permitted = graph.flows.filter(flow => flow.permitted).length;
  return <div className="panel-body">
    <h2 className="headline">{exposed > 0 ? <>{exposed} of {scenario.targets.length} critical targets <em className="risk">can be reached</em> from an attacker origin.</> : <>No critical target is reachable.</>}</h2>
    {graph.witness_path && <p className="lede">One modelled route: <b>{names(graph.witness_path)}</b>. Highlighted in the graph.</p>}
    <p className="facts-line">{scenario.assets.length} assets · {scenario.zones.length} zones · {scenario.findings.length} findings · {scenario.required_flows.length} required flows</p>
    <div className="actions-row"><button type="button" className="btn btn-primary" onClick={onPlan} disabled={busy}>{busy ? 'Working…' : 'Generate plan'}</button></div>
    <div className="disclosures">
      <Disclosure title="Required flows" meta={`${permitted} of ${graph.flows.length} permitted · must keep working`}>
        <ul className="rows">{scenario.required_flows.map(flow => { const state = graph.flows.find(item => item.id === flow.id);
          return <li key={flow.id}><span className="mono id">{flow.id}</span><span className="grow">{flow.description} <small>{assetName(scenario, flow.src)} → {assetName(scenario, flow.dst)} :{flow.port}</small></span>
            <span className={state?.permitted ? 'ok-text' : 'risk-text'}>{state?.permitted ? '✓ permitted' : '✕ broken'}</span></li>; })}</ul></Disclosure>
      <Disclosure title="Action catalogue" meta={`${scenario.actions.length} possible changes`}><div className="actions">{scenario.actions.map(action => <ActionRow key={action.id} action={action} scenario={scenario} before={graph} highlight={highlight}/>)}</div></Disclosure>
      <Disclosure title="Findings" meta={`${scenario.findings.length} synthetic weaknesses`}><ul className="rows">{scenario.findings.map(finding => <li key={finding.id}><span className="mono id">{finding.id}</span><span className="grow">{finding.title} <small>{finding.description}</small></span></li>)}</ul></Disclosure>
      <Disclosure title="Assets" meta={`${scenario.assets.length} modelled systems`}><ul className="rows">{scenario.assets.map(asset => <li key={asset.id}><span className="mono id">{asset.id}</span><span className="grow">{asset.name} <small>{asset.kind} · {asset.zone}{asset.services.length ? ` · ${asset.services.map(service => `${service.id}:${service.port}`).join(', ')}` : ''}</small></span></li>)}</ul></Disclosure>
    </div>
  </div>;
}

export function PlanPanel({state, highlight}: {state: Ws; highlight: Highlight}) {
  const {scenario, plan, strategy, maxNodes, busy, before, after} = state;
  if (!scenario || !before) return null;
  const preserved = after ? after.flows.filter(flow => flow.permitted).length : undefined;
  const optimal = plan?.solver_status === 'OPTIMAL';
  const hasPlan = !!plan && (plan.solver_status === 'OPTIMAL' || plan.solver_status === 'FEASIBLE_NOT_PROVEN');
  const settings = <Disclosure title="Search settings" meta="strategy and budget">
    <div className="form-grid">
      <label>Search strategy<select value={strategy} onChange={event => state.editStrategy(event.target.value)}><option value="exact">Exact search (can prove optimality)</option><option value="greedy">Greedy heuristic (fast, never proven)</option></select></label>
      <label>Search budget<input aria-label="Search budget" type="number" min="1" max="2000000" value={maxNodes} onChange={event => state.editBudget(event.target.value)}/><small>Maximum states the exact search may evaluate before it must stop.</small></label></div></Disclosure>;
  const run = <button data-testid="compute-plan" className={`btn ${plan ? 'btn-secondary' : 'btn-primary'}`} onClick={() => state.compute()} disabled={busy} aria-busy={busy}>{busy ? 'Computing…' : plan ? 'Recompute plan' : 'Compute plan'}</button>;
  if (!plan) return <div className="panel-body"><Empty title="Find the cheapest safe fix." action={<div className="actions-row">{run}</div>}>
    The planner searches combinations of the scenario’s catalogue actions, prices each one, and discards any that would break a required flow. It stops with the cheapest plan that cuts every modelled route to the critical targets.</Empty>{settings}</div>;
  return <div className="panel-body" data-testid="plan-result">
    {hasPlan && plan.action_ids?.length !== 0 ? <h2 className="headline">{optimal ? 'Optimal plan' : 'Feasible plan'}: <span data-testid="plan-cost">{plan.total_cost_dh ?? '—'}&nbsp;dh</span> across {plan.action_count} actions{optimal ? '.' : ', not proven cheapest.'}</h2>
      : plan.action_ids?.length === 0 && optimal ? <h2 className="headline">No remediation required for this model.</h2>
      : <h2 className="headline"><em className="risk">No plan was produced.</em></h2>}
    <p className="lede"><b className="mono" data-testid="solver-status">{plan.solver_status}</b> — {solverMessage(plan.solver_status)}{plan.proof?.budget_exhausted && ' The search budget was exhausted.'}</p>
    {hasPlan && after && <dl className="outcome">
      <div><dt>Critical targets reachable</dt><dd><span className="risk-text">{before.reachable_targets.length}</span> → <span className={after.reachable_targets.length === 0 ? 'ok-text' : 'risk-text'}>{after.reachable_targets.length}</span></dd></div>
      <div><dt>Required flows kept</dt><dd className={preserved === after.flows.length ? 'ok-text' : 'risk-text'}>{preserved} of {after.flows.length}</dd></div>
      <div><dt>Independent verifier</dt><dd className={plan.verification?.verdict === 'VERIFIED' ? 'ok-text' : 'risk-text'}>{plan.verification?.verdict ?? 'not run'}</dd></div></dl>}
    {hasPlan && <><h3 className="subhead">Recommended actions <small>{plan.proof?.nodes_evaluated ?? 0} states searched</small></h3>
      <div className="actions">{plan.actions.map(action => <ActionRow key={action.id} action={action} scenario={scenario} before={before} highlight={highlight}/>)}</div>
      <p className="fine"><button type="button" className="link" onClick={() => state.setTab('Verify')}>See the verifier’s checks</button> · <button type="button" className="link" onClick={() => state.setTab('Compare')}>Compare before and after</button></p></>}
    <div className="actions-row">{run}</div>{settings}
    {plan.limitations && plan.limitations.length > 0 && <Disclosure title="Limitations of this result"><ul className="bullets">{plan.limitations.map(item => <li key={item}>{item}</li>)}</ul></Disclosure>}
  </div>;
}

export function VerifyPanel({state}: {state: Ws}) {
  const {scenario, selected, claim, verification, busy} = state;
  if (!scenario) return null;
  const failed = verification?.checks?.filter(check => !check.passed) ?? [];
  const passed = (verification?.checks?.length ?? 0) - failed.length;
  const ok = verification?.verdict === 'VERIFIED';
  const picker = <Disclosure title="Choose the actions to verify" meta={`${selected.length} selected`} open={!verification && !state.plan}>
    <div className="picker-grid">{scenario.actions.map(action => <label className="check" key={action.id}><input data-testid="check-row" type="checkbox" checked={selected.includes(action.id)} onChange={event => state.editSelected(event.target.checked ? [...selected, action.id] : selected.filter(id => id !== action.id))}/>
      <span><b className="mono">{action.id}</b> {action.description}</span></label>)}</div></Disclosure>;
  const advanced = <Disclosure title="Claim a cost to check" meta="optional"><label>Claimed total cost (dh)<input aria-label="Claimed total cost" inputMode="numeric" value={claim} onChange={event => state.editClaim(event.target.value)}/>
    <small>The verifier recomputes the cost itself and rejects the plan if the claim differs.</small></label></Disclosure>;
  const run = <button data-testid="verify-run" className={`btn ${verification ? 'btn-secondary' : 'btn-primary'}`} onClick={state.verify} disabled={busy} aria-busy={busy}>{busy ? 'Verifying…' : 'Run independent verification'}</button>;
  return <div className="panel-body">
    {verification ? <div data-testid="verify-verdict" className={`verdict ${ok ? 'verdict-ok' : 'verdict-bad'}`}>
      <h2 className="headline"><span aria-hidden="true">{ok ? '✓ ' : '✕ '}</span><em className={ok ? 'ok' : 'risk'}>{verification.verdict}</em>{ok ? '. Every check passed.' : `. ${failed.length} check${failed.length === 1 ? '' : 's'} failed.`}</h2>
      <p className="lede">{ok ? 'A separate program rebuilt the network from the scenario file and confirmed the modelled result: targets cut off, required flows kept, costs correct.' : 'A separate program rebuilt the network from the scenario file and found problems. This plan must not be treated as a valid remediation.'}</p>
      {failed.length > 0 && <ul className="why">{failed.map(check => { const [title, why] = checkLabel(check.code); return <li key={check.code}><b>✕ {title}</b><small>{why} <span className="mono">({check.detail})</span></small></li>; })}</ul>}
      <Disclosure title="All checks" meta={`${passed} of ${verification.checks?.length ?? 0} passed`} open={false}>
        <ul className="checks">{verification.checks?.map(check => { const [title, why] = checkLabel(check.code);
          return <li key={check.code} className={check.passed ? 'pass' : 'fail'}><span className="mark" aria-label={check.passed ? 'passed' : 'failed'}>{check.passed ? '✓' : '✕'}</span>
            <span className="grow"><b>{title}</b><small>{why}</small><small className="mono">{check.code}: {check.detail}</small></span></li>; })}</ul></Disclosure>
      <p className="fine">Verified means these checks pass in the modelled network. It does not prove the plan is the cheapest, and it says nothing about any real network.</p>
    </div> : <Empty title="Check a plan without trusting the optimizer.">
      The verifier is a separate program with no shared code. Give it a set of actions and it rebuilds the network itself, then tests every constraint.{!state.plan && ' Generate a plan first, or choose actions yourself below.'}</Empty>}
    <div className="actions-row">{run}{state.receipt && <button type="button" className="btn btn-ghost" onClick={() => state.setTab('Receipt')}>Open receipt →</button>}</div>
    {picker}{advanced}
  </div>;
}

export function ComparePanel({scenario, before, after, plan, onPlan, busy}: {scenario: Scenario; before: Graph; after?: Graph; plan?: Ws['plan']; onPlan: () => void; busy: boolean}) {
  if (!after) return <div className="panel-body"><Empty title="Nothing to compare yet." action={<div className="actions-row"><button type="button" className="btn btn-primary" onClick={onPlan} disabled={busy}>{busy ? 'Working…' : 'Generate a plan'}</button></div>}>
      Once a plan exists, this view shows what changed: which critical targets are cut off, which attack connections disappear, and that every required flow still works. Today, {before.reachable_targets.length} of {scenario.targets.length} critical targets are reachable through {before.edges.length} modelled attack connections.</Empty></div>;
  const afterIds = new Set(after.edges.map(edge => edge.id));
  const removed = before.edges.filter(edge => !afterIds.has(edge.id));
  const preserved = after.flows.filter(flow => flow.permitted).length;
  const cut = before.reachable_targets.length - after.reachable_targets.length;
  const applied = after.applied_action_ids.map(id => scenario.actions.find(action => action.id === id)).filter((a): a is Action => !!a);
  return <div className="panel-body">
    <h2 className="headline">{after.reachable_targets.length === 0 ? <>All {before.reachable_targets.length} critical targets are <em className="ok">cut off</em>.</> : <>{cut} of {before.reachable_targets.length} targets cut off; <em className="risk">{after.reachable_targets.length} still reachable</em>.</>}</h2>
    <div className="compare">
      <div data-testid="compare-before"><span className="label">Before</span><strong className="risk-text">{before.reachable_targets.length}<small> / {scenario.targets.length}</small></strong><span>targets reachable · {before.edges.length} attack connections</span></div>
      <div className="arrow" aria-hidden="true">→</div>
      <div data-testid="compare-after"><span className="label">After</span><strong className={after.reachable_targets.length ? 'risk-text' : 'ok-text'}>{after.reachable_targets.length}<small> / {scenario.targets.length}</small></strong><span>targets reachable · {after.edges.length} attack connections</span></div>
    </div>
    <dl className="outcome">
      <div><dt>Required flows still permitted</dt><dd className={preserved === after.flows.length ? 'ok-text' : 'risk-text'}>{preserved} of {after.flows.length} <span aria-hidden="true">{preserved === after.flows.length ? '✓' : '✕'}</span></dd></div>
      <div><dt>Attack connections removed</dt><dd>{removed.length}</dd></div>
      <div><dt>Plan cost</dt><dd>{plan?.total_cost_dh != null ? <Dh value={plan.total_cost_dh}/> : <Dh value={applied.reduce((sum, action) => sum + actionCost(action), 0)}/>}</dd></div></dl>
    <h3 className="subhead">What made the difference</h3>
    <ul className="rows">{applied.map(action => <li key={action.id}><span className="mono id">{action.id}</span><span className="grow">{action.description}</span><span className="cost"><Dh value={actionCost(action)}/></span></li>)}</ul>
    <Disclosure title="Critical targets" meta="before → after"><ul className="rows">{scenario.targets.map(id => <li key={id}><span className="grow">{assetName(scenario, id)}</span>
      <span className={before.reachable_targets.includes(id) ? 'risk-text' : 'ok-text'}>{before.reachable_targets.includes(id) ? '✕ reachable' : '✓ cut off'}</span> → <span className={after.reachable_targets.includes(id) ? 'risk-text' : 'ok-text'}>{after.reachable_targets.includes(id) ? '✕ reachable' : '✓ cut off'}</span></li>)}</ul></Disclosure>
    <Disclosure title="Required flows" meta={`${preserved} of ${after.flows.length} kept`}><ul className="rows">{after.flows.map(flow => <li key={flow.id}><span className="mono id">{flow.id}</span><span className="grow">{scenario.required_flows.find(item => item.id === flow.id)?.description}</span><span className={flow.permitted ? 'ok-text' : 'risk-text'}>{flow.permitted ? '✓ kept' : '✕ broken'}</span></li>)}</ul></Disclosure>
    <Disclosure title={`${removed.length} attack connections removed`} meta="dashed in the graph"><ul className="rows">{removed.map(edge => <li key={edge.id}><span className="grow">{assetName(scenario, edge.source)} → {assetName(scenario, edge.target)}</span></li>)}</ul></Disclosure>
    <p className="fine">A model comparison, not a deployment confirmation.</p>
  </div>;
}

export function ReceiptPanel({receipt, onReverify, busy, integrity, onPlan}: {receipt?: Ws['receipt']; onReverify: () => void; busy: boolean; integrity?: Ws['integrity']; onPlan: () => void}) {
  const [note, setNote] = useState<{tone: 'ok' | 'risk'; text: string}>();
  if (!receipt) return <div className="panel-body"><Empty title="No receipt yet." action={<div className="actions-row"><button type="button" className="btn btn-primary" onClick={onPlan} disabled={busy}>{busy ? 'Working…' : 'Generate a plan'}</button></div>}>
    A receipt is a tamper-evident record created when a plan is verified: the scenario fingerprint, the chosen actions, the verifier’s checks and a SHA-256 digest of all of it. Generate and verify a plan to create one.</Empty></div>;
  const json = JSON.stringify(receipt, null, 2);
  const status = receipt.verification.status;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setNote({tone: 'ok', text: `${what} copied.`}); } catch { setNote({tone: 'risk', text: 'Copy failed: the browser did not grant clipboard access. Use Download instead.'}); } };
  return <div className="panel-body">
    <h2 className="headline">{status === 'VERIFIED' ? <em className="ok">Verified</em> : <em className="risk">{status}</em>} plan, sealed with a SHA-256 digest.</h2>
    <div className="digest"><span className="label">SHA-256 digest</span><code data-testid="receipt-digest">{receipt.receipt_fingerprint}</code></div>
    <div className="receipt-actions">
      <a className="btn btn-primary" data-testid="receipt-download" download={`chokepoint-${receipt.scenario_id}-${receipt.receipt_fingerprint.slice(7, 15)}.receipt.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}>Download receipt (JSON)</a>
      <button className="btn btn-secondary" data-testid="receipt-reverify" onClick={onReverify} disabled={busy}>Re-verify displayed receipt</button></div>
    {integrity && <Callout testId="receipt-integrity" tone={integrity.matches ? 'ok' : 'risk'} title={integrity.matches ? 'Receipt fingerprint matches' : 'Receipt fingerprint mismatch'} role="status">
      The verifier recomputed this receipt (verdict {integrity.verdict}). <span className="mono">Expected {integrity.expected}<br/>Returned {integrity.actual}</span></Callout>}
    <dl className="facts">
      <div><dt>Scenario</dt><dd className="mono">{receipt.scenario_id}</dd></div>
      <div><dt>Actions</dt><dd className="mono">{receipt.action_ids.join(', ') || 'none'}</dd></div>
      <div><dt>Total cost</dt><dd><Dh value={receipt.total_cost_dh}/> · {receipt.action_count} actions</dd></div>
      <div><dt>Solver status claimed</dt><dd>{receipt.claimed_solver_status ?? 'not provided'}</dd></div>
      <div><dt>Targets reachable after</dt><dd>{receipt.verification.targets_reachable_after.length ? receipt.verification.targets_reachable_after.join(', ') : 'none'}</dd></div>
      <div><dt>Required flows broken</dt><dd>{receipt.verification.flows_broken.length ? receipt.verification.flows_broken.join(', ') : 'none'}</dd></div></dl>
    <Disclosure title="Technical details" meta="scenario digest, verifier, full JSON">
      <dl className="facts"><div><dt>Scenario digest</dt><dd className="mono">{receipt.scenario_fingerprint}</dd></div><div><dt>Verifier</dt><dd className="mono">{receipt.verifier}</dd></div><div><dt>Schema</dt><dd className="mono">{receipt.schema}</dd></div></dl>
      <div className="receipt-actions"><button className="btn btn-secondary" data-testid="receipt-copy" onClick={() => copy(json, 'Receipt JSON')}>Copy JSON</button><button className="btn btn-secondary" onClick={() => copy(receipt.receipt_fingerprint, 'Digest')}>Copy digest</button></div>
      {note && <Callout tone={note.tone} role="status">{note.text}</Callout>}
      <pre data-testid="receipt-json">{json}</pre></Disclosure>
    <p className="fine">The digest is a SHA-256 integrity fingerprint of the canonical receipt. It is not a digital signature, does not authenticate who produced it, and is not proof of real-world security.</p>
  </div>;
}
