import type {ReactNode} from 'react';

export const Eyebrow = ({children}: {children: ReactNode}) => <span className="eyebrow">{children}</span>;

export function Chip({tone = 'neutral', children, title}: {tone?: 'neutral' | 'accent' | 'risk' | 'ok' | 'warn'; children: ReactNode; title?: string}) {
  return <span className={`chip chip-${tone}`} title={title}>{children}</span>;
}

export function Stat({value, label, tone, help, testId}: {value: ReactNode; label: string; tone?: 'risk' | 'ok' | 'warn'; help?: string; testId?: string}) {
  return <div className={`stat ${tone ? `stat-${tone}` : ''}`} title={help}><strong data-testid={testId}>{value}</strong><span>{label}</span></div>;
}

const GLYPH = {risk: '✕', ok: '✓', warn: '!', info: 'i'} as const;
export function Callout({tone, title, children, role, testId}: {tone: 'risk' | 'ok' | 'warn' | 'info'; title?: ReactNode; children?: ReactNode; role?: 'alert' | 'status'; testId?: string}) {
  return <div className={`callout callout-${tone}`} role={role} data-testid={testId}><span className="callout-glyph" aria-hidden="true">{GLYPH[tone]}</span>
    <div>{title && <strong>{title}</strong>}{children && <div className="callout-body">{children}</div>}</div></div>;
}
