import {useEffect, useMemo, useRef, useState} from 'react';
import cytoscape from 'cytoscape';
import type {Core, ElementDefinition} from 'cytoscape';
import type {Action, Graph, Scenario} from '../api/client';
import {Callout} from './ui';
import {KIND_SHAPE} from './Legend';

export type GraphSelection = {type: 'node' | 'edge'; data: Record<string, unknown>};
export type Layers = {attack: boolean; permissions: boolean; flows: boolean; witness: boolean};

// These mirror the tokens in DESIGN.md / style.css (Cytoscape cannot read CSS variables).
const C = {bg1: '#0f141d', bg2: '#151b27', bg3: '#1c2433', line: '#2f3b52', text: '#e8edf5', text2: '#a5b0c4', accent: '#4c9aff', risk: '#f06b6b', ok: '#3fcf8e'};
const COL_W = 144; const ROW_H = 84;

/** Zones become columns ordered by attack distance from the origins; positions come only from backend graph data. */
export function computeLayout(scenario: Scenario, source: Graph) {
  const depth = new Map<string, number>(); const queue = [...scenario.origins];
  scenario.origins.forEach(id => depth.set(id, 0));
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of source.edges) if (edge.source === current && !depth.has(edge.target)) { depth.set(edge.target, depth.get(current)! + 1); queue.push(edge.target); }
  }
  const far = 99;
  const zoneDepth = (zone: string) => Math.min(far, ...source.nodes.filter(node => node.zone === zone).map(node => depth.get(node.id) ?? far));
  const zones = scenario.zones.map((zone, order) => ({zone, order, depth: zoneDepth(zone.id)})).sort((a, b) => a.depth - b.depth || a.order - b.order);
  const positions = new Map<string, {x: number; y: number}>();
  zones.forEach(({zone}, column) => {
    const members = source.nodes.filter(node => node.zone === zone.id).sort((a, b) => (depth.get(a.id) ?? far) - (depth.get(b.id) ?? far) || a.name.localeCompare(b.name));
    members.forEach((node, row) => positions.set(node.id, {x: column * COL_W, y: (row - (members.length - 1) / 2) * ROW_H}));
  });
  return {positions, zoneOrder: zones.map(item => item.zone.id)};
}

type Props = {graph: Graph; baseline?: Graph; scenario: Scenario; layers: Layers; highlightedAction?: Action; onSelection: (item: GraphSelection) => void};

