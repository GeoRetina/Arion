---
id: qgis-processing
name: QGIS Processing
description: Use Arion's local QGIS integration to discover, describe, and run qgis_process workflows against file-backed layers. Use when a request involves QGIS Processing algorithms, qgis_process troubleshooting, chaining multiple QGIS steps, or selecting the right algorithm and parameters for a map layer.
---

# QGIS Processing

## When To Use

- Use when the request explicitly mentions QGIS, `qgis_process`, or Processing algorithms.
- Use when a map layer needs a QGIS algorithm such as buffer, clip, dissolve, extract, field calculation, reprojection, or layout export.
- Use when a multi-step workflow needs chained QGIS outputs instead of a single one-off run.

## Workflow

1. List map layers first when the user refers to a layer already on the map.
2. Use `integrationInputs.qgis.inputPath` from the layer listing when available. Fall back to `localFilePath` only for file-backed layers.
3. Search algorithms with `qgis_list_algorithms` using a focused `query`, an optional `provider`, and a small `limit`. Prefer `provider: native` first. For compound tasks, search the immediate step you need next instead of the whole workflow at once.
4. Describe the shortlisted algorithm with `qgis_describe_algorithm` before building parameters.
5. Run the algorithm with `qgis_run_processing` using the exact parameter names from the description.
6. For final outputs, use a simple named file such as `buffer.geojson`, `result.gpkg`, or `warped.tif` and let Arion manage the output workspace.
7. Chain multi-step workflows by feeding returned artifact paths into the next QGIS run.
8. After each run, inspect `result`, `artifacts`, and `importedLayers` before deciding the next step.

## Guardrails

- Do not guess algorithm ids from memory when `qgis_list_algorithms` and `qgis_describe_algorithm` can confirm them.
- Do not use arbitrary absolute output paths for generated files unless they are already inside Arion's managed QGIS workspace. Prefer relative output filenames.
- Do not rely on `TEMPORARY_OUTPUT` for a final result that should appear on the map. Use a named output file instead.
- Prefer approved `native:*` algorithms. Treat non-`native` algorithms as suspect until the tool response confirms they are allowed.
- For feature-inspection tasks, prefer extraction or transformation workflows that produce a concrete vector or table output the app can import and preview.

## Search Hints

- Search `buffer`, `clip`, `dissolve`, `reproject`, `extract`, `field`, `order`, `sort`, `geometry`, `layout`, `translate`, or `warp` instead of requesting the full algorithm catalog.
- If the first search is too broad, narrow by provider or add a second keyword such as `extract expression` or `field calculator`.
- For requests like `top 10 longest lines`, search `sort line features by length` or `order by expression` first, then search the extraction or retention step separately.
