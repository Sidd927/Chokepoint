# CHOKEPOINT Design System

Status: implemented in `frontend/src/style.css` and `frontend/src/components/`. This file describes what the code does; if they disagree, fix one of them.

## 1. Research and decision

Reviewed on 2026-10-24 at getdesign.md (catalogue lists 550+ site analyses; every entry below was opened):

| Reference | What we took | What we rejected |
|---|---|---|
| **Vercel** (black/white precision, Geist) | 1px hairline borders as the structural device, tight negative letter-spacing on headings, uppercase mono eyebrows at 12px, a single accent blue reserved for links/focus, restrained semantic colours (error red, warning amber). | Its light canvas and marketing mesh-gradients; wrong register for a security console. |
| **Sentry** (dark, data-dense dashboards) | Dense-but-legible tables, dark layered surfaces with hairline borders, translucent focus ring, status communicated by small chips rather than big colour fills. | The violet/pink/lime brand palette (too playful, and several competing accents). |
| **HashiCorp / IBM Carbon** (infrastructure, enterprise) | Structured left rail + content grid, flat rectangular panels with small radii, explicit blue interactive colour, plain-language status labels. | Carbon's light-first theme; HashiCorp's marketing-site layout. |
| Microsoft Security 101 "What is a security graph" | Conceptual model for the graph: nodes are entities with properties, edges are relationships/access paths, and the value is *blast-radius and attack-path analysis*. Informs the node detail panel and the legend. | Its AI-driven / threat-intel claims: CHOKEPOINT models a synthetic network only. |
| NVIDIA | Considered for its technical-power feel. | Green-on-black identity would collide with our "verified = green" semantic. |

Decision: a **graphite/navy dark console**, Vercel's precision and typography discipline, Sentry's density, Carbon's structure, **one** electric-blue accent. Colour is spent on meaning only (risk, verified/preserved, caution); everything else is neutral.

Not done: no screenshot-level study of commercial attack-graph products (Wiz, XM Cyber, etc.); they are not accessible without sign-in. Their public documentation conventions (entities as nodes, access as directed edges, a selected-item side panel) are covered by the Microsoft reference above.

## 2. Product personality
Calm, exact, evidence-first. The interface explains *why* before *how*. It never decorates a number it cannot source. Always labelled "Synthetic model — not a live network".

## 3. Colour tokens (CSS variables in `:root`)
| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0a0e15` | App canvas |
| `--bg-1` | `#0f141d` | Rail, panels |
| `--bg-2` | `#151b27` | Raised (cards, inputs) |
| `--bg-3` | `#1c2433` | Hover / selected row |
| `--line` | `#212a3a` | Hairline border (default) |
| `--line-strong` | `#2f3b52` | Input/hover border |
| `--text` | `#e8edf5` | Primary text (≥ 14:1 on bg-1) |
| `--text-2` | `#a5b0c4` | Secondary text (≥ 7:1) |
| `--text-3` | `#7f8ca6` | Metadata (≥ 4.8:1 on bg-1) |
| `--accent` | `#4c9aff` | Interactive, focus, selection. The only brand colour. |
| `--risk` | `#f06b6b` | Reachable targets, attack paths, rejected, failed checks |
| `--ok` | `#3fcf8e` | Verified, preserved flows, blocked/unreachable after plan |
| `--warn` | `#f5b14c` | Not proven optimal, caution, unverified |

Each semantic colour has a `-soft` (14% alpha) fill for chips and callouts. Colour is never the only signal: every status also carries text and/or an icon glyph and line style.

## 4. Typography
System UI stack (`Inter`, `-apple-system`, `Segoe UI`, `sans-serif`) and system mono (`ui-monospace`, `SF Mono`, `Menlo`). No webfont download, so the offline demo is identical to the online one.
Scale (px / line-height): display 28/34 (-0.02em, 600), h2 18/26 (600), h3 14/20 (600), body 14/21, small 12/18, eyebrow 11/16 mono uppercase, +0.08em tracking. Max prose width 62ch. Digests, IDs, ports are mono.

