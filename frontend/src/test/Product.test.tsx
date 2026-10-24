import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {App} from '../pages/App';
import {actionCost, checkLabel, connectionsAffected, describeEffect, solverMessage} from '../lib/explain';
import {computeLayout} from '../components/GraphCanvas';
import type {Graph, Receipt, Scenario} from '../api/client';

vi.mock('cytoscape', () => ({default: () => {
  const chain: unknown = new Proxy(function () {}, {get: (_t, key) => key === 'length' ? 0 : key === 'zoom' ? () => 1 : key === 'width' || key === 'height' ? () => 400 : () => chain, apply: () => chain});
  return chain;
}}));

const scenario: Scenario = {id: 'toy', name: 'Toy City (synthetic)', description: 'Toy', synthetic: true, fingerprint: 'sha256:abcdef0123456789',
  zones: [{id: 'Z_IN', name: 'Internet'}, {id: 'Z_MID', name: 'Middle'}, {id: 'Z_OT', name: 'OT'}],
  assets: [
    {id: 'net', name: 'Internet', zone: 'Z_IN', kind: 'external', services: [], credentials: []},
    {id: 'gw', name: 'Gateway', zone: 'Z_MID', kind: 'gateway', services: [{id: 'https', port: 443, finding_ids: ['F1']}], credentials: []},
    {id: 'plc', name: 'Pump PLC', zone: 'Z_OT', kind: 'plc', services: [{id: 'modbus', port: 502, finding_ids: []}], credentials: [{target_asset: 'plc', service_id: 'modbus'}]}],
  findings: [{id: 'F1', title: 'Gateway weakness', description: 'x'}],
  rules: [{id: 'R1', src: 'net', dst: 'gw', ports: [443], label: 'Public gateway'}],
  required_flows: [{id: 'RF1', src: 'net', dst: 'gw', port: 443, description: 'Public access'}], origins: ['net'], targets: ['plc'],
  actions: [{id: 'A1', kind: 'patch_finding', params: {asset_id: 'gw', finding_id: 'F1'}, description: 'Patch gateway', mandatory: true, effort_dh: 10, downtime_dh: 5, cost_dh: 20},
    {id: 'A2', kind: 'remove_rule', params: {rule_id: 'R1'}, description: 'Remove rule', mandatory: false, cost_dh: 7}]};
const reason = {type: 'exploit', service_id: 'https', port: 443, finding_id: 'F1', rule_ids: ['R1']};
const before: Graph = {scenario_id: 'toy', applied_action_ids: [], nodes: scenario.assets.map(a => ({id: a.id, name: a.name, zone: a.zone, kind: a.kind, is_origin: a.id === 'net', is_target: a.id === 'plc', reachable: true})),
  edges: [{id: 'net->gw', source: 'net', target: 'gw', reasons: [reason]}, {id: 'gw->plc', source: 'gw', target: 'plc', reasons: [{type: 'credential', service_id: 'modbus', port: 502, finding_id: null, rule_ids: ['R1']}]}],
  rules: [{id: 'R1', status: 'active'}], flows: [{id: 'RF1', permitted: true, granting_rule_ids: ['R1']}], reachable_targets: ['plc'], witness_path: ['net', 'gw', 'plc']};
const after: Graph = {...before, applied_action_ids: ['A1'], edges: [], nodes: before.nodes.map(n => ({...n, reachable: n.id === 'net'})), reachable_targets: []};
const receipt = (digest: string): Receipt => ({schema: 'chokepoint.receipt/1', verifier: 'chokepoint-verifier/1', scenario_id: 'toy', scenario_fingerprint: 'sha256:scn', action_ids: ['A1'], action_costs: [{id: 'A1', cost_dh: 20}],
  total_cost_dh: 20, action_count: 1, claimed_solver_status: 'FEASIBLE_NOT_PROVEN', receipt_fingerprint: digest,
  verification: {status: 'VERIFIED', checks: [{code: 'TARGETS_UNREACHABLE', passed: true, detail: 'ok'}], targets_reachable_after: [], flows_broken: [], violations: []}});

