import {useEffect, useRef} from 'react';
import cytoscape, {Core, ElementDefinition} from 'cytoscape';
import type {Action, Graph, Scenario} from '../api/client';

type Props = {graph: Graph; scenario: Scenario; showAttack: boolean; showPermissions: boolean; showFlows: boolean; showWitness: boolean;
  highlightedAction?: Action; onSelection: (item: {type: 'node' | 'edge'; data: Record<string, unknown>}) => void};

export function GraphCanvas({graph, scenario, showAttack, showPermissions, showFlows, showWitness, highlightedAction, onSelection}: Props) {
  const host = useRef<HTMLDivElement>(null); const cyRef = useRef<Core>();
  useEffect(() => {
    if (!host.current) return;
    const zones = scenario.zones.map(zone => ({data: {id: `zone:${zone.id}`, label: zone.name}}));
    const nodes = graph.nodes.map(node => ({data: {id: node.id, parent: `zone:${node.zone}`, label: node.name, kind: node.kind, origin: node.is_origin, target: node.is_target, reachable: node.reachable}}));
    const edges: ElementDefinition[] = [];
    if (showAttack) graph.edges.forEach(edge => edges.push({data: {id: `attack:${edge.id}`, source: edge.source, target: edge.target, edgeType: 'attack', reasons: edge.reasons, label: String(edge.reasons.length)}}));
    if (showFlows) graph.flows.forEach(flow => { const required = scenario.required_flows.find(item => item.id === flow.id); if (required) edges.push({data: {id: `flow:${flow.id}`, source: required.src, target: required.dst, edgeType: 'flow', label: flow.id, permitted: flow.permitted, granting_rule_ids: flow.granting_rule_ids}}); });
    if (showPermissions) graph.rules.filter(rule => rule.status !== 'removed').forEach(ruleState => {
      const rule = scenario.rules.find(item => item.id === ruleState.id); if (!rule) return;
      const sources = graph.nodes.filter(node => rule.src === node.id || rule.src === node.zone);
      const targets = graph.nodes.filter(node => rule.dst === node.id || rule.dst === node.zone);
      for (const source of sources) for (const target of targets) if (source.id !== target.id)
        if (ruleState.status !== 'restricted' || scenario.required_flows.some(flow => flow.src === source.id && flow.dst === target.id && (rule.ports === 'any' || rule.ports.includes(flow.port))))
          edges.push({data: {id: `rule:${rule.id}:${source.id}:${target.id}`, source: source.id, target: target.id, edgeType: 'permission', label: rule.id, status: ruleState.status}});
    });
    const witness = new Set<string>();
    if (showWitness && graph.witness_path) for (let i = 0; i < graph.witness_path.length - 1; i++) witness.add(`${graph.witness_path[i]}->${graph.witness_path[i + 1]}`);
    const highlightAsset = highlightedAction?.params.asset_id;
    const cy = cytoscape({container: host.current, elements: [...zones, ...nodes, ...edges], layout: {name: 'breadthfirst', directed: true, padding: 28, spacingFactor: 1.15}, style: [
      {selector: 'node', style: {'background-color': '#233552', 'border-width': '1', 'border-color': '#4b6387', color: '#eaf0f8', label: 'data(label)', 'font-size': '11', 'text-wrap': 'wrap', 'text-max-width': '100', 'text-valign': 'center', 'text-halign': 'center', width: '42', height: '42'}},
      {selector: 'node[?origin]', style: {'background-color': '#347c73', shape: 'round-rectangle'}}, {selector: 'node[?target]', style: {'background-color': '#9b5b3c', shape: 'diamond'}}, {selector: 'node[?reachable]', style: {'border-color': '#edb35c', 'border-width': '3'}},
      {selector: 'node:selected', style: {'background-color': '#e9b65c', color: '#111c2b', 'border-color': '#fff', 'border-width': 3}}, {selector: 'node.action-highlight', style: {'background-color': '#a866b4'}},
      {selector: 'node:parent', style: {'background-color': '#142036', 'border-color': '#344a6e', label: 'data(label)', padding: '18', shape: 'roundrectangle', 'font-size': '12'}},
      {selector: 'edge', style: {'curve-style': 'bezier', 'target-arrow-shape': 'triangle', width: '2', 'line-color': '#d36b61', 'target-arrow-color': '#d36b61', label: 'data(label)', 'font-size': '9', color: '#dfe8f3', 'text-background-color': '#0d1524', 'text-background-opacity': 1}},
      {selector: 'edge[edgeType="permission"]', style: {'line-style': 'dashed', 'line-color': '#687b9d', 'target-arrow-color': '#687b9d', opacity: .65}}, {selector: 'edge[edgeType="permission"][status="restricted"]', style: {'line-color': '#c18bd5', 'target-arrow-color': '#c18bd5'}},
      {selector: 'edge.action-highlight', style: {width: 5, opacity: 1, 'line-color': '#b576d1', 'target-arrow-color': '#b576d1'}},
      {selector: 'edge[edgeType="flow"]', style: {'line-style': 'dotted', 'line-color': '#63b99b', 'target-arrow-color': '#63b99b', opacity: .9}}, {selector: 'edge[edgeType="flow"][permitted="false"]', style: {'line-color': '#ee8b7d', 'target-arrow-color': '#ee8b7d'}},
      {selector: 'edge.witness', style: {width: 5, 'line-color': '#f0c56d', 'target-arrow-color': '#f0c56d', 'z-index': 5}},
    ], wheelSensitivity: .2});
    cy.on('tap', 'node', event => onSelection({type: 'node', data: event.target.data()}));
    cy.on('tap', 'edge', event => onSelection({type: 'edge', data: event.target.data()}));
    cy.edges().forEach(edge => { if (witness.has(`${edge.data('source')}->${edge.data('target')}`)) edge.addClass('witness'); });
    if (highlightAsset) cy.nodes(`[id = "${CSS.escape(highlightAsset)}"]`).addClass('action-highlight');
    const highlightRule = highlightedAction?.params.rule_id;
    const highlightFinding = highlightedAction?.params.finding_id;
    cy.edges().forEach(edge => {
      if (highlightRule && edge.data('label') === highlightRule) edge.addClass('action-highlight');
      if (highlightFinding && (edge.data('reasons') || []).some((reason: {finding_id?: string}) => reason.finding_id === highlightFinding)) edge.addClass('action-highlight');
    });
    cy.fit(); cyRef.current = cy; return () => { cy.destroy(); cyRef.current = undefined; };
  }, [graph, scenario, showAttack, showPermissions, showFlows, showWitness, highlightedAction, onSelection]);
  return <div className="graph-shell"><div ref={host} data-testid="graph-canvas" className="cy-graph" aria-label="Interactive attack graph"/>
    <div className="graph-controls"><button type="button" onClick={() => cyRef.current?.fit()}>Fit</button><button type="button" onClick={() => cyRef.current?.zoom({level: (cyRef.current?.zoom() || 1) + .2, renderedPosition: {x: 200, y: 160}})}>Zoom in</button><button type="button" onClick={() => cyRef.current?.zoom({level: Math.max(.2, (cyRef.current?.zoom() || 1) - .2), renderedPosition: {x: 200, y: 160}})}>Zoom out</button><button type="button" onClick={() => { cyRef.current?.reset(); cyRef.current?.fit(); }}>Reset</button></div>
  </div>;
}
