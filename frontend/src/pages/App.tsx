import {useEffect, useRef, useState} from 'react';
import {Link, useParams, Routes, Route} from 'react-router-dom';
import {errorMessage, listScenarios} from '../api/client';
import type {ScenarioSummary} from '../api/client';
import {Shell} from '../components/Shell';
import {Callout, Chip} from '../components/ui';
import {Workspace} from './Workspace';

function Home() {
  const [items, setItems] = useState<ScenarioSummary[]>([]);
  const [error, setError] = useState('');
  const active = useRef(true);
  const load = () => { setError(''); listScenarios().then(result => { if (active.current) setItems(result.scenarios); })
    .catch(error => { if (active.current) setError(errorMessage(error)); }); };
  useEffect(() => { active.current = true; load(); return () => { active.current = false; }; }, []);
  return <Shell><main className="page home">
    <section className="hero"><p className="eyebrow">Defensive planning for modelled infrastructure</p>
      <h1>Cut the path. <em>Keep the service.</em></h1>
      <p className="lede">CHOKEPOINT finds the cheapest set of catalogue changes that cuts every modelled attack path to critical systems without breaking the services a city needs, then re-checks the result with an independent verifier and issues a SHA-256 receipt.</p>
      <ol className="flow-strip" aria-label="How it works"><li>Inspect the network</li><li>See attack paths</li><li>Plan the fix</li><li>Verify independently</li><li>Keep the receipt</li></ol>
    </section>
    {error && <Callout tone="risk" role="alert" testId="error-banner" title="Could not load scenarios">{error} <button type="button" className="btn btn-secondary" onClick={load}>Retry</button></Callout>}
    {!error && items.length === 0 && <div className="skeleton" style={{height: 150}} aria-busy="true"/>}
    <section className="scenarios" aria-label="Synthetic scenarios"><h2 className="eyebrow">Choose a synthetic scenario</h2><div className="cards">{items.map(scenario =>
      <Link data-testid="scenario-card" className="scenario-card" to={`/scenarios/${scenario.id}`} key={scenario.id}>
        <div className="card-top"><h3>{scenario.name}</h3><Chip tone="warn">synthetic</Chip></div><p>{scenario.description}</p>
        <dl className="card-stats">{([['assets', 'assets'], ['zones', 'zones'], ['findings', 'findings'], ['required_flows', 'required flows'], ['targets', 'critical targets'], ['actions', 'catalogue actions']] as const).map(([key, label]) =>
          <div key={key}><dt>{label}</dt><dd>{scenario.counts[key] ?? '—'}</dd></div>)}</dl>
        <div className="card-foot"><span className="mono">sha256:{scenario.fingerprint.slice(7, 15)}…</span><span className="open">Open workspace →</span></div>
      </Link>)}</div></section>
  </main></Shell>;
}

// A scenario route is an isolation boundary: navigation unmounts its pending requests and local editor state.
function ScenarioRoute() { const {id = ''} = useParams(); return <Workspace key={id} id={id}/>; }
export function App() {
  return <Routes><Route path="/" element={<Home/>}/><Route path="/scenarios/:id" element={<ScenarioRoute/>}/>
    <Route path="*" element={<Shell><main className="page"><h1>Page not found</h1><p><Link to="/">Return to scenarios</Link></p></main></Shell>}/>
  </Routes>;
}