function route(status: string, extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const ok = (body: unknown) => Promise.resolve({ok: true, status: 200, json: async () => body});
    if (url.endsWith('/health')) return ok({status: 'ok'});
    if (url.endsWith('/scenarios')) return ok({scenarios: [{...scenario, counts: {assets: 3, zones: 3, findings: 1, required_flows: 1, targets: 1, actions: 2}}]});
    if (url.endsWith('/scenarios/toy')) return ok(scenario);
    if (url.endsWith('/graph')) return ok(JSON.parse(String(init?.body)).action_ids.length ? after : before);
    if (url.endsWith('/plan')) { const r = receipt('sha256:' + 'a'.repeat(64)); return ok({solver_status: status, method: 'exact', action_ids: ['A1'], action_count: 1, total_cost_dh: 20, actions: [scenario.actions[0]], proof: {nodes_evaluated: 3, budget_exhausted: status !== 'OPTIMAL'}, limitations: [], verification: {verdict: 'VERIFIED', checks: r.verification.checks, violations: [], receipt: r}, receipt: r, ...extra}); }
    return ok({});
  }));
}
const open = async () => { render(<MemoryRouter initialEntries={['/scenarios/toy']}><App/></MemoryRouter>); await waitFor(() => expect(screen.getByRole('button', {name: 'Plan'})).toBeTruthy()); };
beforeEach(() => route('OPTIMAL')); afterEach(() => cleanup());

describe('explanations are derived from scenario data', () => {
  it('describes each action kind in plain language', () => {
    expect(describeEffect(scenario.actions[0], scenario)).toContain('Gateway weakness');
    expect(describeEffect(scenario.actions[1], scenario)).toContain('Public gateway');
    expect(actionCost({...scenario.actions[0], cost_dh: undefined})).toBe(20);
  });
  it('counts only connections that rely on the action', () => {
    expect(connectionsAffected(scenario.actions[0], before)).toBe(1);
    expect(connectionsAffected(scenario.actions[1], before)).toBe(2);
    expect(connectionsAffected(scenario.actions[0], after)).toBe(0);
  });
  it('labels checks and never calls an unproven result optimal', () => {
    expect(checkLabel('FLOWS_PRESERVED')[0]).toBe('Required flows still work');
    expect(checkLabel('UNKNOWN_CODE')[0]).toBe('UNKNOWN_CODE');
    expect(solverMessage('FEASIBLE_NOT_PROVEN')).toContain('before proving');
    expect(solverMessage('FEASIBLE_NOT_PROVEN')).not.toContain('Exact search finished');
    expect(solverMessage('OPTIMAL')).toContain('Exact search finished');
  });
  it('orders zones into columns by attack distance from the origin', () => {
    const {positions, zoneOrder} = computeLayout(scenario, before);
    expect(zoneOrder).toEqual(['Z_IN', 'Z_MID', 'Z_OT']);
    expect(positions.get('net')!.x).toBeLessThan(positions.get('gw')!.x);
    expect(positions.get('gw')!.x).toBeLessThan(positions.get('plc')!.x);
  });
});

