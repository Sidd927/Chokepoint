/** An imported scenario lives only in this browser tab (sessionStorage) and is re-sent with each request; the server stores nothing. */
export const IMPORTED_ID = 'imported';
export const IMPORT_MAX_BYTES = 256 * 1024;
const KEY = 'chokepoint.imported-scenario';

export type ScenarioDocument = Record<string, unknown>;
export const getImported = (): ScenarioDocument | undefined => {
  try { const text = sessionStorage.getItem(KEY); return text ? JSON.parse(text) : undefined; } catch { return undefined; }
};
export const setImported = (document: ScenarioDocument) => sessionStorage.setItem(KEY, JSON.stringify(document));
export const clearImported = () => sessionStorage.removeItem(KEY);
/** Request fields identifying a scenario: a built-in id, or the inline imported document. */
export const scenarioRef = (id: string): {scenario_id: string} | {scenario: ScenarioDocument} => {
  if (id !== IMPORTED_ID) return {scenario_id: id};
  const scenario = getImported();
  if (!scenario) throw new Error('No imported scenario in this session. Import one first.');
  return {scenario};
};
/** Server-added fields that the strict scenario schema rejects if sent back. */
export const stripServerFields = (scenario: Record<string, unknown>): ScenarioDocument => {
  const {fingerprint: _f, warnings: _w, ...rest} = scenario; return rest;
};
