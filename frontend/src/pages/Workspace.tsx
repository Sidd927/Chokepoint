import {Suspense, lazy, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import type {Action, Scenario} from '../api/client';
import {Legend} from '../components/Legend';
import type {GraphSelection, Layers} from '../components/GraphCanvas';
import {Shell} from '../components/Shell';
import type {NavItem} from '../components/Shell';
import {Callout, Chip} from '../components/ui';
import {assetName} from '../lib/explain';
import {useWorkspace} from '../state/useWorkspace';
import type {Tab} from '../state/useWorkspace';
import {ComparePanel, InspectPanel, PlanPanel, ReceiptPanel, VerifyPanel} from './Panels';

// Cytoscape is large; it is only fetched when a scenario workspace opens.
const GraphCanvas = lazy(() => import('../components/GraphCanvas').then(module => ({default: module.GraphCanvas})));

const STEPS: {tab: Tab; hint: string}[] = [
  {tab: 'Inspect', hint: 'The modelled network'}, {tab: 'Plan', hint: 'Choose remediation'}, {tab: 'Verify', hint: 'Independent check'},
  {tab: 'Compare', hint: 'Before and after'}, {tab: 'Receipt', hint: 'SHA-256 evidence'},
];
const LAYERS: {key: keyof Layers; label: string; help: string}[] = [
  {key: 'attack', label: 'Attack steps', help: 'Modelled exploit and credential-reuse steps'}, {key: 'witness', label: 'Example path', help: 'One shortest attack path to a critical target'},
  {key: 'flows', label: 'Required flows', help: 'Operational flows that must keep working'}, {key: 'permissions', label: 'Firewall rules', help: 'Allow-rules in the scenario'},
];

function Detail({selection, scenario}: {selection: GraphSelection; scenario: Scenario}) {
  const d = selection.data as Record<string, any>;
  if (selection.type === 'node') {
    const asset = scenario.assets.find(item => item.id === d.id);
    const zone = scenario.zones.find(item => item.id === asset?.zone);
    return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>{String(d.label)}</strong><span className="mono">{String(d.id)}</span>
      <Chip>{String(d.kind)}</Chip>{d.origin && <Chip tone="accent">attacker origin</Chip>}{d.target && <Chip tone="risk">critical target</Chip>}<Chip tone={d.reachable ? 'risk' : 'ok'}>{d.reachable ? 'reachable' : 'not reachable'}</Chip></div>
      <dl><div><dt>Zone</dt><dd>{zone?.name ?? asset?.zone}</dd></div>
        <div><dt>Services</dt><dd>{asset?.services.map(service => <span key={service.id} className="mono svc">{service.id}:{service.port}{service.finding_ids.length ? ` (${service.finding_ids.map(id => scenario.findings.find(finding => finding.id === id)?.title ?? id).join(', ')})` : ''}</span>)}{!asset?.services.length && 'none exposed'}</dd></div>
        <div><dt>Stored credentials</dt><dd>{asset?.credentials.map(credential => `${credential.service_id} on ${assetName(scenario, credential.target_asset)}`).join(', ') || 'none'}</dd></div></dl></div>;
  }
  const from = assetName(scenario, d.source); const to = assetName(scenario, d.target);
  if (d.edgeType === 'flow') return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>Required flow {String(d.label)}</strong><Chip tone={d.permitted ? 'ok' : 'risk'}>{d.permitted ? 'permitted' : 'broken'}</Chip></div>
    <p>{String(d.description)}: {from} → {to}. Granted by rule {(d.granting_rule_ids as string[]).join(', ') || 'none'}.</p></div>;
  if (d.edgeType === 'permission') return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>Firewall rule {String(d.label)}</strong><Chip tone={d.status === 'restricted' ? 'accent' : 'neutral'}>{String(d.status)}</Chip></div><p>{String(d.ruleLabel)}: {from} → {to}.</p></div>;
  const blocked = d.edgeType === 'blocked';
  return <div className="detail" data-testid="selection-detail"><div className="detail-head"><strong>{from} → {to}</strong><Chip tone={blocked ? 'ok' : 'risk'}>{blocked ? 'blocked by plan' : 'modelled attack step'}</Chip></div>
    <ul className="bullets">{(d.reasons as {type: string; service_id: string; port: number; finding_id?: string; rule_ids: string[]}[]).map((reason, index) => <li key={index}>
      {reason.type === 'exploit' ? `Exploit ${reason.finding_id} (${scenario.findings.find(finding => finding.id === reason.finding_id)?.title ?? ''}) on service ${reason.service_id}:${reason.port}` : `Reuse stored credentials for service ${reason.service_id}:${reason.port}`}
      {` · allowed by rule ${reason.rule_ids.join(', ')}`}</li>)}</ul></div>;
}

export function Workspace({id}: {id: string}) {
  const state = useWorkspace(id);
  const [layers, setLayers] = useState<Layers>({attack: true, witness: true, flows: true, permissions: false});
  const [selection, setSelection] = useState<GraphSelection>();
  const [highlighted, setHighlighted] = useState<Action>();
  const {scenario, before, graph, error, tab, setTab} = state;
  const kinds = useMemo(() => [...new Set(scenario?.assets.map(asset => asset.kind) ?? [])], [scenario]);

  if (error && !scenario) return <Shell scenarioId={id}><main className="page"><Callout tone="risk" role="alert" testId="error-banner" title="This scenario could not be loaded">{error} <Link to="/">Back to scenarios</Link></Callout></main></Shell>;
  if (!scenario || !graph || !before) return <Shell scenarioId={id}><main className="page loading" aria-busy="true"><div className="skeleton" style={{height: 48}}/><div className="skeleton" style={{height: 420}}/><p>Loading scenario model…</p></main></Shell>;

  const nav: NavItem[] = STEPS.map(step => ({id: step.tab, label: step.tab, hint: step.hint, active: tab === step.tab, onSelect: () => { setTab(step.tab); if (step.tab === 'Compare' && state.after) state.setView('after'); }}));
  const panel = tab === 'Inspect' ? <InspectPanel scenario={scenario} graph={before} highlight={setHighlighted}/>
    : tab === 'Plan' ? <PlanPanel state={state} highlight={setHighlighted}/>
    : tab === 'Verify' ? <VerifyPanel state={state}/>
    : tab === 'Compare' ? <ComparePanel scenario={scenario} before={before} after={state.after} plan={state.plan}/>
    : <ReceiptPanel receipt={state.receipt} onReverify={state.reverify} busy={state.busy} integrity={state.integrity}/>;

  return <Shell nav={nav} scenarioId={id}><main className="page">
    <header className="page-head"><div><div className="crumbs"><Link to="/">Scenarios</Link> / <span>{id}</span></div><h1>{scenario.name}</h1><p>{scenario.description}</p></div>
      <div className="head-actions"><Chip tone="warn" title="All assets, findings and flows are invented for this demonstration">Synthetic model — not a live network</Chip>
        <button type="button" className="btn btn-primary" onClick={state.compute} disabled={state.busy} aria-busy={state.busy}>{state.busy ? 'Working…' : 'Generate plan'}</button></div></header>
    <div className="workspace">
      <section className="stage" aria-label="Attack graph">
        <div className="stage-bar"><div><span className="eyebrow">Question 2 · Where can an attacker move?</span><h2>{state.view === 'after' && state.after ? 'Network after the plan' : 'Attack surface today'}</h2></div>
          {state.after && <div className="segmented" role="group" aria-label="Graph state"><button type="button" aria-pressed={state.view === 'before'} className={state.view === 'before' ? 'active' : ''} onClick={() => state.setView('before')}>Before</button>
            <button type="button" aria-pressed={state.view === 'after'} className={state.view === 'after' ? 'active' : ''} onClick={() => state.setView('after')}>After</button></div>}</div>
        <div className="layers" role="group" aria-label="Graph layers">{LAYERS.map(layer => <label key={layer.key} title={layer.help}><input data-testid={`layer-${layer.key}`} type="checkbox" checked={layers[layer.key]} onChange={event => setLayers({...layers, [layer.key]: event.target.checked})}/>{layer.label}</label>)}
          <span className="graph-stat">{graph.edges.length} attack connections</span></div>
        <Suspense fallback={<div className="skeleton" style={{height: 440}} aria-busy="true"/>}>
          <GraphCanvas graph={graph} baseline={state.view === 'after' ? before : undefined} scenario={scenario} layers={layers} highlightedAction={highlighted} onSelection={setSelection}/></Suspense>
        <Legend kinds={kinds} hasBlocked={state.view === 'after' && !!state.after}/>
        {selection ? <Detail selection={selection} scenario={scenario}/> : <p className="hint">Select an asset or connection in the graph to see its details. Hover an asset to focus its neighbours.</p>}
        <details className="table-fallback"><summary>Accessible graph table</summary><div className="tables"><table><thead><tr><th>Asset</th><th>Zone</th><th>Origin</th><th>Target</th><th>Reachable</th></tr></thead><tbody>{graph.nodes.map(node => <tr key={node.id}><td><button type="button" className="table-select" onClick={() => setSelection({type: 'node', data: {id: node.id, label: node.name, kind: node.kind, origin: node.is_origin, target: node.is_target, reachable: node.reachable}})}>{node.name}</button></td><td>{node.zone}</td><td>{node.is_origin ? 'yes' : 'no'}</td><td>{node.is_target ? 'yes' : 'no'}</td><td>{node.reachable ? 'yes' : 'no'}</td></tr>)}</tbody></table>
          <table><thead><tr><th>Connection</th><th>From</th><th>To</th><th>Reason</th></tr></thead><tbody>{graph.edges.map(edge => <tr key={edge.id}><td><button type="button" className="table-select" onClick={() => setSelection({type: 'edge', data: {id: edge.id, edgeType: 'attack', source: edge.source, target: edge.target, reasons: edge.reasons}})}>{edge.id}</button></td><td>{edge.source}</td><td>{edge.target}</td><td>{edge.reasons.map(reason => `${reason.type}:${reason.service_id}`).join(', ')}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="inspector" aria-live="polite">{error && <Callout tone="risk" role="alert" title="Request failed">{error}</Callout>}{panel}</section>
    </div></main></Shell>;
}
