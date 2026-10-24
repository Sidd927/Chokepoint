import {Suspense, lazy, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import type {Action, Scenario} from '../api/client';
import {Legend} from '../components/Legend';
import type {GraphSelection, Layers} from '../components/GraphCanvas';
import {Shell} from '../components/Shell';
import type {NavItem} from '../components/Shell';
import {Callout} from '../components/ui';
import {assetName} from '../lib/explain';
import {useWorkspace} from '../state/useWorkspace';
import type {Tab} from '../state/useWorkspace';
import {ComparePanel, InspectPanel, PlanPanel, ReceiptPanel, VerifyPanel} from './Panels';

// Cytoscape is large; it is only fetched when a scenario workspace opens.
const GraphCanvas = lazy(() => import('../components/GraphCanvas').then(module => ({default: module.GraphCanvas})));

const STEPS: {tab: Tab; hint: string}[] = [
  {tab: 'Inspect', hint: 'The modelled network and its exposure'}, {tab: 'Plan', hint: 'Choose the cheapest safe remediation'}, {tab: 'Verify', hint: 'Check a plan independently'},
  {tab: 'Compare', hint: 'See the network before and after'}, {tab: 'Receipt', hint: 'SHA-256 evidence you can download'},
];
const LAYERS: {key: keyof Layers; label: string; help: string}[] = [
  {key: 'attack', label: 'Attack steps', help: 'Modelled exploit and credential-reuse steps'}, {key: 'witness', label: 'Example route', help: 'One shortest attack path to a critical target'},
  {key: 'flows', label: 'Required flows', help: 'Operational flows that must keep working'}, {key: 'permissions', label: 'Firewall rules', help: 'Allow-rules in the scenario'},
];

function Detail({selection, scenario, focused, onFocus, onClose}: {selection: GraphSelection; scenario: Scenario; focused: boolean; onFocus: () => void; onClose: () => void}) {
  const d = selection.data as Record<string, any>;
  const close = <button type="button" className="btn btn-ghost close" onClick={onClose} aria-label="Close details">✕</button>;
  if (selection.type === 'node') {
    const asset = scenario.assets.find(item => item.id === d.id);
    const zone = scenario.zones.find(item => item.id === asset?.zone);
    return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>{String(d.label)}</strong><span className="mono">{String(d.id)}</span>{close}</div>
      <p className="detail-tags">{String(d.kind)} · {zone?.name ?? asset?.zone}{d.origin ? ' · attacker origin' : ''}{d.target ? ' · critical target' : ''} · <b className={d.reachable ? 'risk-text' : 'ok-text'}>{d.reachable ? '✕ reachable' : '✓ not reachable'}</b></p>
      <dl><div><dt>Services</dt><dd>{asset?.services.map(service => <span key={service.id} className="mono svc">{service.id}:{service.port}{service.finding_ids.length ? ` (${service.finding_ids.map(id => scenario.findings.find(finding => finding.id === id)?.title ?? id).join(', ')})` : ''}</span>)}{!asset?.services.length && 'none exposed'}</dd></div>
        <div><dt>Credentials</dt><dd>{asset?.credentials.map(credential => `${credential.service_id} on ${assetName(scenario, credential.target_asset)}`).join(', ') || 'none stored'}</dd></div></dl>
      <button type="button" className="btn btn-secondary" aria-pressed={focused} onClick={onFocus}>{focused ? 'Show whole network' : 'Focus on this asset'}</button></div>;
  }
  const from = assetName(scenario, d.source); const to = assetName(scenario, d.target);
  if (d.edgeType === 'flow') return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>Required flow {String(d.label)}</strong>{close}</div>
    <p className="detail-tags"><b className={d.permitted ? 'ok-text' : 'risk-text'}>{d.permitted ? '✓ permitted' : '✕ broken'}</b></p><p>{String(d.description)}: {from} → {to}. Granted by rule {(d.granting_rule_ids as string[]).join(', ') || 'none'}.</p></div>;
  if (d.edgeType === 'permission') return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>Firewall rule {String(d.label)}</strong>{close}</div><p>{String(d.ruleLabel)}: {from} → {to} ({String(d.status)}).</p></div>;
  const blocked = d.edgeType === 'blocked';
  return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>{from} → {to}</strong>{close}</div>
    <p className="detail-tags"><b className={blocked ? 'ok-text' : 'risk-text'}>{blocked ? '✓ blocked by the plan' : '✕ modelled attack step'}</b></p>
    <ul className="bullets">{(d.reasons as {type: string; service_id: string; port: number; finding_id?: string; rule_ids: string[]}[]).map((reason, index) => <li key={index}>
      {reason.type === 'exploit' ? `Exploit ${reason.finding_id} (${scenario.findings.find(finding => finding.id === reason.finding_id)?.title ?? ''}) on service ${reason.service_id}:${reason.port}` : `Reuse stored credentials for service ${reason.service_id}:${reason.port}`}
      {` · allowed by rule ${reason.rule_ids.join(', ')}`}</li>)}</ul></div>;
}

export function Workspace({id}: {id: string}) {
  const state = useWorkspace(id);
  const [layers, setLayers] = useState<Layers>({attack: true, witness: true, flows: true, permissions: false});
  const [selection, setSelection] = useState<GraphSelection>();
  const [focusId, setFocusId] = useState<string>();
  const [highlighted, setHighlighted] = useState<Action>();
  const {scenario, before, graph, error, tab, setTab} = state;
  const kinds = useMemo(() => [...new Set(scenario?.assets.map(asset => asset.kind) ?? [])], [scenario]);

  if (error && !scenario) return <Shell scenarioId={id}><main className="page"><Callout tone="risk" role="alert" testId="error-banner" title="This scenario could not be loaded">{error} <Link to="/">Back to start</Link></Callout></main></Shell>;
  if (!scenario || !graph || !before) return <Shell scenarioId={id}><main className="page loading" aria-busy="true"><div className="skeleton" style={{height: 520}}/><p>Loading scenario model…</p></main></Shell>;

  const doneFlags: Record<Tab, boolean> = {Inspect: false, Plan: !!state.plan, Verify: !!state.verification, Compare: !!state.after, Receipt: !!state.receipt};
  const nav: NavItem[] = STEPS.map(step => ({id: step.tab, label: step.tab, hint: step.hint, active: tab === step.tab, done: doneFlags[step.tab], onSelect: () => { setTab(step.tab); if (step.tab === 'Compare' && state.after) state.setView('after'); }}));
  const panel = tab === 'Inspect' ? <InspectPanel scenario={scenario} graph={before} highlight={setHighlighted} onPlan={() => state.compute()} busy={state.busy}/>
    : tab === 'Plan' ? <PlanPanel state={state} highlight={setHighlighted}/>
    : tab === 'Verify' ? <VerifyPanel state={state}/>
    : tab === 'Compare' ? <ComparePanel scenario={scenario} before={before} after={state.after} plan={state.plan} onPlan={() => state.compute('Compare')} busy={state.busy}/>
    : <ReceiptPanel receipt={state.receipt} onReverify={state.reverify} busy={state.busy} integrity={state.integrity} onPlan={() => state.compute('Receipt')}/>;
  const showSelection = (item: GraphSelection) => setSelection(item);

  return <Shell nav={nav} scenarioId={id}><main className="ws">
    <section className="stage" aria-label="Attack graph">
      <header className="stage-head"><div><h1>{scenario.name}</h1><p>Synthetic model, not a live network. {state.view === 'after' && state.after ? 'Showing the network after the plan.' : 'Showing the network today.'}</p></div>
        {state.after && <div className="segmented" role="group" aria-label="Graph state"><button type="button" aria-pressed={state.view === 'before'} className={state.view === 'before' ? 'active' : ''} onClick={() => state.setView('before')}>Before</button>
          <button type="button" aria-pressed={state.view === 'after'} className={state.view === 'after' ? 'active' : ''} onClick={() => state.setView('after')}>After</button></div>}</header>
      <div className="stage-tools" role="group" aria-label="Graph layers"><span className="tools-label">Show</span>{LAYERS.map(layer => <label key={layer.key} title={layer.help}><input data-testid={`layer-${layer.key}`} type="checkbox" checked={layers[layer.key]} onChange={event => setLayers({...layers, [layer.key]: event.target.checked})}/>{layer.label}</label>)}
        {focusId && <button type="button" className="btn btn-ghost" onClick={() => setFocusId(undefined)}>Clear focus</button>}<span className="graph-stat">{graph.edges.length} attack connections</span></div>
      <div className="stage-canvas">
        <Suspense fallback={<div className="skeleton" style={{height: 520}} aria-busy="true"/>}>
          <GraphCanvas graph={graph} baseline={state.view === 'after' ? before : undefined} scenario={scenario} layers={layers} highlightedAction={highlighted} focusId={focusId} onSelection={showSelection}/></Suspense>
        {selection && <Detail selection={selection} scenario={scenario} focused={!!focusId && focusId === selection.data.id} onClose={() => setSelection(undefined)}
          onFocus={() => setFocusId(current => current === selection.data.id ? undefined : String(selection.data.id))}/>}
      </div>
      <div className="stage-foot"><Legend kinds={kinds} hasBlocked={state.view === 'after' && !!state.after}/>
        <details className="table-fallback"><summary>Accessible graph table</summary><div className="tables"><table><thead><tr><th>Asset</th><th>Zone</th><th>Origin</th><th>Target</th><th>Reachable</th></tr></thead><tbody>{graph.nodes.map(node => <tr key={node.id}><td><button type="button" className="table-select" onClick={() => setSelection({type: 'node', data: {id: node.id, label: node.name, kind: node.kind, origin: node.is_origin, target: node.is_target, reachable: node.reachable}})}>{node.name}</button></td><td>{node.zone}</td><td>{node.is_origin ? 'yes' : 'no'}</td><td>{node.is_target ? 'yes' : 'no'}</td><td>{node.reachable ? 'yes' : 'no'}</td></tr>)}</tbody></table>
          <table><thead><tr><th>Connection</th><th>From</th><th>To</th><th>Reason</th></tr></thead><tbody>{graph.edges.map(edge => <tr key={edge.id}><td><button type="button" className="table-select" onClick={() => setSelection({type: 'edge', data: {id: edge.id, edgeType: 'attack', source: edge.source, target: edge.target, reasons: edge.reasons}})}>{edge.id}</button></td><td>{edge.source}</td><td>{edge.target}</td><td>{edge.reasons.map(reason => `${reason.type}:${reason.service_id}`).join(', ')}</td></tr>)}</tbody></table></div></details></div>
    </section>
    <aside className="panel" aria-live="polite" aria-label={`${tab} panel`}><div className="panel-inner">{error && <Callout tone="risk" role="alert" title="Request failed">{error}</Callout>}{panel}</div></aside>
  </main></Shell>;
}
