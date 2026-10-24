import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {App} from '../pages/App';

// Cytoscape needs a real canvas; a chainable stub is enough to test the React layer.
vi.mock('cytoscape', () => ({default: () => {
  const chain: unknown = new Proxy(function () {}, {get: (_t, key) => key === 'length' ? 0 : key === 'zoom' ? () => 1 : key === 'width' || key === 'height' ? () => 400 : () => chain, apply: () => chain});
  return chain;
}}));

beforeEach(()=>{
  vi.stubGlobal('fetch', vi.fn((url:string)=>Promise.resolve({ok:true,json:async()=>url.includes('/health')?{status:'ok'}:{scenarios:[{id:'canonical_city',name:'Canonical City',description:'Synthetic city',synthetic:true,fingerprint:'sha256:12345678',counts:{assets:6,actions:8}}]}})));
});
afterEach(() => cleanup());

describe('application shell',()=>{
  it('loads scenario cards from the API',async()=>{
    render(<MemoryRouter><App/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByTestId('scenario-card')).toBeTruthy());
    expect(screen.getByText('Canonical City')).toBeTruthy();
    expect(screen.getByText('Backend online')).toBeTruthy();
  });

  it('shows a rejected claimed cost and re-verifies the displayed receipt', async () => {
    const scenario = {id:'canonical_city',name:'Canonical City',description:'Synthetic city',synthetic:true,fingerprint:'sha256:12345678',zones:[],assets:[],findings:[],rules:[],required_flows:[],origins:[],targets:[],actions:[{id:'A01',kind:'patch_finding',params:{asset_id:'x'},description:'Patch',mandatory:false,cost_dh:3}]};
    const graph = {scenario_id:'canonical_city',applied_action_ids:[],nodes:[],edges:[],rules:[],flows:[],reachable_targets:[],witness_path:null};
    const receipt = {schema:'chokepoint.receipt/1',verifier:'chokepoint-verifier/1',scenario_id:'canonical_city',scenario_fingerprint:'sha256:scenario',action_ids:['A01'],action_costs:[{id:'A01',cost_dh:3}],total_cost_dh:3,action_count:1,claimed_solver_status:'OPTIMAL',verification:{status:'VERIFIED',checks:[],targets_reachable_after:[],flows_broken:[],violations:[]},receipt_fingerprint:'sha256:displayed'};
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) return Promise.resolve({ok:true,json:async()=>({status:'ok'})});
      if (url.endsWith('/scenarios')) return Promise.resolve({ok:true,json:async()=>({scenarios:[{...scenario,counts:{assets:0,actions:1}}]})});
      if (url.endsWith('/scenarios/canonical_city')) return Promise.resolve({ok:true,json:async()=>scenario});
      if (url.endsWith('/plan')) return Promise.resolve({ok:true,json:async()=>({solver_status:'OPTIMAL',action_ids:['A01'],action_count:1,total_cost_dh:3,actions:scenario.actions,verification:{verdict:'VERIFIED',checks:[],violations:[],receipt},receipt})});
      if (url.endsWith('/verify')) return Promise.resolve({ok:true,json:async()=>({verdict:'REJECTED',checks:[],violations:[{code:'CLAIMED_COST_MISMATCH',detail:'claimed cost does not match'}],receipt:{...receipt,receipt_fingerprint:'sha256:return'}})});
      return Promise.resolve({ok:true,json:async()=>graph});
    }));
    const {App} = await import('../pages/App');
    render(<MemoryRouter initialEntries={['/scenarios/canonical_city']}><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button',{name:'Plan'})).toBeTruthy());
    fireEvent.click(screen.getByRole('button',{name:'Plan'})); fireEvent.click(screen.getByTestId('compute-plan'));
    await waitFor(() => expect(screen.getByTestId('solver-status').textContent).toContain('OPTIMAL'));
    fireEvent.click(screen.getByRole('button',{name:'Receipt'}));
    await waitFor(() => expect(screen.getByTestId('receipt-json')).toBeTruthy());
    fireEvent.click(screen.getByTestId('receipt-reverify'));
    await waitFor(() => expect(screen.getByTestId('receipt-integrity').textContent).toContain('mismatch'));
    expect(screen.getByTestId('receipt-integrity').textContent).toContain('sha256:return');
  });

  it('does not commit a graph response after scenario navigation unmounts it', async () => {
    let resolveGraph!: (value: unknown) => void;
    const pendingGraph = new Promise(resolve => { resolveGraph = resolve; });
    const scenario = {id:'canonical_city',name:'Canonical City',description:'Synthetic city',synthetic:true,fingerprint:'sha256:12345678',zones:[],assets:[],findings:[],rules:[],required_flows:[],origins:[],targets:[],actions:[]};
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return Promise.resolve({ok:true,json:async()=>({status:'ok'})});
      if (url.endsWith('/scenarios/canonical_city')) return Promise.resolve({ok:true,json:async()=>scenario});
      if (url.endsWith('/scenarios')) return Promise.resolve({ok:true,json:async()=>({scenarios:[]})});
      return pendingGraph.then(value => ({ok:true,json:async()=>value}));
    }));
    render(<MemoryRouter initialEntries={['/scenarios/canonical_city']}><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Loading scenario model…')).toBeTruthy());
    fireEvent.click(screen.getByRole('link',{name:'CHOKEPOINT'}));
    resolveGraph({scenario_id:'canonical_city',applied_action_ids:[],nodes:[],edges:[],rules:[],flows:[],reachable_targets:[],witness_path:null});
    await waitFor(() => expect(screen.getByRole('heading',{name:/Cut the path/})).toBeTruthy());
    expect(screen.queryByText('Canonical City')).toBeNull();
  });
});