export function GraphCanvas({graph, baseline, scenario, layers, highlightedAction, onSelection}: Props) {
  const host = useRef<HTMLDivElement>(null); const cyRef = useRef<Core>();
  const selectRef = useRef(onSelection); selectRef.current = onSelection;
  const [failure, setFailure] = useState('');
  const layoutSource = baseline ?? graph;
  const layout = useMemo(() => computeLayout(scenario, layoutSource), [scenario, layoutSource]);
  const blocked = useMemo(() => {
    if (!baseline || baseline === graph) return [];
    const present = new Set(graph.edges.map(edge => edge.id));
    return baseline.edges.filter(edge => !present.has(edge.id));
  }, [graph, baseline]);

  useEffect(() => {
    if (!host.current) return;
    setFailure('');
    try {
      const zones = layout.zoneOrder.map(id => ({data: {id: `zone:${id}`, label: scenario.zones.find(zone => zone.id === id)?.name ?? id}}));
      const nodes = graph.nodes.map(node => ({data: {id: node.id, parent: `zone:${node.zone}`, label: node.name, kind: node.kind, shape: KIND_SHAPE[node.kind] ?? 'ellipse',
        origin: node.is_origin, target: node.is_target, reachable: node.reachable, cleared: node.is_target && !node.reachable},
        position: layout.positions.get(node.id) ?? {x: 0, y: 0}}));
      const edges: ElementDefinition[] = [];
      if (layers.attack) graph.edges.forEach(edge => edges.push({data: {id: `attack:${edge.id}`, source: edge.source, target: edge.target, edgeType: 'attack', reasons: edge.reasons}}));
      if (layers.attack) blocked.forEach(edge => edges.push({data: {id: `blocked:${edge.id}`, source: edge.source, target: edge.target, edgeType: 'blocked', reasons: edge.reasons, label: 'blocked'}}));
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

      const cy = cytoscape({container: host.current, elements: [...zones, ...nodes, ...edges], layout: {name: 'preset', padding: 36}, minZoom: .25, maxZoom: 2.5, wheelSensitivity: .25, style: [
        {selector: 'node', style: {shape: 'data(shape)' as never, 'background-color': C.bg3, 'border-width': 1.5, 'border-color': C.line, width: 38, height: 38, label: 'data(label)', color: C.text, 'font-size': 12, 'font-weight': 500,
          'text-wrap': 'wrap', 'text-max-width': '80px', 'text-valign': 'bottom', 'text-margin-y': 6, 'text-background-color': C.bg1, 'text-background-opacity': .85, 'text-background-padding': '2px'}},
        {selector: 'node[?reachable]', style: {'border-color': C.risk, 'border-width': 2.5}},
        {selector: 'node[?origin]', style: {'border-color': C.accent, 'border-width': 3, 'background-color': '#17324f'}},
        {selector: 'node[?target][?reachable]', style: {'border-color': C.risk, 'border-width': 4, 'background-color': '#3a1d24', width: 46, height: 46}},
        {selector: 'node[?cleared]', style: {'border-color': C.ok, 'border-width': 4, 'background-color': '#14352a', width: 46, height: 46}},
        {selector: 'node:parent', style: {shape: 'round-rectangle', 'background-color': C.bg2, 'background-opacity': .55, 'border-color': C.line, 'border-width': 1, padding: '20px', label: 'data(label)',
          'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -4, color: C.text2, 'font-size': 11, 'font-weight': 600, 'text-background-opacity': 0, 'text-transform': 'uppercase'}},
        {selector: 'edge', style: {'curve-style': 'bezier', 'control-point-step-size': 36, 'target-arrow-shape': 'triangle', 'arrow-scale': .9, width: 1.4}},
        {selector: 'edge[edgeType="attack"]', style: {'line-color': C.risk, 'target-arrow-color': C.risk, opacity: .4}},
        {selector: 'edge[edgeType="blocked"]', style: {'line-color': C.risk, 'target-arrow-color': C.risk, 'line-style': 'dashed', opacity: .22, 'target-arrow-shape': 'tee'}},
        {selector: 'edge[edgeType="permission"]', style: {'line-style': 'dashed', 'line-color': '#7f8ca6', 'target-arrow-color': '#7f8ca6', opacity: .6, label: 'data(label)', 'font-size': 9, color: C.text2, 'text-background-color': C.bg1, 'text-background-opacity': 1}},
        {selector: 'edge[edgeType="permission"][status="restricted"]', style: {'line-color': C.accent, 'target-arrow-color': C.accent}},
        {selector: 'edge[edgeType="flow"]', style: {'line-style': 'dotted', width: 2.4, 'line-color': C.ok, 'target-arrow-color': C.ok, opacity: .95}},
        {selector: 'edge[edgeType="flow"][permitted="false"]', style: {'line-color': C.risk, 'target-arrow-color': C.risk}},
        {selector: 'edge.witness', style: {width: 3.6, opacity: 1, 'z-index': 9}},
        {selector: 'node.action-hl', style: {'border-color': C.accent, 'border-width': 5, 'underlay-color': C.accent, 'underlay-opacity': .25, 'underlay-padding': 8}},
        {selector: 'edge.action-hl', style: {width: 4, opacity: 1, 'line-color': C.accent, 'target-arrow-color': C.accent, 'z-index': 8}},
        {selector: '.faded', style: {opacity: .08}},
        {selector: 'node:selected', style: {'underlay-color': C.text, 'underlay-opacity': .18, 'underlay-padding': 8}},
        {selector: 'edge:selected', style: {width: 4, opacity: 1}},
      ]});
      cy.on('tap', 'node', event => { if (!event.target.isParent()) selectRef.current({type: 'node', data: event.target.data()}); });
      cy.on('tap', 'edge', event => selectRef.current({type: 'edge', data: event.target.data()}));
      cy.on('mouseover', 'node', event => { if (event.target.isParent()) return; const hood = event.target.closedNeighborhood(); cy.elements().not(hood).not(':parent').addClass('faded'); });
      cy.on('mouseout', 'node', () => cy.elements().removeClass('faded'));
      cy.edges().forEach(edge => { if (witness.has(`${edge.data('source')}->${edge.data('target')}`) && edge.data('edgeType') === 'attack') edge.addClass('witness'); });
      cy.fit(undefined, 36); cyRef.current = cy;
      return () => { cy.destroy(); cyRef.current = undefined; };
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'unknown rendering error');
    }
  }, [graph, blocked, scenario, layers, layout]);

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

  const zoomBy = (factor: number) => { const cy = cyRef.current; if (cy) cy.zoom({level: Math.min(2.5, Math.max(.25, cy.zoom() * factor)), renderedPosition: {x: cy.width() / 2, y: cy.height() / 2}}); };
  return <div className="graph-shell">
    {failure && <Callout tone="risk" role="alert" title="The graph could not be drawn">{failure}. The accessible table below still lists every asset and connection.</Callout>}
    <div ref={host} hidden={!!failure} data-testid="graph-canvas" className="cy-graph" role="img" aria-label={`Attack graph: ${graph.nodes.length} assets, ${graph.edges.length} modelled attack connections`}/>
    <div className="graph-controls" role="group" aria-label="Graph view controls">
      <button type="button" className="btn btn-secondary" onClick={() => cyRef.current?.fit(undefined, 36)}>Fit</button>
      <button type="button" className="btn btn-secondary" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>＋</button>
      <button type="button" className="btn btn-secondary" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>－</button>
      <button type="button" className="btn btn-secondary" onClick={() => { cyRef.current?.reset(); cyRef.current?.fit(undefined, 36); }}>Reset</button>
    </div>
  </div>;
}
