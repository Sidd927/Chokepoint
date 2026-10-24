export const KIND_SHAPE: Record<string, string> = {external: 'hexagon', gateway: 'round-rectangle', workstation: 'rectangle', server: 'barrel', controller: 'diamond', plc: 'octagon'};

export function Legend({kinds, hasBlocked}: {kinds: string[]; hasBlocked: boolean}) {
  const shape = (kind: string) => {
    const s = KIND_SHAPE[kind] ?? 'ellipse';
    const common = {fill: 'none', stroke: 'currentColor', strokeWidth: 1.6};
    const path = s === 'hexagon' ? <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" {...common}/>
      : s === 'octagon' ? <polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8" {...common}/>
      : s === 'diamond' ? <polygon points="12,2 22,12 12,22 2,12" {...common}/>
      : s === 'barrel' ? <path d="M5 6c4-2 10-2 14 0v12c-4 2-10 2-14 0z" {...common}/>
      : s === 'rectangle' ? <rect x="4" y="6" width="16" height="12" {...common}/>
      : <rect x="3" y="6" width="18" height="12" rx="4" {...common}/>;
    return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">{path}</svg>;
  };
  const line = (color: string, dash: string) => <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true"><line x1="1" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dash}/><polygon points="24,1 30,5 24,9" fill={color}/></svg>;
  return <details className="legend"><summary>Legend</summary><div className="legend-grid">
    <div><span className="eyebrow">Assets (shape = kind)</span><ul>{kinds.map(kind => <li key={kind}>{shape(kind)} {kind}</li>)}</ul></div>
    <div><span className="eyebrow">Status (ring colour)</span><ul>
      <li><i className="ring ring-accent"/> Attacker origin</li><li><i className="ring ring-risk"/> Reachable by attacker</li><li><i className="ring ring-ok"/> Critical target cut off by plan</li></ul></div>
    <div><span className="eyebrow">Connections (arrow = direction)</span><ul>
      <li>{line('#f06b6b', '')} Modelled attack step</li><li>{line('#3fcf8e', '2 3')} Required flow</li><li>{line('#7f8ca6', '5 3')} Firewall permission</li>{hasBlocked && <li>{line('#f06b6b', '4 3')} Blocked by plan</li>}</ul></div>
  </div></details>;
}
