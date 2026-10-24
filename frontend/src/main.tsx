import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import './style.css'; import {App} from './pages/App';
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
