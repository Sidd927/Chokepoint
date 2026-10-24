import {useEffect, useRef, useState} from 'react';
import cytoscape from 'cytoscape';
import type {Core, ElementDefinition} from 'cytoscape';
import type {Action, Graph, Scenario} from '../api/client';
import {Callout} from './ui';
import {KIND_SHAPE} from './Legend';

export type GraphSelection = {type: 'node' | 'edge'; data: Record<string, unknown>};
export type Layers = {attack: boolean; permissions: boolean; flows: boolean; witness: boolean};

// These mirror the tokens in DESIGN.md / style.css (Cytoscape cannot read CSS variables).
const C = {bg0: '#0b0d12', bg1: '#11141b', bg2: '#171b24', bg3: '#1e2330', line: '#313a4d', text: '#eceae5', text2: '#a9b1c2', accent: '#6aa6ff', risk: '#f2706b', ok: '#47d391'};
const MIN_COL = 144; const MIN_ROW = 84;

type Size = {width: number; height: number};

/**
 * Zones become columns ordered by attack distance from the origins. Spacing grows with the canvas
 * (so a small scenario fills the stage instead of sitting in a corner); positions come only from backend graph data.
 */
export function computeLayout(scenario: Scenario, source: Graph, size?: Size) {
  const depth = new Map<string, number>(); const queue = [...scenario.origins];
  scenario.origins.forEach(id => depth.set(id, 0));
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of source.edges) if (edge.source === current && !depth.has(edge.target)) { depth.set(edge.target, depth.get(current)! + 1); queue.push(edge.target); }
  }
  const far = 99;
  const zoneDepth = (zone: string) => Math.min(far, ...source.nodes.filter(node => node.zone === zone).map(node => depth.get(node.id) ?? far));
  const zones = scenario.zones.map((zone, order) => ({zone, order, depth: zoneDepth(zone.id)})).sort((a, b) => a.depth - b.depth || a.order - b.order);
  const maxRows = Math.max(1, ...zones.map(({zone}) => source.nodes.filter(node => node.zone === zone.id).length));
  const W = size?.width ?? 800; const H = size?.height ?? 480; const Z = zones.length;
  // On narrow or portrait canvases, running the zones top-to-bottom gives a larger, more legible graph.
  const minCol = W < 520 ? 104 : MIN_COL;
  const horizScale = Math.min(W / ((Z - 1) * minCol + 180), H / ((maxRows - 1) * MIN_ROW + 200));
  const vertScale = Math.min(W / ((maxRows - 1) * 110 + 180), H / ((Z - 1) * 150 + 220));
  const vertical = !!size && vertScale > horizScale * 1.15;
  const colW = size ? Math.min(250, Math.max(minCol, (W - 80) / Z)) : minCol;
  const rowH = size ? Math.min(230, Math.max(MIN_ROW, (H - 80) / maxRows)) : MIN_ROW;
  const zoneGap = Math.min(210, Math.max(150, (H - 90) / Math.max(1, Z - 1))); const nodeGap = Math.min(230, Math.max(110, (W - 80) / maxRows));
  const positions = new Map<string, {x: number; y: number}>();
  zones.forEach(({zone}, column) => {
    const members = source.nodes.filter(node => node.zone === zone.id).sort((a, b) => (depth.get(a.id) ?? far) - (depth.get(b.id) ?? far) || a.name.localeCompare(b.name));
    members.forEach((node, row) => positions.set(node.id, vertical
      ? {x: (row - (members.length - 1) / 2) * nodeGap, y: column * zoneGap}
      : {x: column * colW, y: (row - (members.length - 1) / 2) * rowH}));
  });
  return {positions, zoneOrder: zones.map(item => item.zone.id)};
}

type Props = {graph: Graph; baseline?: Graph; scenario: Scenario; layers: Layers; highlightedAction?: Action; focusId?: string;
  /** Read-only presentation (landing page): no pan/zoom/tap, so it never captures scrolling or touch. */
  bare?: boolean; label?: string; onSelection?: (item: GraphSelection) => void};

