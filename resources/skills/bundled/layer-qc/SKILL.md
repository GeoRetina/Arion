---
id: layer-qc
name: Layer QC
description: Run quality checks on vector or raster layers before downstream workflows.
---

# Layer QC

## When To Use

- Use after ingestion and before modeling or map publication.
- Use when layers are assembled from multiple teams or ETL jobs.
- Use when analysis quality is sensitive to geometry and attribute integrity.

## Workflow

1. Verify geometry validity and detect null or empty features.
2. Check required fields, types, and missing-value rates.
3. Validate extents, resolution, and expected feature counts.
4. Detect duplicates, outliers, and inconsistent category values.
5. Emit a pass/fail summary with remediation actions.

## Guardrails

- Do not continue silently with invalid geometry on critical paths.
- Flag data drift when schema or counts differ from expected baselines.
- Keep QC outputs machine-readable for replay and automation.
