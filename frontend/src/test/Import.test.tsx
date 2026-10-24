import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {App} from '../pages/App';

vi.mock('cytoscape', () => ({default: () => { const chain: unknown = new Proxy(function () {}, {get: (_t, key) => key === 'length' ? 0 : key === 'zoom' ? () => 1 : key === 'width' || key === 'height' ? () => 400 : () => chain, apply: () => chain}); return chain; }}));

const scenario = {id: 'mine', name: 'My Network', description: 'd', synthetic: true, fingerprint: 'sha256:' + 'ab'.repeat(32), warnings: [{code: 'INERT_ACTION', message: 'A9 neutralises no initial graph reason', path: '/actions/A9'}],
  zones: [{id: 'Z', name: 'Zone'}], assets: [{id: 'a', name: 'A', zone: 'Z', kind: 'server', services: [], credentials: []}], findings: [], rules: [], required_flows: [], origins: ['a'], targets: ['a'], actions: []};
const graph = {scenario_id: 'mine', applied_action_ids: [], nodes: [{id: 'a', name: 'A', zone: 'Z', kind: 'server', is_origin: true, is_target: true, reachable: true}], edges: [], rules: [], flows: [], reachable_targets: ['a'], witness_path: ['a']};
const bodies: Record<string, unknown>[] = [];

beforeEach(() => {
  sessionStorage.clear(); bodies.length = 0;
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const ok = (body: unknown) => Promise.resolve({ok: true, status: 200, json: async () => body});
    if (init?.body) bodies.push({url, ...JSON.parse(String(init.body))});
    if (url.endsWith('/health')) return ok({status: 'ok'});
    if (url.endsWith('/scenarios')) return ok({scenarios: []});
    if (url.endsWith('/scenarios/validate')) {
      const sent = JSON.parse(String(init?.body)).scenario;
      return sent.id === 'bad' ? Promise.resolve({ok: false, status: 422, json: async () => ({error: {code: 'INVALID_SCENARIO', message: 'unknown reference', details: [{path: '/actions/2/params/rule_id', message: 'unknown reference'}]}})})
        : ok({valid: true, scenario, graph, max_nodes_limit: 1000});
    }
    if (url.endsWith('/graph')) return ok(graph);
    return ok({});
  }));
});
afterEach(() => cleanup());
const renderImport = () => render(<MemoryRouter initialEntries={['/import']}><App/></MemoryRouter>);
const type = (value: string) => fireEvent.change(screen.getByLabelText('Scenario JSON'), {target: {value}});

describe('scenario import page', () => {
  it('rejects malformed JSON in the browser without calling the server', async () => {
    renderImport(); type('{not json'); fireEvent.click(screen.getByTestId('import-validate'));
    await waitFor(() => expect(screen.getByTestId('import-error').textContent).toContain('not valid JSON'));
    expect(bodies.some(b => String(b.url).endsWith('/validate'))).toBe(false);
  });

  it('shows the server\'s path-level problems and leaves the user\'s text untouched', async () => {
    renderImport(); const text = JSON.stringify({id: 'bad'}); type(text); fireEvent.click(screen.getByTestId('import-validate'));
    await waitFor(() => expect(screen.getByTestId('import-error').textContent).toContain('/actions/2/params/rule_id'));
    expect((screen.getByLabelText('Scenario JSON') as HTMLTextAreaElement).value).toBe(text);
    expect(screen.queryByTestId('import-success')).toBeNull();
  });

  it('previews a valid scenario, then the workspace sends it inline and never as a built-in id', async () => {
    renderImport(); type(JSON.stringify({id: 'mine'})); fireEvent.click(screen.getByTestId('import-validate'));
    await waitFor(() => expect(screen.getByTestId('import-success').textContent).toContain('Valid scenario: My Network'));
    expect(screen.getByTestId('import-success').textContent).toContain('INERT_ACTION');
    fireEvent.click(screen.getByTestId('import-open'));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Plan'})).toBeTruthy());
    expect(sessionStorage.getItem('chokepoint.imported-scenario')).toContain('"mine"');
    const graphCall = bodies.find(b => String(b.url).endsWith('/graph'))!;
    expect(graphCall.scenario).toBeTruthy(); expect(graphCall.scenario_id).toBeUndefined();
    expect(screen.getByText(/never stored by the server/)).toBeTruthy();
  });

  it('says so plainly when no scenario was imported in this session', async () => {
    render(<MemoryRouter initialEntries={['/scenarios/imported']}><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('error-banner').textContent).toContain('No imported scenario'));
  });
});
