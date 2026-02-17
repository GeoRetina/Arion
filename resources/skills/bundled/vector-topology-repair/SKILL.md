---
id: vector-topology-repair
name: Vector Topology Repair
description: Detect and repair common topology issues in vector datasets.
---

# Vector Topology Repair

## When To Use

- Use before overlay, dissolve, or network analysis on vector data.
- Use when polygons contain slivers, overlaps, or self-intersections.
- Use when line features require snapping and connectivity cleanup.

## Workflow

1. Run topology diagnostics and categorize issue types.
2. Repair invalid geometries with deterministic methods first.
3. Apply snapping, simplification, or dissolve rules with explicit tolerances.
4. Re-validate topology after each repair stage.
5. Produce a repair report: counts fixed, remaining issues, and manual-review cases.

## Guardrails

- Preserve source data by writing repaired outputs as new layers.
- Do not use aggressive tolerances without documenting tradeoffs.
- Escalate unresolved or ambiguous fixes instead of forcing silent edits.
