# CHOKEPOINT Design System

Status: implemented in `frontend/src/app.css` (tokens, workspace), `frontend/src/landing.css` (landing) and `frontend/src/components/`. If this file and the code disagree, fix one of them.

## 1. Research (2026-10-24)

Inspected in a browser; nothing below is from memory.

| Reference | What was read | What we took | What we rejected |
|---|---|---|---|
| getdesign.md catalogue (550+ entries) | Entries for Vercel, Sentry, Linear, HashiCorp, IBM, NVIDIA. Full colour/type/principle text of Vercel, Sentry and Linear. | The idea of a system defined by tokens and reasons, not mockups. | HashiCorp, IBM, NVIDIA: only the one-line summary was read; used for the "enterprise-clean, structured" register, not copied. |
| Vercel | Hairline 1px borders as structure; tight negative tracking on display type; mono only for technical tokens; one blue reserved for links and focus. | Hairlines instead of boxes; display tracking; restraint with colour. | Its light canvas and mesh gradients. |
| Sentry | Dark data-dense dashboards; status via small marks, not big fills. | Density with clear hierarchy; verdicts carried by text + glyph. | Violet/pink/lime brand palette (several competing accents). |
| Linear | Dark canvas, one lavender accent, **marketing built from real product UI, not decoration**; display type tightly tracked; mono only inside product. | Hero = the real product graph; a single accent; negative tracking. | Its custom type, pure-black canvas. |
| Wiz (official site) | Narrative: "traditional tools work in silos -> one security graph provides context". Graph as the central idea. | Frame the problem first, then make the graph the hero. | Its form-heavy hero, Fortune-100 claims, AI-era positioning (we cannot support such claims). |
| Sentry.io / Linear.app home pages | Visual storytelling through sticky product captures. | Sticky stage + scrolling steps. | Autoplay video, hijacked scroll. |
| Microsoft "What is a security graph" | Nodes = entities with properties; edges = relationships/access paths; value = blast radius and attack paths. | Node detail panel, legend, "route" language. | AI/threat-intel claims. |

Not done: commercial attack-graph products (XM Cyber, etc.) sit behind sign-in; no product UI of that kind was inspected. A limitation, not a claim.

## 2. Direction: "evidence dossier"
A calm dark console with an **editorial serif for statements and results** and a quiet sans for interface. The serif (system `New York`/`ui-serif`, Georgia fallback, no download) is the one distinctive choice: headlines read like findings. Colour is spent only on meaning. The graph is the hero on every screen.

## 3. Tokens (`:root` in `app.css`)
| Token | Value | Meaning |
|---|---|---|
| `--bg-0 / 1 / 2 / 3` | `#0b0d12 / #11141b / #171b24 / #1e2330` | canvas / panel / raised / hover |
| `--line`, `--line-strong` | `#232938`, `#333c50` | hairline, input border |
| `--text`, `--text-2`, `--text-3` | `#eceae5`, `#a9b1c2`, `#8590a6` | warm off-white; contrast on bg-1 15.7 / 8.4 / 5.5 (>=4.5 on every surface) |
| `--accent` | `#6aa6ff` | interactive, focus, "optimizer" colour on the landing |
| `--risk` | `#f2706b` | reachable targets, attack steps, rejection, broken flows |
| `--ok` | `#47d391` | cut off, preserved flows, verified, "verifier" colour on the landing |
| `--warn` | `#f5b14c` | not proven optimal, required-action tag, synthetic notice |
Status is never colour alone: always text and/or a glyph (check, cross, arrow) and line style.

## 4. Typography
Display (serif): hero 46-92px / 0.98 / -0.035em; section 32-56px; headline in panels 26/32; large result numerals 52px. UI (sans) 14/21; small 12/18. Mono (system) only for IDs, digests, ports, solver status. Prose max 46-62ch. No decorative uppercase labels except graph zone captions and two tiny meta labels.

