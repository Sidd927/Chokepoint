"""PDF report built from structured results only (scenario, graphs, verification, explanations).

All text that originates in a scenario is treated as untrusted: control characters are removed, text is limited to
Latin-1 (the built-in PDF fonts), truncated, and XML-escaped before it reaches ReportLab's markup parser.
"""
from __future__ import annotations
import io, unicodedata
from datetime import datetime, timezone
from xml.sax.saxutils import escape
from reportlab import rl_config
from reportlab.graphics.shapes import Drawing, Line, Rect, Circle, String, Polygon
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

rl_config.pageCompression = 0   # plain content streams: smaller risk surface, text stays inspectable by tests

INK, MUTED, LINE = colors.HexColor("#14181f"), colors.HexColor("#5b6578"), colors.HexColor("#d5dae3")
ACCENT, RISK, OK, WARN = colors.HexColor("#2f6fdc"), colors.HexColor("#c0392b"), colors.HexColor("#1f8f5f"), colors.HexColor("#b7791f")
PANEL = colors.HexColor("#f3f5f9")

def clean(value, limit=400) -> str:
    """Untrusted text -> printable Latin-1, bounded length."""
    text = unicodedata.normalize("NFC", "" if value is None else str(value))
    text = "".join(ch if (ch == "\n" or (ch.isprintable() and not unicodedata.category(ch).startswith("C"))) else " " for ch in text)
    text = text.encode("latin-1", "replace").decode("latin-1")
    return text if len(text) <= limit else text[: limit - 3] + "..."

def esc(value, limit=400) -> str:
    return escape(clean(value, limit)).replace("\n", "<br/>")

S = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=INK, spaceAfter=2),
    "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=11, leading=14, textColor=MUTED, spaceAfter=8),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=INK, spaceBefore=6, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=INK, spaceBefore=8, spaceAfter=3),
    "p": ParagraphStyle("p", fontName="Helvetica", fontSize=9.2, leading=12.5, textColor=INK, spaceAfter=4, wordWrap="CJK"),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10.5, textColor=MUTED, wordWrap="CJK"),
    "mono": ParagraphStyle("mono", fontName="Courier", fontSize=8, leading=10, textColor=INK, wordWrap="CJK"),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9, leading=12, textColor=INK, leftIndent=11, bulletIndent=0, spaceAfter=2, wordWrap="CJK"),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.6, leading=11, textColor=INK, wordWrap="CJK"),
    "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8.6, leading=11, textColor=INK, wordWrap="CJK"),
    "tile_v": ParagraphStyle("tile_v", fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=INK),
    "tile_l": ParagraphStyle("tile_l", fontName="Helvetica", fontSize=7.6, leading=9.5, textColor=MUTED, wordWrap="CJK"),
}
P = lambda text, style="p": Paragraph(text, S[style])
def bullets(items, style="bullet"): return [Paragraph(esc(i, 700), S[style], bulletText="•") for i in items]

class NumberedCanvas(pdfcanvas.Canvas):
    def __init__(self, *a, **kw): super().__init__(*a, **kw); self._saved = []
    def showPage(self): self._saved.append(dict(self.__dict__)); self._startPage()
    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state); self._footer(total); super().showPage()
        super().save()
    def _footer(self, total):
        self.setFont("Helvetica", 7.5); self.setFillColor(MUTED); self.setStrokeColor(LINE)
        self.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
        self.drawString(18 * mm, 9.5 * mm, "CHOKEPOINT - report on a modelled scenario, not confirmed live infrastructure")
        self.drawRightString(A4[0] - 18 * mm, 9.5 * mm, f"Page {self._pageNumber} of {total}")

def _tile(value, label, tone=INK):
    st = ParagraphStyle("tv", parent=S["tile_v"], textColor=tone)
    return [Paragraph(esc(value, 40), st), Paragraph(esc(label, 80), S["tile_l"])]

def _table(rows, widths, header=True, zebra=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]
    if header: style += [("BACKGROUND", (0, 0), (-1, 0), PANEL)]
    t.setStyle(TableStyle(style)); return t

