import {describe, expect, it, vi} from 'vitest';
import {planScenario, verifyPlan} from '../api/client';

describe('API request validation', () => {
  it('rejects invalid search budgets before serializing a request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(planScenario('demo_city', 'exact', Number.NaN)).rejects.toThrow('whole number');
    await expect(planScenario('demo_city', 'exact', 0)).rejects.toThrow('whole number');
    await expect(planScenario('demo_city', 'exact', 2000001)).rejects.toThrow('whole number');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends NaN or null as a claimed verification cost', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ok: true, json: async () => ({verdict: 'VERIFIED', receipt: {}})}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyPlan({scenario_id: 'demo_city', action_ids: [], claimed_total_cost_dh: Number.NaN})).rejects.toThrow('non-negative');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
