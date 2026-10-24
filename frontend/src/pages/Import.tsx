import {Suspense, lazy, useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ApiError, errorMessage, getScenario, validateScenario} from '../api/client';
import type {ImportResult} from '../api/client';
import {Legend} from '../components/Legend';
import {Shell} from '../components/Shell';
import {Callout} from '../components/ui';
import {IMPORTED_ID, IMPORT_MAX_BYTES, setImported, stripServerFields} from '../lib/imported';
import {Disclosure} from './Panels';

const GraphCanvas = lazy(() => import('../components/GraphCanvas').then(module => ({default: module.GraphCanvas})));
const LAYERS = {attack: true, witness: true, flows: true, permissions: false};
type Problem = {path: string; message: string};

export function ImportPage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [fatal, setFatal] = useState('');
  const [result, setResult] = useState<ImportResult>();
  const [parsed, setParsed] = useState<Record<string, unknown>>();
  const epoch = useRef(0);

  const reset = () => { ++epoch.current; setResult(undefined); setParsed(undefined); setProblems([]); setFatal(''); setBusy(false); };
  const edit = (value: string) => { reset(); setText(value); };
  const loadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) { reset(); setFatal(`That file is ${(file.size / 1024).toFixed(0)} KiB; the limit is ${IMPORT_MAX_BYTES / 1024} KiB.`); return; }
    edit(await file.text());
  };
  const startFromTemplate = async () => {
    reset();
    try { setText(JSON.stringify(stripServerFields(await getScenario('canonical_city') as unknown as Record<string, unknown>), null, 2)); }
    catch (error) { setFatal(errorMessage(error)); }
  };
  const validate = async () => {
    reset();
    if (new Blob([text]).size > IMPORT_MAX_BYTES) { setFatal(`The text is larger than ${IMPORT_MAX_BYTES / 1024} KiB.`); return; }
    let doc: unknown;
    try { doc = JSON.parse(text); } catch (error) { setFatal(`This is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}`); return; }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) { setFatal('A scenario must be a JSON object.'); return; }
    const token = ++epoch.current; setBusy(true);
    try {
      const outcome = await validateScenario(doc as Record<string, unknown>);
      if (token !== epoch.current) return;
      setResult(outcome); setParsed(doc as Record<string, unknown>);
    } catch (error) {
      if (token !== epoch.current) return;
      if (error instanceof ApiError && error.details.length) setProblems(error.details); else setFatal(errorMessage(error));
    } finally { if (token === epoch.current) setBusy(false); }
  };
  const open = () => { if (!parsed) return; setImported(parsed); navigate(`/scenarios/${IMPORTED_ID}`); };

  const sc = result?.scenario;
  return <Shell><main className="page import">
    <header><h1>Import a scenario</h1>
      <p className="lede">Bring your own modelled network in CHOKEPOINT's scenario JSON format. It is validated by the same parser as the built-in scenarios, drawn as a graph, and then planned, verified and reported exactly like them.</p></header>
    <Callout tone="warn" title="Only use data you are authorized to model">This is a planning model, not a scanner. Nothing is discovered or changed on any real system. The scenario is sent to the server for each request, kept only in this browser tab, and never stored.</Callout>

    <section aria-label="Scenario input" className="import-input">
      <div className="actions-row">
        <label className="btn btn-secondary file-btn">Choose a .json file<input type="file" accept=".json,application/json" onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }}/></label>
        <button type="button" className="btn btn-ghost" onClick={startFromTemplate}>Start from the Canonical City format</button>
      </div>
      <label>Scenario JSON<textarea aria-label="Scenario JSON" spellCheck={false} value={text} onChange={event => edit(event.target.value)} rows={14} placeholder='{"schema_version": "1", "id": "my_network", ...}'/></label>
      <div className="actions-row"><button type="button" className="btn btn-primary" data-testid="import-validate" onClick={validate} disabled={busy || !text.trim()} aria-busy={busy}>{busy ? 'Validating…' : 'Validate and preview'}</button>
        <small>Limits: 256 KiB, 40 assets, 20 zones, 80 findings, 120 rules, 40 required flows, 40 actions. Unknown fields are rejected.</small></div>
    </section>

    <div aria-live="polite">
      {fatal && <Callout tone="risk" role="alert" testId="import-error" title="This could not be imported">{fatal}</Callout>}
      {problems.length > 0 && <Callout tone="risk" role="alert" testId="import-error" title={`The scenario is not valid (${problems.length} problem${problems.length > 1 ? 's' : ''})`}>
        <ul className="bullets">{problems.map((p, i) => <li key={i}><span className="mono">{p.path || '/'}</span> {p.message}</li>)}</ul>Fix the JSON above and validate again. Your text has not been changed.</Callout>}
    </div>

    {sc && result && <section aria-label="Validation result" data-testid="import-success" className="import-result">
      <Callout tone="ok" title={`Valid scenario: ${sc.name}`}>{sc.assets.length} assets in {sc.zones.length} zones · {sc.findings.length} findings · {sc.rules.length} rules · {sc.required_flows.length} required flows · {sc.targets.length} critical targets · {sc.actions.length} actions. Fingerprint <span className="mono">{sc.fingerprint.slice(0, 23)}…</span></Callout>
      {sc.warnings && sc.warnings.length > 0 && <Callout tone="warn" title="Warnings">{<ul className="bullets">{sc.warnings.map(w => <li key={w.code + w.path}><span className="mono">{w.code}</span> {w.message}</li>)}</ul>}</Callout>}
      <div className="import-graph">
        <Suspense fallback={<div className="skeleton" style={{height: 360}} aria-busy="true"/>}>
          <GraphCanvas graph={result.graph} scenario={sc} layers={LAYERS} label={`Preview of ${sc.name}: ${result.graph.nodes.length} assets, ${result.graph.edges.length} modelled attack connections`}/></Suspense>
        <Legend kinds={[...new Set(sc.assets.map(a => a.kind))]} hasBlocked={false}/>
      </div>
      <p className="lede">In this model, {result.graph.reachable_targets.length} of {sc.targets.length} critical targets can be reached from the attacker origins.</p>
      <div className="disclosures">
        <Disclosure title="Assets" meta={`${sc.assets.length}`}><ul className="rows">{sc.assets.map(a => <li key={a.id}><span className="mono id">{a.id}</span><span className="grow">{a.name} <small>{a.kind} · {a.zone}{a.services.length ? ` · ${a.services.map(x => `${x.id}:${x.port}`).join(', ')}` : ''}</small></span></li>)}</ul></Disclosure>
        <Disclosure title="Findings" meta={`${sc.findings.length}`}><ul className="rows">{sc.findings.map(f => <li key={f.id}><span className="mono id">{f.id}</span><span className="grow">{f.title}</span></li>)}</ul></Disclosure>
        <Disclosure title="Firewall rules" meta={`${sc.rules.length}`}><ul className="rows">{sc.rules.map(r => <li key={r.id}><span className="mono id">{r.id}</span><span className="grow">{r.label} <small>{r.src} → {r.dst} {r.ports === 'any' ? 'any port' : r.ports.join(', ')}</small></span></li>)}</ul></Disclosure>
        <Disclosure title="Required flows and critical targets" meta={`${sc.required_flows.length} / ${sc.targets.length}`}><ul className="rows">{sc.required_flows.map(f => <li key={f.id}><span className="mono id">{f.id}</span><span className="grow">{f.description} <small>{f.src} → {f.dst} :{f.port}</small></span></li>)}</ul><p className="fine">Critical targets: {sc.targets.join(', ')}</p></Disclosure>
        <Disclosure title="Available actions" meta={`${sc.actions.length}`}><ul className="rows">{sc.actions.map(a => <li key={a.id}><span className="mono id">{a.id}</span><span className="grow">{a.description} <small>{a.kind}{a.mandatory ? ' · mandatory' : ''}</small></span><span className="cost">{(a.effort_dh ?? 0) + 2 * (a.downtime_dh ?? 0)} dh</span></li>)}</ul></Disclosure>
      </div>
      <div className="actions-row"><button type="button" className="btn btn-primary" data-testid="import-open" onClick={open}>Open in workspace</button><Link className="btn btn-quiet" to="/">Cancel</Link></div>
    </section>}
  </main></Shell>;
}
