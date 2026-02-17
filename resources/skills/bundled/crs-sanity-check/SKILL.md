---
id: crs-sanity-check
name: CRS Sanity Check
description: Validate coordinate systems, units, and reprojection assumptions before analysis.
---

# CRS Sanity Check

## When To Use

- Use before any overlay, buffer, distance, or area operation.
- Use when data comes from multiple providers or mixed formats.
- Use when coordinate metadata is missing or contradictory.

## Workflow

1. Inspect declared CRS for every input layer.
2. Confirm axis order and unit assumptions.
3. Identify a shared analysis CRS and justify it.
4. Reproject inputs only once to the selected CRS.
5. Validate extents and spot-check coordinates after reprojection.

## Guardrails

- Do not compute distance or area in geographic degrees unless explicitly intended.
- Do not proceed when CRS metadata is absent without an explicit fallback strategy.
- Record original CRS and transformation choices in the final output notes.