## 5. Layout
- **Landing** (`/`): sticky nav (brand, 3 anchors, health, "Open the workspace"), hero 5/7 split, sticky-stage story 5/7, how-it-works, scenario list, evidence, final CTA, footer. Full-bleed sections divided by hairlines; no card grids.
- **Workspace** (`/scenarios/:id`): 56px top bar (brand, scenario select, five-step navigator, health) + graph stage (fluid) + 410px result panel. Graph height `clamp(460px, 100vh-220px, 800px)`.
- Breakpoints: >=1180 two columns; 760-1179 panel under the graph, steps scroll horizontally; <760 single column, 40px controls, graph 400px, detail card becomes inline.
- Radius 6px (controls) / 8px (graph frame); no shadows except the floating graph detail card.

## 6. Information hierarchy (workspace)
Each step opens with **one serif sentence stating the result**, then one primary action, then collapsed sections (`Disclosure`) with a one-line summary. Never more than one primary button in the panel.
| Step | Headline | Disclosed on demand |
|---|---|---|
| Inspect | "3 of 3 critical targets can be reached" + one modelled route | required flows, action catalogue, findings, assets |
| Plan | "Optimal plan: 105 dh across 5 actions" or "Feasible plan ..., not proven cheapest" | search settings, limitations, action detail rows |
| Verify | "VERIFIED. Every check passed." / "REJECTED. N checks failed." with reasons first | all checks, action picker, claimed cost |
| Compare | "All 3 critical targets are cut off" + before -> after numerals | targets, flows, removed connections |
| Receipt | "Verified plan, sealed with a SHA-256 digest" + digest block | scenario digest, verifier, full JSON |
Empty states say what the screen is for, show only real baseline facts (e.g. "Today, 3 of 3 targets are reachable"), and offer the one action that fills it.

## 7. Graph semantics
Zones are columns ordered by attack distance (attacker on the left); spacing grows with the canvas so small scenarios fill the stage; on very narrow canvases columns tighten. Shape = asset kind (legend lists present kinds). Ring: blue origin, red reachable, thick red reachable critical target, green critical target cut off. Red arrow = modelled attack step (bright = example route); green dotted = permitted required flow, red dashed = broken flow; grey dashed = firewall rule; faint dashed with a tee = blocked by the plan (computed from the two real `/graph` responses). Hover focuses a neighbourhood; "Focus on this asset" makes it persistent. A table mirrors the graph for assistive tech.

## 8. Landing narrative (all numbers come from the API)
One scenario (prefers `canonical_city`) is loaded via `/scenarios/{id}`, `/graph`, `/plan` and `/graph` again; a "careless fix" is found by asking `/graph` about each non-mandatory `remove_rule` action until one breaks a required flow. Steps: (1) required flows, (2) attack routes, (3) the quick fix that breaks a flow, (4) the optimal plan with blocked edges, (5) the verifier's result and digest. The hero shows the same data with a Before / After toggle. If the API is unreachable the page says so; nothing is substituted. Landing graphs are read-only (`bare`): no wheel, drag or tap handling, so they never capture scroll or touch.

## 9. Motion
Reveal on enter (opacity + 14px, 0.5s) via IntersectionObserver; story step opacity and a 0.35s stage fade; a CSS scroll-timeline progress line where supported; smooth anchor scrolling. Never: scroll hijacking, snapping, autoplay, content hidden behind an animation (reveal items are visible with reduced motion or without IntersectionObserver). `prefers-reduced-motion` disables all transitions, animation and smooth scrolling.

## 10. Accessibility (tested vs. not)
Tested: contrast ratios computed for all text/surface pairs; keyboard-reachable steps, disclosures, graph controls; `aria-current` on steps, `aria-pressed` on toggles, `role=status`/`alert` for health and errors, skip links, graph `role=img` with label plus an accessible table; no horizontal overflow at 1440/768/390 (e2e). Not tested: screen-reader walkthrough, automated axe audit, Safari/Firefox.

## 11. Reuse rules
Tokens only; shared pieces are `Disclosure`, `Callout`, `Legend`, `GraphCanvas` (full and `bare`), `Shell`. Cytoscape cannot read CSS variables, so `GraphCanvas.tsx` repeats the token hex values in one constant (`C`).

## 12. Copy rules
Plain language first, codes second. Cost unit is always `dh` (decihours: effort + 2 x downtime), never currency. Say "modelled", "synthetic", "proven" only when true. Never "secure", "protected", percentages, or AI claims.
