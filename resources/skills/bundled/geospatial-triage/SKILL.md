---
id: geospatial-triage
name: Geospatial Triage
description: Rapidly scope a geospatial request, validate data assumptions, and propose an execution plan.
---

# Geospatial Triage

## When To Use

- Use when a request is open-ended or underspecified.
- Use before expensive tool chains or long-running analyses.
- Use when data provenance or coordinate reference details are unclear.

## Workflow

1. Restate the user objective in one sentence.
2. Identify required datasets, spatial extent, temporal window, and output format.
3. List unknowns that block reliable execution.
4. Propose a minimal first-pass plan with validation checkpoints.
5. Execute only after assumptions are confirmed or explicitly accepted.

## Guardrails

- Do not assume CRS, resolution, or units without checking metadata.
- Prefer reversible and auditable operations.
- Surface uncertainty clearly before generating conclusions.
