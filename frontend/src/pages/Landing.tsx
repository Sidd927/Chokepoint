import {Suspense, lazy, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {errorMessage, listScenarios} from '../api/client';
import type {ScenarioSummary} from '../api/client';
import type {Layers} from '../components/GraphCanvas';
import {Health, Mark} from '../components/Shell';
import {Callout} from '../components/ui';
import {assetName} from '../lib/explain';
import {useStory} from '../state/useStory';
import type {Story} from '../state/useStory';
import '../landing.css';

const GraphCanvas = lazy(() => import('../components/GraphCanvas').then(module => ({default: module.GraphCanvas})));

/** Adds `.in` to `.reveal` elements as they enter the viewport. Content is never hidden when motion is reduced or IO is unavailable. */
function useReveal() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll('.reveal'));
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { items.forEach(item => item.classList.add('in')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in'); observer.unobserve(entry.target); } }), {rootMargin: '0px 0px -8% 0px'});
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  });
}

/** Index of the story step that is currently crossing the middle of the viewport. */
function useActiveStep(count: number) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step)); }), {rootMargin: '-42% 0px -42% 0px'});
    refs.current.slice(0, count).forEach(item => item && observer.observe(item));
    return () => observer.disconnect();
  }, [count]);
  return {active, bind: (index: number) => (element: HTMLElement | null) => { refs.current[index] = element; }};
}

const L = (attack: boolean, witness: boolean, flows: boolean): Layers => ({attack, witness, flows, permissions: false});
const LAYERS = {flowsOnly: L(false, false, true), routes: L(true, true, true), result: L(true, false, true)};

function Graph({story, view, layers, label, height}: {story: Story; view: 'before' | 'after' | 'careless'; layers: Layers; label: string; height?: string}) {
  const graph = view === 'after' ? story.after : view === 'careless' && story.careless ? story.careless.graph : story.before;
  return <div className="landing-graph" style={height ? {height} : undefined}><Suspense fallback={<div className="skeleton fill" aria-busy="true"/>}>
    <GraphCanvas bare graph={graph} baseline={view === 'after' ? story.before : undefined} scenario={story.scenario} layers={layers} label={label}/></Suspense></div>;
}

const names = (story: Story, ids: string[]) => ids.map(id => assetName(story.scenario, id)).join(' → ');

type Step = {key: string; title: string; body: ReactNode; view: 'before' | 'after' | 'careless'; layers: Layers; readout: ReactNode};
function buildSteps(story: Story): Step[] {
  const {scenario, before, after, plan, careless} = story;
  const targets = scenario.targets.length; const flows = before.flows.length;
  const checks = plan.verification!.checks;
  const steps: Step[] = [
    {key: 'connected', title: 'A city runs on connections.', view: 'before', layers: LAYERS.flowsOnly,
      body: <>This is <b>{scenario.name.replace(' (synthetic)', '')}</b>, a modelled network of {scenario.assets.length} systems in {scenario.zones.length} zones. The green dotted lines are the {flows} flows the city genuinely needs, such as citizens reaching the portal and engineers operating the pumps.</>,
      readout: <><b>{flows} required flows</b>, all permitted</>},
    {key: 'routes', title: 'The same connections are routes in.', view: 'before', layers: LAYERS.routes,
      body: <>Weak services and reusable credentials let an attacker move from one system to the next. Here, {before.reachable_targets.length} of {targets} critical systems can be reached{before.witness_path && <>, for example <b>{names(story, before.witness_path)}</b></>}.</>,
      readout: <><b className="risk-text">{before.reachable_targets.length} of {targets}</b> critical targets reachable</>},
  ];
  if (careless) steps.push({key: 'careless', title: 'The obvious fix can break the city.', view: 'careless', layers: LAYERS.routes,
    body: <>“{careless.action.description}” costs only {careless.action.cost_dh ?? (careless.action.effort_dh ?? 0) + 2 * (careless.action.downtime_dh ?? 0)}&nbsp;dh. The model shows what it really does: required flow <b>{careless.brokenFlowIds.join(', ')}</b> stops working, and {careless.graph.reachable_targets.length} of {targets} targets are still reachable.</>,
    readout: <><b className="risk-text">✕ {careless.brokenFlowIds.length} required flow broken</b> · {careless.graph.reachable_targets.length} targets still reachable</>});
  steps.push(
    {key: 'plan', title: 'So CHOKEPOINT searches for the cheapest plan that works.', view: 'after', layers: LAYERS.result,
      body: <>It prices every catalogue action (effort plus twice the downtime, in dh), rejects any combination that breaks a required flow, and keeps searching until it can prove nothing cheaper works. Here it selected <b>{plan.action_ids!.join(', ')}</b>. Dashed arrows are connections that no longer exist.</>,
      readout: <><b className="mono">{plan.solver_status}</b> · {plan.total_cost_dh}&nbsp;dh · targets <b className="risk-text">{before.reachable_targets.length}</b> → <b className="ok-text">{after.reachable_targets.length}</b> · flows {after.flows.filter(flow => flow.permitted).length} of {flows} kept</>},
    {key: 'verify', title: 'Then a second program checks the first.', view: 'after', layers: LAYERS.result,
      body: <>The verifier shares no code with the optimizer. It rebuilds the network from the scenario file, re-tests every constraint, and seals the outcome in a receipt with a SHA-256 digest anyone can recompute.</>,
      readout: <><b className={plan.verification!.verdict === 'VERIFIED' ? 'ok-text' : 'risk-text'}>{plan.verification!.verdict}</b> · {checks.filter(check => check.passed).length} of {checks.length} checks passed <span className="mono digest-s">{plan.receipt!.receipt_fingerprint.slice(0, 23)}…</span></>});
  return steps;
}