def _graph_drawing(scn, g, title, width=174 * mm, height=112 * mm):
    """Static rendering of the backend's own graph payload: columns are zones ordered by attack distance."""
    d = Drawing(width, height); nodes, edges = g["nodes"], g["edges"]
    if not nodes: return d
    depth = {o: 0 for o in scn.origins}; queue = list(scn.origins)
    while queue:
        cur = queue.pop(0)
        for e in edges:
            if e["source"] == cur and e["target"] not in depth: depth[e["target"]] = depth[cur] + 1; queue.append(e["target"])
    zone_ids = [z.id for z in scn.zones]
    zones = sorted(zone_ids, key=lambda z: (min([depth.get(n["id"], 99) for n in nodes if n["zone"] == z] or [99]), zone_ids.index(z)))
    zones = [z for z in zones if any(n["zone"] == z for n in nodes)]
    d.add(String(0, height - 9, clean(title, 80), fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    top, bottom, left = height - 24, 8, 4; colw = (width - left * 2) / max(1, len(zones)); pos = {}
    for ci, z in enumerate(zones):
        members = sorted([n for n in nodes if n["zone"] == z], key=lambda n: (depth.get(n["id"], 99), n["name"]))
        x0 = left + ci * colw
        d.add(Rect(x0 + 1, bottom, colw - 3, top - bottom, fillColor=colors.HexColor("#f7f8fb"), strokeColor=LINE, strokeWidth=0.4))
        zn = next((zz.name for zz in scn.zones if zz.id == z), z)
        d.add(String(x0 + colw / 2, top - 8, clean(zn, 18), fontName="Helvetica-Bold", fontSize=5.6, fillColor=MUTED, textAnchor="middle"))
        step = (top - bottom - 22) / max(1, len(members)) if members else 0
        for ri, n in enumerate(members): pos[n["id"]] = (x0 + colw / 2, top - 20 - step * (ri + 0.5))
    def arrow(p, q, col, w, dash=None):
        (x1, y1), (x2, y2) = p, q
        dx, dy = x2 - x1, y2 - y1; dist = max((dx * dx + dy * dy) ** .5, 1e-6); ux, uy = dx / dist, dy / dist
        x2, y2 = x2 - ux * 5.5, y2 - uy * 5.5
        ln = Line(x1, y1, x2, y2, strokeColor=col, strokeWidth=w);
        if dash: ln.strokeDashArray = dash
        d.add(ln)
        d.add(Polygon([x2, y2, x2 - ux * 3.2 - uy * 1.6, y2 - uy * 3.2 + ux * 1.6, x2 - ux * 3.2 + uy * 1.6, y2 - uy * 3.2 - ux * 1.6], fillColor=col, strokeColor=col, strokeWidth=0.1))
    witness = set(zip(g["witness_path"] or [], (g["witness_path"] or [])[1:]))
    for e in edges:
        if e["source"] in pos and e["target"] in pos:
            hot = (e["source"], e["target"]) in witness
            arrow(pos[e["source"]], pos[e["target"]], colors.Color(.75, .22, .17, 1 if hot else .28), 1.3 if hot else 0.45)
    for f in g["flows"]:
        fl = next((x for x in scn.required_flows if x.id == f["id"]), None)
        if fl and fl.src in pos and fl.dst in pos:
            arrow(pos[fl.src], pos[fl.dst], OK if f["permitted"] else RISK, 0.9, dash=[2, 1.5])
    for n in nodes:
        if n["id"] not in pos: continue
        x, y = pos[n["id"]]
        fill, stroke, sw = colors.HexColor("#e7eaf1"), colors.HexColor("#8a93a6"), 0.6
        if n["is_target"]: fill, stroke, sw = (colors.HexColor("#f6d5d1"), RISK, 1.4) if n["reachable"] else (colors.HexColor("#cdeedd"), OK, 1.4)
        elif n["reachable"]: stroke, sw = RISK, 0.9
        if n["is_origin"]: stroke, sw = ACCENT, 1.4
        d.add(Circle(x, y, 4.2, fillColor=fill, strokeColor=stroke, strokeWidth=sw))
        d.add(String(x, y - 10, clean(n["name"], 15), fontName="Helvetica", fontSize=5.2, fillColor=INK, textAnchor="middle"))
    return d

def _legend():
    return P("<b>Legend.</b> Circles are assets (blue ring = attacker origin, red ring = reachable by an attacker, red fill = reachable critical target, green fill = critical target cut off). "
             "Solid red arrows are modelled attack steps (the bold one is an example route); green dashed arrows are permitted required flows, red dashed arrows are broken ones. "
             "Arrows are modelled reachability, not confirmed exploits.", "small")

def build_report(scn, result: dict, before: dict, after: dict | None, verification: dict | None, explanations: list[dict], outcome: list[str], generated_at: datetime | None = None) -> bytes:
    gen = (generated_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d %H:%M UTC")
    status, method, proof = result["solver_status"], result.get("method"), result.get("proof") or {}
    verdict = verification["verdict"] if verification else None
    receipt = verification.get("receipt") if verification else None
    has_plan = after is not None
    tgt_b, tgt_a = len(before["reachable_targets"]), (len(after["reachable_targets"]) if after else None)
    flows_ok = sum(1 for f in after["flows"] if f["permitted"]) if after else None
    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
                          title=clean(f"CHOKEPOINT report - {scn.name}", 120), author="CHOKEPOINT", subject="Modelled remediation plan", creator="CHOKEPOINT")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)])])
    W = doc.width; flow = []

    # ---- Page 1: executive summary
    flow += [P("CHOKEPOINT", "small"), P("Remediation plan report", "title"), P(f"{esc(scn.name, 120)} <font color='#5b6578'>({esc(scn.id, 64)})</font>", "sub")]
    vtone = OK if verdict == "VERIFIED" else (RISK if verdict else MUTED)
    tiles = [[_tile(f"{result['total_cost_dh']} dh" if has_plan else "-", "total planning cost (decihours)"), _tile(result["action_count"] if has_plan else "-", "selected actions"),
              _tile(f"{tgt_b} -> {tgt_a}" if has_plan else f"{tgt_b}", "critical targets reachable (before -> after)", RISK if (tgt_a or 0) else OK),
              _tile(f"{flows_ok} of {len(after['flows'])}" if has_plan else "-", "required flows still permitted", OK if has_plan and flows_ok == len(after["flows"]) else RISK)],
             [_tile(f"{len(before['edges'])} -> {len(after['edges'])}" if has_plan else f"{len(before['edges'])}", "modelled attack connections"), _tile(len(before["edges"]) - len(after["edges"]) if has_plan else "-", "connections removed"),
              _tile(verdict or "NOT RUN", "independent verifier verdict", vtone), _tile(status, "solver status", OK if status == "OPTIMAL" else WARN)]]
    grid = Table([[c for c in row] for row in tiles], colWidths=[W / 4] * 4)
    grid.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 8)]))
    flow += [grid, Spacer(1, 8)]
    meta = [[P("Generated", "cellb"), P(esc(gen), "cell"), P("Strategy / method", "cellb"), P(esc(f"{method or 'n/a'}"), "cell")],
            [P("Scenario type", "cellb"), P("synthetic (declared by the scenario)" if scn.synthetic else "user-supplied; not declared synthetic", "cell"), P("Scenario fingerprint", "cellb"), P(esc((receipt or {}).get("scenario_fingerprint", "n/a"), 80), "mono")]]
    flow += [_table(meta, [W * .16, W * .30, W * .20, W * .34], header=False), Spacer(1, 8), P("Outcome", "h")]
    flow += bullets(outcome[:6])
    scope = Table([[P("<b>Scope.</b> This report describes a <b>modelled</b> scenario. Findings, rules and flows are inputs to the model; nothing was scanned, tested or changed on any real system. "
                      "Planning costs are model units (dh = effort + 2 x downtime), not currency. Verification means the model's constraints hold, not that a real network is secure.", "p")]], colWidths=[W])
    scope.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, WARN), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff7e6")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    flow += [Spacer(1, 6), scope, PageBreak()]

    # ---- Page 2: network comparison
    flow += [P("Network comparison", "h")]
    for title, g in (("Before: network as defined by the scenario", before), ("After: network with the selected actions applied", after)):
        if g is None:
            flow += [P(esc(title), "h2"), P("No plan was produced, so there is no remediated network to draw.", "p")]; continue
        try: flow += [_graph_drawing(scn, g, title)]
        except Exception: flow += [P(esc(title), "h2"), P("The graph could not be rendered for this report. The figures elsewhere in the report are unaffected.", "p")]
        flow += [Spacer(1, 6)]
    flow += [_legend(), PageBreak()]

    # ---- Page 3: actions
    flow += [P("Selected remediation actions", "h"),
             P("<b>Facts</b> are computed from the scenario and graph engine. <b>Inference</b> is reasoning the reader should treat as unproven. <b>Review</b> items are suggestions for a human before any real change; they are not model output.", "small"), Spacer(1, 4)]
    if not explanations: flow += [P("No actions were selected.", "p")]
    for ex in explanations:
        tg = ex["target"]; where = ", ".join(x for x in [tg.get("asset_name") and f"asset {tg['asset_name']}", tg.get("finding_id") and f"finding {tg['finding_id']}", tg.get("rule_id") and f"rule {tg['rule_id']}"] if x) or "n/a"
        block = [P(f"{esc(ex['id'], 64)} - {esc(ex['description'], 160)}", "h2"),
                 _table([[P("Type", "cellb"), P(esc(ex["kind"]), "cell"), P("Cost", "cellb"), P(f"{ex['cost_dh']} dh (effort {ex['effort_dh']} + 2 x downtime {ex['downtime_dh']})", "cell")],
                         [P("Target", "cellb"), P(esc(where, 200), "cell"), P("Mandatory", "cellb"), P("yes (scenario policy)" if ex["mandatory"] else "no", "cell")]], [W * .1, W * .42, W * .13, W * .35], header=False),
                 P("Facts", "small")] + bullets(ex["facts"])
        if ex["inference"]: block += [P("Inference (unproven)", "small")] + bullets(ex["inference"])
        block += [P("Review before real implementation (human)", "small")] + bullets(ex["review"])
        flow += [KeepTogether(block), Spacer(1, 4)]
    flow += [PageBreak()]

    # ---- Page 4: verification and evidence
    flow += [P("Verification and evidence", "h")]
    if verification is None:
        flow += [P("No plan was produced, so the verifier was not run.", "p")]
    else:
        flow += [P(f"Verification verdict: <font color='{'#1f8f5f' if verdict == 'VERIFIED' else '#c0392b'}'><b>{esc(verdict, 20)}</b></font>", "p")]
        rows = [[P("Check", "cellb"), P("Result", "cellb"), P("Detail", "cellb")]]
        for c in verification["checks"]: rows.append([P(esc(c["code"], 40), "mono"), P("PASS" if c["passed"] else "FAIL", "cellb"), P(esc(c["detail"], 160), "cell")])
        flow += [_table(rows, [W * .34, W * .1, W * .56]), Spacer(1, 6)]
        if verification["violations"]: flow += [P("Violations", "h2")] + bullets([f"{v['code']}: {v['detail']}" for v in verification["violations"]])
    prow = [[P("Solver status", "cellb"), P(esc(status), "cell")], [P("Method", "cellb"), P(esc(method or "n/a"), "cell")]]
    for k in ("exhaustive", "nodes_evaluated", "max_nodes", "budget_exhausted"):
        if k in proof: prow.append([P(esc(k), "cellb"), P(esc(proof[k]), "cell")])
    flow += [P("Solver proof metadata", "h2"), _table(prow, [W * .3, W * .7], header=False)]
    fp = [[P("Scenario fingerprint", "cellb"), P(esc((receipt or {}).get("scenario_fingerprint", "n/a"), 90), "mono")], [P("Receipt fingerprint (SHA-256)", "cellb"), P(esc((receipt or {}).get("receipt_fingerprint", "n/a"), 90), "mono")]]
    flow += [P("Fingerprints", "h2"), _table(fp, [W * .3, W * .7], header=False), Spacer(1, 6), P("What this establishes, and what it does not", "h2")]
    flow += bullets(["The independent verifier recomputed reachability, required-flow permissions and costs from the raw scenario and compared them with the plan.",
                     "A VERIFIED verdict means every check above passed inside the model. It does not prove the plan is the cheapest (see solver status) and does not prove any real network is secure.",
                     "The receipt fingerprint is a SHA-256 hash of the canonical receipt. It detects changes to the record; it is not a digital signature and does not show who produced it.",
                     "Imported or edited scenarios are only as accurate as their author's data. Use authorized data and confirm every action with the responsible system owner."])
    if result.get("limitations"): flow += [P("Solver limitations", "h2")] + bullets(result["limitations"])
    doc.build(flow, canvasmaker=NumberedCanvas)
    return buf.getvalue()
