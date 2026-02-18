Place bundled GDAL binaries here for packaged builds.

This sidecar is intentionally trimmed for Arion's raster workflow.

Expected layout:

- `resources/gdal/bin/` with `gdalinfo`, `gdalwarp`, `gdal_translate`, `gdaladdo` executables
- `resources/gdal/share/gdal/` for GDAL data files
- `resources/gdal/share/proj/` for PROJ data files

Runtime discovery order:

1. `ARION_GDAL_BIN_DIR` / `ARION_GDAL_DATA_DIR` / `ARION_PROJ_LIB_DIR` / `ARION_GDAL_PLUGINS_DIR`
2. `ARION_GDAL_HOME` (expects `bin/` + `share/`)
3. Bundled `resourcesPath/gdal`

No system GDAL fallback is used.

Optional runtime controls:

- `ARION_GDAL_THREADS`: cap GDAL worker threads (default: min(4, CPU-1))
- `ARION_GDAL_TILE_RENDER=0`: disable GDAL-backed on-demand tile rendering for EPSG:4326 fallback rasters
- `ARION_GDAL_TILE_THREADS`: per-tile GDAL warp thread cap (default: 1)
- `ARION_GDAL_ENABLE_PLUGINS=1`: enable GDAL plugin autoload when a plugin directory exists
- `ARION_ALLOW_GDAL_FALLBACK=1`: allow fallback pipeline in packaged builds when GDAL optimization fails

Notes:

- Bundled sidecar omits optional GDAL command-line utilities not used by Arion.
- Bundled sidecar omits `resources/gdal/bin/gdalplugins`; set `ARION_GDAL_PLUGINS_DIR` to a custom plugin directory if needed.
