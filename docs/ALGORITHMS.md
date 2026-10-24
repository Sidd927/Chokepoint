# Algorithms

Rules are allow-only and match an asset selector by literal asset id or zone id. A restricted rule grants only required-flow triples it granted in the unmodified scenario. A graph edge contains independent exploit and credential reasons; it remains until every reason is removed.

Remediation effects are removals only and commute. Therefore adding actions can only remove grants, reasons, edges, and reachable nodes. Required-flow violations and attack-freeness are monotone: a broken flow stays broken in supersets, while an attack-free state stays attack-free.

Witnesses use multi-source BFS with sorted origins and neighbours. Exact search branches on actions capable of neutralising a reason on the witness path. P1 drops flow-broken states; P2 drops states with no candidates; P3 drops states over the cost cap; P4 uses a strict `(lower-bound cost, current count+1)` comparison. Strictness matters because equal cost/count candidates can still win the ID tie-break. The search budget counts evaluated sets, not wall time. Complexity is exponential in the action catalogue and each state rebuilds a small graph.

The greedy planner maximises integer cross-multiplied `reason_gain/(cost+1)`, breaking ties by cost then id. Greedy and budget fallback results never claim optimality.
