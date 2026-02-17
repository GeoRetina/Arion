---
id: raster-change-detection
name: Raster Change Detection
description: Compare baseline and current rasters to identify meaningful spatial change.
---

# Raster Change Detection

## When To Use

- Use for periodic monitoring of land cover, vegetation, water, or hazards.
- Use when baselines and new captures must be compared consistently.
- Use when thresholded change outputs are required for alerts or reporting.

## Workflow

1. Confirm both rasters share CRS, extent alignment, and compatible resolution.
2. Apply masking and nodata handling consistently across both inputs.
3. Compute change metric (difference, ratio, or index delta) with documented parameters.
4. Threshold and classify change zones with uncertainty notes.
5. Summarize area statistics and export reproducible outputs.

## Guardrails

- Do not compare rasters with unresolved alignment or nodata mismatches.
- Separate signal from noise using defensible thresholds.
- Record preprocessing choices so results can be replayed exactly.
