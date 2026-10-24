import {Link, Navigate, Routes, Route, useParams} from 'react-router-dom';
import {Shell} from '../components/Shell';
import {Landing} from './Landing';
import {Workspace} from './Workspace';

// A scenario route is an isolation boundary: navigation unmounts its pending requests and local editor state.
function ScenarioRoute() { const {id = ''} = useParams(); return <Workspace key={id} id={id}/>; }
export function App() {
  return <Routes><Route path="/" element={<Landing/>}/><Route path="/scenarios" element={<Navigate to="/#demo" replace/>}/><Route path="/scenarios/:id" element={<ScenarioRoute/>}/>
    <Route path="*" element={<Shell><main className="page"><h1>Page not found</h1><p><Link to="/">Return to the start</Link></p></main></Shell>}/>
  </Routes>;
}