function ScenarioList({items, error, onRetry}: {items: ScenarioSummary[]; error: string; onRetry: () => void}) {
  if (error) return <Callout tone="risk" role="alert" testId="error-banner" title="Could not load scenarios">{error} <button type="button" className="btn btn-secondary" onClick={onRetry}>Retry</button></Callout>;
  if (!items.length) return <div className="skeleton" style={{height: 160}} aria-busy="true"/>;
  return <ul className="scenario-list">{items.map(scenario => <li key={scenario.id}><Link data-testid="scenario-card" className="scenario-row" to={`/scenarios/${scenario.id}`}>
    <span className="scenario-main"><strong>{scenario.name}</strong><span>{scenario.description}</span></span>
    <span className="scenario-facts">{scenario.counts.assets} assets · {scenario.counts.zones} zones · {scenario.counts.findings} findings · {scenario.counts.required_flows} required flows · {scenario.counts.actions} actions</span>
    <span className="scenario-go">Open workspace <span aria-hidden="true">→</span></span></Link></li>)}</ul>;
}

export function Landing() {
  const {state, retry} = useStory();
  const story = state.status === 'ready' ? state.story : undefined;
  const steps = useMemo(() => story ? buildSteps(story) : [], [story]);
  const {active, bind} = useActiveStep(steps.length);
  const [hero, setHero] = useState<'before' | 'after'>('before');
  const [items, setItems] = useState<ScenarioSummary[]>([]);
  const [listError, setListError] = useState('');
  const mounted = useRef(true);
  const loadList = () => { setListError(''); listScenarios().then(result => { if (mounted.current) setItems(result.scenarios); }).catch(error => { if (mounted.current) setListError(errorMessage(error)); }); };
  useEffect(() => { mounted.current = true; loadList(); return () => { mounted.current = false; }; }, []);
  useReveal();
  const launch = items.find(item => item.id === 'demo_city')?.id ?? items[0]?.id;
  const cta = launch ? <Link className="btn btn-primary btn-lg" to={`/scenarios/${launch}`}>Explore the live demo</Link> : <a className="btn btn-primary btn-lg" href="#demo">Explore the live demo</a>;
  const current = steps[Math.min(active, Math.max(steps.length - 1, 0))];

  return <div className="landing">
    <a className="skip" href="#story">Skip to the story</a>
    <div className="scroll-progress" aria-hidden="true"/>
    <header className="l-nav"><Link to="/" className="brand" aria-label="CHOKEPOINT"><Mark/><span>CHOKEPOINT</span></Link>
      <nav aria-label="Page sections"><a href="#story">The idea</a><a href="#how">How it works</a><a href="#evidence">Evidence</a></nav>
      <div className="l-nav-right"><Health/>{launch ? <Link className="btn btn-primary" to={`/scenarios/${launch}`}>Open the workspace</Link> : <a className="btn btn-primary" href="#demo">Open the workspace</a>}</div></header>

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="kicker">Remediation planning for modelled infrastructure</p>
        <h1 id="hero-title">Cut the path.<br/><span>Keep the service.</span></h1>
        <p className="hero-lede">One weak link in a connected city can open a route to its water pumps and traffic signals, and the quick fix can switch off something people depend on. CHOKEPOINT finds the cheapest set of changes that closes every modelled route and keeps required services running, then has a separate program check the answer.</p>
        <div className="hero-actions">{cta}<a className="btn btn-quiet btn-lg" href="#story">How it works ↓</a></div>
        <p className="fine">Every scenario is synthetic. Nothing here scans, or touches, a real network.</p>
      </div>
      <figure className="hero-visual">
        {story ? <>
          <div className="hero-toggle segmented" role="group" aria-label="Network state">
            <button type="button" aria-pressed={hero === 'before'} className={hero === 'before' ? 'active' : ''} onClick={() => setHero('before')}>Before</button>
            <button type="button" aria-pressed={hero === 'after'} className={hero === 'after' ? 'active' : ''} onClick={() => setHero('after')}>After the plan</button></div>
          <Graph story={story} view={hero} layers={hero === 'before' ? LAYERS.routes : LAYERS.result} label={`${story.scenario.name}: ${hero === 'before' ? 'attack routes to critical targets' : 'network after the remediation plan'}`}/>
          <figcaption data-testid="hero-caption">{hero === 'before'
            ? <><b className="risk-text">{story.before.reachable_targets.length} of {story.scenario.targets.length}</b> critical targets reachable. Red arrows are modelled attack steps.</>
            : <><b className="ok-text">{story.after.reachable_targets.length} of {story.scenario.targets.length}</b> reachable, {story.after.flows.filter(flow => flow.permitted).length} of {story.after.flows.length} required flows kept, {story.plan.total_cost_dh}&nbsp;dh.</>}
            <span> Real output from the API for <i>{story.scenario.name}</i>.</span></figcaption></>
          : state.status === 'error' ? <Callout tone="warn" role="alert" testId="story-error" title="The live preview needs the backend">{state.message} <button type="button" className="btn btn-secondary" onClick={retry}>Retry</button></Callout>
          : <div className="skeleton fill hero-skeleton" aria-busy="true"/>}
      </figure>
    </section>

    <section id="story" className="story" aria-labelledby="story-title">
      <h2 id="story-title" className="sr-only">The idea, step by step</h2>
      {story && current ? <>
        <div className="story-stage" aria-live="polite">
          <div className="stage-meta"><span>{String(active + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span><span>{story.scenario.name}</span></div>
          <Graph key={current.key} story={story} view={current.view} layers={current.layers} label={current.title}/>
          <p className="stage-readout" data-testid="story-readout">{current.readout}</p>
        </div>
        <ol className="story-steps">{steps.map((step, index) => <li key={step.key} ref={bind(index)} data-step={index} className={`story-step${index === active ? ' active' : ''}`}>
          <h3>{step.title}</h3><p>{step.body}</p></li>)}</ol></>
        : state.status === 'error' ? <Callout tone="warn" title="The step-by-step story is built from live API data">{state.message}</Callout>
        : <div className="skeleton" style={{height: 420}} aria-busy="true"/>}
    </section>

    <section id="how" className="how" aria-labelledby="how-title">
      <div className="how-head reveal"><h2 id="how-title">Five steps, two programs.</h2><p>Planning and checking are deliberately separate, so a bug in one cannot hide a mistake in the other.</p></div>
      <ol className="pipeline reveal">
        <li><b>Model</b><span>A scenario file lists assets, zones, firewall rules, findings, required flows and priced actions.</span></li>
        <li><b>Analyze</b><span>Exploit and credential-reuse steps become a directed graph of attack paths.</span></li>
        <li className="side-a"><b>Optimize</b><span>Branch-and-bound search for the cheapest action set that cuts every path and breaks no required flow.</span></li>
        <li className="side-b"><b>Verify</b><span>A separate verifier rebuilds the graph from the raw scenario and re-tests the plan.</span></li>
        <li><b>Receipt</b><span>Canonical JSON plus a SHA-256 digest, so the same inputs always produce the same evidence.</span></li></ol>
      <div className="split reveal">
        <div><h3>The optimizer proposes.</h3><p>It explores combinations in a fixed order, breaks ties deterministically, and reports <code>OPTIMAL</code> only if the search finished. If it runs out of budget it says <code>FEASIBLE_NOT_PROVEN</code>.</p></div>
        <div><h3>The verifier decides.</h3><p>It is written with the standard library only and imports nothing from the optimizer; a test enforces this. It can reject a plan the optimizer was confident about, and explains exactly which check failed.</p></div></div>
    </section>

    <section id="demo" className="demo reveal" aria-labelledby="demo-title">
      <div><h2 id="demo-title">Run it yourself.</h2><p>Pick a scenario. The workspace lets you inspect the network, generate a plan, verify it, compare before and after, and download the receipt.</p></div>
      <ScenarioList items={items} error={listError} onRetry={loadList}/>
    </section>

    <section id="evidence" className="evidence reveal" aria-labelledby="evidence-title">
      <h2 id="evidence-title">What the implementation actually guarantees.</h2>
      <dl>
        <div><dt>Required flows are constraints.</dt><dd>A plan that breaks a flow the scenario marks as required is never returned, however cheap.</dd></div>
        <div><dt>Optimal means proven.</dt><dd>Exact search with deterministic tie-breaking, cross-checked against an exhaustive brute-force oracle on both scenarios. Anything unproven is labelled as such.</dd></div>
        <div><dt>The verifier is independent.</dt><dd>Separate package, standard library only, no imports from the planner, enforced by a test.</dd></div>
        <div><dt>Receipts are reproducible.</dt><dd>Canonical JSON and a SHA-256 digest. Re-verifying a receipt recomputes the same digest.</dd></div>
        <div><dt>What it is not.</dt><dd>A model, not a scanner. Edges are modelled reachability, not proof of exploitability. Costs are planning units, not currency.</dd></div></dl>
    </section>

    <section className="final reveal" aria-labelledby="final-title"><h2 id="final-title">See the path get cut.</h2>{cta}</section>
    <footer className="l-foot"><span>CHOKEPOINT · hackathon prototype · synthetic scenarios only</span><a href="https://github.com/Sidd927/Chokepoint">Source on GitHub</a></footer>
  </div>;
}