describe('product workflow against the API contract', () => {
  it('home lists scenario facts from the API and offers retry when the API fails', async () => {
    render(<MemoryRouter><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('scenario-card').textContent).toContain('required flows'));
    cleanup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Failed to fetch'))));
    render(<MemoryRouter><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('error-banner').textContent).toContain('Failed to fetch'));
    expect(screen.getAllByRole('button', {name: 'Retry'}).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('story-error')).toBeTruthy();
    expect(screen.getAllByText('Backend down').length).toBeGreaterThan(0);
  });

  it('shows an honest warning, not "optimal", for an unproven plan', async () => {
    route('FEASIBLE_NOT_PROVEN'); await open();
    fireEvent.click(screen.getByRole('button', {name: 'Plan'})); fireEvent.click(screen.getByTestId('compute-plan'));
    await waitFor(() => expect(screen.getByTestId('solver-status').textContent).toBe('FEASIBLE_NOT_PROVEN'));
    expect(screen.getByTestId('plan-result').textContent).toContain('before proving');
    expect(screen.getByTestId('plan-result').textContent).not.toContain('Exact search finished');
    expect(screen.getByTestId('plan-cost').textContent).toBe('20\u00a0dh');
  });

  it('receipt download is the exact JSON that is displayed, and the digest is the backend value', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', {name: 'Plan'})); fireEvent.click(screen.getByTestId('compute-plan'));
    await waitFor(() => expect(screen.getByTestId('solver-status')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', {name: 'Receipt'}));
    await waitFor(() => expect(screen.getByTestId('receipt-digest').textContent).toBe('sha256:' + 'a'.repeat(64)));
    const href = screen.getByTestId('receipt-download').getAttribute('href')!;
    const downloaded = JSON.parse(decodeURIComponent(href.split(',')[1]));
    expect(downloaded).toEqual(JSON.parse(screen.getByTestId('receipt-json').textContent!));
    expect(screen.getByTestId('receipt-download').getAttribute('download')).toMatch(/\.receipt\.json$/);
  });

  it('changing the selection clears a previous verification so a stale plan cannot look verified', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', {name: 'Plan'})); fireEvent.click(screen.getByTestId('compute-plan'));
    await waitFor(() => expect(screen.getByTestId('solver-status')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', {name: 'Verify'}));
    expect(screen.getByTestId('verify-verdict').textContent).toContain('VERIFIED');
    fireEvent.click(screen.getAllByTestId('check-row')[1]);
    expect(screen.queryByTestId('verify-verdict')).toBeNull();
  });

  it('shows a visible error when the plan request fails', async () => {
    await open();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ok: false, status: 500, json: async () => ({error: {message: 'internal error'}})})));
    fireEvent.click(screen.getByRole('button', {name: 'Plan'})); fireEvent.click(screen.getByTestId('compute-plan'));
    await waitFor(() => expect(screen.getAllByRole('alert')[0].textContent).toContain('internal error'));
    expect(screen.queryByTestId('solver-status')).toBeNull();
  });
});

describe('landing page', () => {
  it('builds its story from live API data and never from hard-coded results', async () => {
    render(<MemoryRouter><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('hero-caption').textContent).toContain('1 of 1'));
    expect(screen.getByTestId('hero-caption').textContent).toContain('Toy City (synthetic)');
    expect(screen.getByRole('heading', {name: /Cut the path/})).toBeTruthy();
    expect(screen.getAllByRole('heading', {level: 3}).map(h => h.textContent).some(text => text?.includes('cheapest plan'))).toBe(true);
    fireEvent.click(screen.getByRole('button', {name: 'After the plan'}));
    expect(screen.getByTestId('hero-caption').textContent).toContain('0 of 1');
    expect(screen.getByTestId('hero-caption').textContent).toContain('20\u00a0dh');
    expect(screen.getAllByRole('link', {name: /Explore the live demo|Open the workspace/}).every(link => link.getAttribute('href') === '/scenarios/toy')).toBe(true);
  });

  it('lists the scenarios as links into the real workspace', async () => {
    render(<MemoryRouter><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('scenario-card').getAttribute('href')).toBe('/scenarios/toy'));
  });

  it('says so plainly when the backend is unavailable instead of faking a preview', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Failed to fetch'))));
    render(<MemoryRouter><App/></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('story-error').textContent).toContain('needs the backend'));
    expect(screen.queryByTestId('hero-caption')).toBeNull();
    expect(screen.queryByTestId('story-readout')).toBeNull();
  });
});
