import {useEffect, useState} from 'react';
import {Link, useParams, Routes, Route} from 'react-router-dom';
import {errorMessage, listScenarios} from '../api/client';
import type {ScenarioSummary} from '../api/client';
import {Shell} from '../components/Shell';
import {Workspace} from './Workspace';

function Home() {
  const [items, setItems] = useState<ScenarioSummary[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    listScenarios().then(result => { if (active) setItems(result.scenarios); })
      .catch(error => { if (active) setError(errorMessage(error)); });
    return () => { active = false; };
  }, []);
  return <Shell><main className="home">
    <section className="hero"><p className="kicker">Defensive planning for modelled infrastructure</p>
      <h1>Cut the path.<br/><em>Keep the service.</em></h1>
      <p className="lede">CHOKEPOINT finds catalogue remediation plans that remove logical attack reachability without breaking required operational flows.</p>
    </section>
    {error && <div data-testid="error-banner" role="alert" className="notice error">{error}</div>}
    <section className="cards" aria-label="Synthetic scenarios">{items.map(scenario =>
      <Link data-testid="scenario-card" className="scenario-card" to={`/scenarios/${scenario.id}`} key={scenario.id}>
        <div className="card-top"><span className="badge">Synthetic model</span><span className="card-count">{scenario.counts.assets} assets</span></div>
        <h2>{scenario.name}</h2><p>{scenario.description}</p>
        <div className="card-foot"><span>{scenario.counts.actions} catalogue actions</span><span>{scenario.fingerprint.slice(7, 15)}</span></div>
      </Link>)}</section>
  </main></Shell>;
}

// A scenario route is an isolation boundary: navigation unmounts its pending requests and local editor state.
function ScenarioRoute() { const {id = ''} = useParams(); return <Workspace key={id} id={id}/>; }
export function App() {
  return <Routes><Route path="/" element={<Home/>}/><Route path="/scenarios/:id" element={<ScenarioRoute/>}/>
    <Route path="*" element={<Shell><main><h1>Scenario not found</h1><Link to="/">Return to scenarios</Link></main></Shell>}/>
  </Routes>;
}
