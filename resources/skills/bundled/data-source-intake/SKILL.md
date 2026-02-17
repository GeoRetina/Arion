---
id: data-source-intake
name: Data Source Intake
description: Standard intake checklist for evaluating geospatial data sources before use.
---

# Data Source Intake

## When To Use

- Use before connecting a new STAC, COG, WMS, WMTS, PMTiles, or S3 source.
- Use when a dataset is external, unfamiliar, or recently updated.
- Use when trust, provenance, or refresh cadence matters.

## Workflow

1. Capture source identity: owner, endpoint, and access method.
2. Validate spatial and temporal coverage against user goals.
3. Check schema, key fields, and data freshness.
4. Verify licensing, usage constraints, and provenance metadata.
5. Produce a readiness verdict: usable now, usable with caveats, or blocked.

## Guardrails

- Do not skip license and usage checks for external datasets.
- Do not hide unknown refresh cadence or missing provenance.
- Document blocking risks before moving to analysis.