export function GraphCanvas({graph, baseline, scenario, layers, highlightedAction, focusId, bare, label, onSelection}: Props) {
  const host = useRef<HTMLDivElement>(null); const cyRef = useRef<Core>();
  const selectRef = useRef(onSelection); selectRef.current = onSelection;
  const [failure, setFailure] = useState('');
  const blocked = (() => {
    if (!baseline || baseline === graph) return [];
    const present = new Set(graph.edges.map(edge => edge.id));
    return baseline.edges.filter(edge => !present.has(edge.id));
  })();
  const blockedKey = blocked.map(edge => edge.id).join('|');

  useEffect(() => {
    if (!host.current) return;
    setFailure('');
    const element = host.current;
    const pad = bare ? 28 : 40; const k = bare ? 1.3 : 1;
    let cy: Core | undefined;
    try {
      const layout = computeLayout(scenario, baseline ?? graph, {width: element.clientWidth || 800, height: element.clientHeight || 480});
      const zones = layout.zoneOrder.map(id => ({data: {id: `zone:${id}`, label: scenario.zones.find(zone => zone.id === id)?.name ?? id}}));
      const nodes = graph.nodes.map(node => ({data: {id: node.id, parent: `zone:${node.zone}`, label: node.name, kind: node.kind, shape: KIND_SHAPE[node.kind] ?? 'ellipse',
        origin: node.is_origin, target: node.is_target, reachable: node.reachable, cleared: node.is_target && !node.reachable},
        position: layout.positions.get(node.id) ?? {x: 0, y: 0}}));
      const edges: ElementDefinition[] = [];
      if (layers.attack) graph.edges.forEach(edge => edges.push({data: {id: `attack:${edge.id}`, source: edge.source, target: edge.target, edgeType: 'attack', reasons: edge.reasons}}));
      if (layers.attack) blocked.forEach(edge => edges.push({data: {id: `blocked:${edge.id}`, source: edge.source, target: edge.target, edgeType: 'blocked', reasons: edge.reasons}}));
      if (layers.flows) graph.flows.forEach(flow => { const required = scenario.required_flows.find(item => item.id === flow.id);
        if (required) edges.push({data: {id: `flow:${flow.id}`, source: required.src, target: required.dst, edgeType: 'flow', label: flow.id, permitted: flow.permitted, granting_rule_ids: flow.granting_rule_ids, description: required.description}}); });
      if (layers.permissions) graph.rules.filter(rule => rule.status !== 'removed').forEach(ruleState => {
        const rule = scenario.rules.find(item => item.id === ruleState.id); if (!rule) return;
        const sources = graph.nodes.filter(node => rule.src === node.id || rule.src === node.zone);
        const targets = graph.nodes.filter(node => rule.dst === node.id || rule.dst === node.zone);
        for (const source of sources) for (const target of targets) if (source.id !== target.id)
          if (ruleState.status !== 'restricted' || scenario.required_flows.some(flow => flow.src === source.id && flow.dst === target.id && (rule.ports === 'any' || rule.ports.includes(flow.port))))
            edges.push({data: {id: `rule:${rule.id}:${source.id}:${target.id}`, source: source.id, target: target.id, edgeType: 'permission', label: rule.id, status: ruleState.status, ruleLabel: rule.label}});
      });
      const witness = new Set<string>();
      if (layers.witness && graph.witness_path) for (let i = 0; i < graph.witness_path.length - 1; i++) witness.add(`${graph.witness_path[i]}->${graph.witness_path[i + 1]}`);

      cy = cytoscape({container: element, elements: [...zones, ...nodes, ...edges], layout: {name: 'preset'}, minZoom: .25, maxZoom: 2.5, wheelSensitivity: .25,
        ...(bare ? {userZoomingEnabled: false, userPanningEnabled: false, boxSelectionEnabled: false, autoungrabify: true} : {}), style: [
        {selector: 'node', style: {shape: 'data(shape)' as never, 'background-color': C.bg3, 'border-width': 1.5, 'border-color': C.line, width: 38 * k, height: 38 * k, label: 'data(label)', color: C.text, 'font-size': element.clientWidth < 520 ? 10.5 : 12 * (bare ? 1.1 : 1), 'font-weight': 500,
          'text-wrap': 'wrap', 'text-max-width': element.clientWidth < 520 ? '68px' : bare ? '100px' : '84px', 'text-valign': 'bottom', 'text-margin-y': 6, 'text-background-color': C.bg0, 'text-background-opacity': .85, 'text-background-padding': '2px'}},
        {selector: 'node[?reachable]', style: {'border-color': C.risk, 'border-width': 2.5}},
        {selector: 'node[?origin]', style: {'border-color': C.accent, 'border-width': 3, 'background-color': '#1b3556'}},
        {selector: 'node[?target][?reachable]', style: {'border-color': C.risk, 'border-width': 4, 'background-color': '#43212a', width: 46 * k, height: 46 * k}},
        {selector: 'node[?cleared]', style: {'border-color': C.ok, 'border-width': 4, 'background-color': '#16382c', width: 46 * k, height: 46 * k}},
        {selector: 'node:parent', style: {shape: 'round-rectangle', 'background-color': C.bg1, 'background-opacity': .7, 'border-color': C.line, 'border-width': 1, padding: '22px', label: 'data(label)',
          'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -4, color: C.text2, 'font-size': 11, 'font-weight': 600, 'text-background-opacity': 0, 'text-transform': 'uppercase'}},
        {selector: 'edge', style: {'curve-style': 'bezier', 'control-point-step-size': 36, 'target-arrow-shape': 'triangle', 'arrow-scale': .9, width: 1.4}},
        {selector: 'edge[edgeType="attack"]', style: {'line-color': C.risk, 'target-arrow-color': C.risk, opacity: .42}},
        {selector: 'edge[edgeType="blocked"]', style: {'line-color': C.risk, 'target-arrow-color': C.risk, 'line-style': 'dashed', opacity: .25, 'target-arrow-shape': 'tee'}},
        {selector: 'edge[edgeType="permission"]', style: {'line-style': 'dashed', 'line-color': '#8a94ab', 'target-arrow-color': '#8a94ab', opacity: .6, label: 'data(label)', 'font-size': 9, color: C.text2, 'text-background-color': C.bg0, 'text-background-opacity': 1}},
        {selector: 'edge[edgeType="permission"][status="restricted"]', style: {'line-color': C.accent, 'target-arrow-color': C.accent}},
        {selector: 'edge[edgeType="flow"]', style: {'line-style': 'dotted', width: 2.4, 'line-color': C.ok, 'target-arrow-color': C.ok, opacity: .95}},
        {selector: 'edge[edgeType="flow"][permitted="false"]', style: {'line-color': C.risk, 'target-arrow-color': C.risk, width: 3, 'line-style': 'dashed'}},
        {selector: 'edge.witness', style: {width: 3.8, opacity: 1, 'z-index': 9}},
        {selector: 'node.action-hl', style: {'border-color': C.accent, 'border-width': 5, 'underlay-color': C.accent, 'underlay-opacity': .25, 'underlay-padding': 8}},
        {selector: 'edge.action-hl', style: {width: 4, opacity: 1, 'line-color': C.accent, 'target-arrow-color': C.accent, 'z-index': 8}},
        {selector: '.dim', style: {opacity: .08}},
        {selector: 'node:selected', style: {'underlay-color': C.text, 'underlay-opacity': .18, 'underlay-padding': 8}},
        {selector: 'edge:selected', style: {width: 4, opacity: 1}},
      ]});
      const fit = () => { cy!.resize(); cy!.fit(undefined, pad); if (cy!.zoom() > 1.5) { cy!.zoom(1.5); cy!.center(); } };
      if (!bare) {
        cy.on('tap', 'node', event => { if (!event.target.isParent()) selectRef.current?.({type: 'node', data: event.target.data()}); });
        cy.on('tap', 'edge', event => selectRef.current?.({type: 'edge', data: event.target.data()}));
      }
      cy.on('mouseover', 'node', event => { if (event.target.isParent() || cy!.elements('.dim').length) return; const hood = event.target.closedNeighborhood(); cy!.elements().not(hood).not(':parent').addClass('hover-dim'); cy!.elements('.hover-dim').addClass('dim'); });
      cy.on('mouseout', 'node', () => { cy!.elements('.hover-dim').removeClass('dim').removeClass('hover-dim'); });
      cy.edges().forEach(edge => { if (witness.has(`${edge.data('source')}->${edge.data('target')}`) && edge.data('edgeType') === 'attack') edge.addClass('witness'); });
      fit(); cyRef.current = cy;
      let frame = 0;
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (cy && !cy.destroyed()) fit(); }); });
      observer?.observe(element);
      return () => { observer?.disconnect(); cancelAnimationFrame(frame); cy!.destroy(); cyRef.current = undefined; };
    } catch (error) {
      cy?.destroy();
      setFailure(error instanceof Error ? error.message : 'unknown rendering error');
    }
  }, [graph, blockedKey, scenario, layers, bare]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.elements().removeClass('action-hl');
    if (!highlightedAction) return;
    const {asset_id, finding_id, rule_id} = highlightedAction.params;
    if (asset_id) cy.getElementById(asset_id).addClass('action-hl');
    cy.edges().forEach(edge => {
      const reasons = (edge.data('reasons') || []) as {finding_id?: string; type?: string; rule_ids?: string[]}[];
      if ((rule_id && (edge.data('label') === rule_id || reasons.some(reason => reason.rule_ids?.includes(rule_id)))) || (finding_id && edge.data('target') === asset_id && reasons.some(reason => reason.finding_id === finding_id))
        || (highlightedAction.kind === 'vault_credentials' && edge.data('source') === asset_id && reasons.some(reason => reason.type === 'credential'))) edge.addClass('action-hl');
    });
  }, [highlightedAction, graph, layers]);

  // Persistent focus on one asset's neighbourhood (separate from transient hover).
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.elements().removeClass('dim');
    if (!focusId) return;
    const node = cy.getElementById(focusId); if (node.empty()) return;
    cy.elements().not(node.closedNeighborhood()).not(':parent').addClass('dim');
  }, [focusId, graph, layers, blockedKey]);

  const zoomBy = (factor: number) => { const cy = cyRef.current; if (cy) cy.zoom({level: Math.min(2.5, Math.max(.25, cy.zoom() * factor)), renderedPosition: {x: cy.width() / 2, y: cy.height() / 2}}); };
  const refit = () => { const cy = cyRef.current; if (cy) { cy.fit(undefined, 40); if (cy.zoom() > 1.5) { cy.zoom(1.5); cy.center(); } } };
  return <div className={`graph-shell${bare ? ' graph-bare' : ''}`}>
    {failure && <Callout tone="risk" role="alert" title="The graph could not be drawn">{failure}. The accessible table below still lists every asset and connection.</Callout>}
    <div ref={host} hidden={!!failure} data-testid="graph-canvas" className="cy-graph" role="img"
      aria-label={label ?? `Attack graph: ${graph.nodes.length} assets, ${graph.edges.length} modelled attack connections`}/>
    {!bare && <div className="graph-controls" role="group" aria-label="Graph view controls">
      <button type="button" className="btn btn-secondary" onClick={refit}>Fit</button>
      <button type="button" className="btn btn-secondary" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>＋</button>
      <button type="button" className="btn btn-secondary" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>－</button>
      <button type="button" className="btn btn-secondary" onClick={() => { cyRef.current?.reset(); refit(); }}>Reset</button>
    </div>}
  </div>;
}