## 5. Layout
- Grid: 232px left rail + fluid content. Content = graph stage (flex 1.5) + inspector (min 380px, max 460px).
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Breakpoints: ≥1180 full layout; 760–1179 rail collapses to a top bar, inspector goes below graph; <760 single column, graph 360px tall, nav is a horizontally scrollable tab strip.
- Radius: 6px controls, 8px panels. Elevation: none, except popovers (`0 8px 24px #0008`). Depth comes from surface steps, not shadows.

## 6. Components
- **Button**: primary = solid accent, dark text; secondary = bg-2 + line-strong; ghost = text only. 32px high (40px on touch widths). One primary per view.
- **Input/select**: bg-2, 1px line-strong, focus = 2px accent ring (offset 1px). Labels always visible.
- **Badge/chip**: 11px mono uppercase, soft fill + coloured text + 1px tint border.
- **Tabs (nav)**: rail items with left 2px accent bar when active, `aria-current="page"`.
- **Table**: hairline row dividers, sticky header, 36px rows, mono IDs.
- **Tooltip / help**: native `title` plus visible helper text; no hover-only critical info.
- **Callout**: 3px left border in semantic colour, soft fill, icon glyph.

## 7. Graph semantics
| Encoding | Meaning |
|---|---|
| Columns | Network zones, ordered by attack distance from the origin (left = where an attacker starts). Zone box = labelled container. |
| Node shape | Asset kind: external = hexagon, gateway = round-rectangle, workstation = rectangle, server = barrel, controller = diamond, plc = octagon (legend lists only kinds present). |
| Node border | accent = attacker origin; red = reachable by attacker; thick red = reachable *critical target*; green = no longer reachable after plan. |
| Red solid arrow | Modelled attack step (direction = attacker movement). Width/opacity low by default; hovering a node brightens its neighbourhood. |
| Bright red thick | Witness path: one concrete shortest attack path to a target. |
| Green dotted arrow | Required operational flow that is permitted. Red dotted if broken. |
| Grey dashed | Firewall permission (rule), optional layer. |
| Faint red dashed + "blocked" | Edge present *before* and absent *after* the plan (computed from the two real `/graph` responses). |
Selecting a node/edge opens a detail panel (asset kind, zone, services and findings, credentials, reasons for an edge). An accessible table mirrors the graph.

## 8. States
- Loading: skeleton blocks with `aria-busy`; buttons show spinner text and are disabled for the request's real duration.
- Empty: a sentence saying what is missing and the single action that fixes it.
- Error: red callout with the API's message and a Retry button where a retry is meaningful. Failures never render as success.
- Success: green callout; verification gets a large status header.
- Warning: amber for `FEASIBLE_NOT_PROVEN`, budget exhausted, stale data.
- Stale: changing the selected actions/strategy/budget clears verification and receipt immediately.

## 9. Motion
120–160ms colour/opacity transitions only. No looping animation. `prefers-reduced-motion` removes transitions and smooth scroll.

## 10. Accessibility
WCAG 2.1 AA targets: text contrast ≥ 4.5:1, focus ring on every interactive element, keyboard-operable nav/plan/verify/receipt, `aria-live` for status and busy regions, landmarks (`nav`, `main`), skip link, graph has a table alternative, targets ≥ 32px (40px on narrow screens).

## 11. Component reuse rules
One stylesheet, tokens only (no raw hex in components except the graph style map, which reads the same tokens). Shared building blocks: `Stat`, `Callout`, `Chip`, `Eyebrow`. New screens compose these before adding CSS.

## 12. Copy rules
Plain language first, technical code second (e.g. "Required flows still work" with `FLOWS_PRESERVED` as secondary text). Cost unit is always "dh" with the tooltip "decihours: effort + 2 × downtime, as defined by the scenario". Never "secure", "protected" or percentages. Use "modelled", "catalogue optimum", "independently re-checked".
