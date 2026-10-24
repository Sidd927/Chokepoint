import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {getHealth} from '../api/client';

export function Shell({children}: {children: ReactNode}) {
  const [health, setHealth] = useState<'checking' | 'online' | 'down'>('checking');
  const epoch = useRef(0);
  const check = () => {
    const token = ++epoch.current;
    setHealth('checking');
    getHealth().then(result => { if (token === epoch.current) setHealth(result.status === 'ok' ? 'online' : 'down'); })
      .catch(() => { if (token === epoch.current) setHealth('down'); });
  };
  useEffect(() => { check(); return () => { ++epoch.current; }; }, []);
  return <><header className="topbar"><Link to="/" className="brand">CHOKEPOINT</Link>
    <div className="health-wrap"><span className={`health-dot ${health}`}/><span role="status">Backend {health}</span>
      {health === 'down' && <button type="button" className="retry" onClick={check}>Retry</button>}</div>
  </header>{children}</>;
}
