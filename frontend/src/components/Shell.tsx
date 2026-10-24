import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {getHealth, listScenarios} from '../api/client';
import type {ScenarioSummary} from '../api/client';

export type NavItem = {id: string; label: string; hint: string; active: boolean; done?: boolean; onSelect: () => void};

export function Mark({size = 22}: {size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7v5.5L14 12l-4 1.5V19H3M21 5h-7v5.5L10 12l4 1.5V19h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>;
}

export function Health() {
  const [health, setHealth] = useState<'checking' | 'online' | 'down'>('checking');
  const epoch = useRef(0);
  const check = () => {
    const token = ++epoch.current;
    setHealth('checking');
    getHealth().then(result => { if (token === epoch.current) setHealth(result.status === 'ok' ? 'online' : 'down'); })
      .catch(() => { if (token === epoch.current) setHealth('down'); });
  };
  useEffect(() => { check(); return () => { ++epoch.current; }; }, []);
  return <div className="health-wrap"><span className={`health-dot ${health}`} aria-hidden="true"/><span role="status">Backend {health}</span>
    {health === 'down' && <button type="button" className="btn btn-ghost retry" onClick={check}>Retry</button>}</div>;
}

function ScenarioSwitch({current}: {current: string}) {
  const [items, setItems] = useState<ScenarioSummary[]>([]);
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    listScenarios().then(result => { if (active) setItems(result.scenarios); }).catch(() => { /* the page itself reports API failures */ });
    return () => { active = false; };
  }, []);
  return <label className="switch"><span className="sr-only">Scenario</span>
    <select aria-label="Scenario" value={current} onChange={event => navigate(`/scenarios/${event.target.value}`)}>
      {!items.some(item => item.id === current) && <option value={current}>{current}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.name.replace(' (synthetic)', '')}</option>)}
    </select></label>;
}

/** Workspace chrome: one slim top bar so the graph gets the full width underneath. */
export function Shell({children, nav, scenarioId, action}: {children: ReactNode; nav?: NavItem[]; scenarioId?: string; action?: ReactNode}) {
  return <div className="app">
    <a className="skip" href="#main">Skip to content</a>
    <header className="topbar">
      <Link to="/" className="brand" aria-label="CHOKEPOINT"><Mark/><span>CHOKEPOINT</span></Link>
      {scenarioId && <ScenarioSwitch current={scenarioId}/>}
      {nav && <nav aria-label="Workflow" className="steps">{nav.map((item, index) =>
        <button type="button" key={item.id} aria-label={item.label} aria-current={item.active ? 'page' : undefined} className={`step${item.active ? ' active' : ''}${item.done ? ' done' : ''}`} onClick={item.onSelect} title={item.hint}>
          <span className="step-index" aria-hidden="true">{item.done ? '✓' : index + 1}</span><span aria-hidden="true">{item.label}</span></button>)}</nav>}
      <div className="top-right"><Health/>{action}</div>
    </header>
    <div className="content" id="main">{children}</div>
  </div>;
}
