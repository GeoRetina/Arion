Place bundled GDAL binaries here for packaged builds.

This sidecar is intentionally trimmed for Arion's raster workflow.

Expected layout:

- Preferred cross-platform layout:
  - `resources/gdal/windows/bin/` with `gdalinfo.exe`, `gdalwarp.exe`, `gdal_translate.exe`, `gdaladdo.exe`
  - `resources/gdal/macos/bin/` with `gdalinfo`, `gdalwarp`, `gdal_translate`, `gdaladdo`
  - `resources/gdal/linux/bin/` with `gdalinfo`, `gdalwarp`, `gdal_translate`, `gdaladdo`
- Shared data (or platform-local data) is supported:
  - `resources/gdal/share/gdal/` or `resources/gdal/<platform>/share/gdal/`
  - `resources/gdal/share/proj/` or `resources/gdal/<platform>/share/proj/`
- Optional Unix shared libs:
  - `resources/gdal/<platform>/lib/` (or override with `ARION_GDAL_LIBRARY_DIR`)
- Legacy single-platform layout remains supported:
  - `resources/gdal/bin/` + `resources/gdal/share/*`

Runtime discovery order:

1. `ARION_GDAL_BIN_DIR` / `ARION_GDAL_DATA_DIR` / `ARION_PROJ_LIB_DIR` / `ARION_GDAL_PLUGINS_DIR` / `ARION_GDAL_LIBRARY_DIR`
2. `ARION_GDAL_HOME` (prefers `<platform>/bin`, falls back to `bin`)
3. Bundled `resourcesPath/gdal` (prefers platform-scoped directories, then legacy layout)
4. System `gdalinfo`/`gdalwarp`/`gdal_translate`/`gdaladdo` from `PATH` on **macOS and Linux only** (when bundled binaries are missing)

Windows does **not** use system GDAL fallback and still requires bundled binaries (or explicit `ARION_GDAL_*` paths). Shipped Windows app builds include these bundled GDAL files.

System GDAL install quickstart (for macOS/Linux fallback or local dev):

```bash
# macOS (Homebrew)
brew install gdal

# Ubuntu / Debian
sudo apt update && sudo apt install -y gdal-bin libgdal-dev

# Fedora / RHEL
sudo dnf install -y gdal gdal-devel

# Arch Linux
sudo pacman -S --needed gdal
```

Windows quickstart (for sourcing bundled binaries):

- `conda install -c conda-forge gdal`
- Copy required binaries/data into the expected `resources/gdal/windows/*` layout.

Verify install:

```bash
gdalinfo --version
```

Optional runtime controls:

- `ARION_GDAL_THREADS`: cap GDAL worker threads (default: min(4, CPU-1))
- `ARION_GDAL_TILE_RENDER=0`: disable GDAL tile rendering (raster tile requests will fail; no fallback path)
- `ARION_GDAL_TILE_THREADS`: per-tile GDAL warp thread cap (default: 1)
- `ARION_GDAL_TILE_CONCURRENCY`: max parallel GDAL tile render jobs (default: min(2, CPU-1))
- `ARION_GDAL_ENABLE_PLUGINS=0`: disable bundled GDAL plugin autoload (autoload is enabled by default when bundled plugins are present)
- `ARION_ALLOW_GDAL_FALLBACK=1`: allow fallback pipeline in packaged builds when GDAL optimization fails

Notes:

- Bundled sidecar omits optional GDAL command-line utilities not used by Arion.
- Bundled sidecar omits built-in plugin packs by default; set `ARION_GDAL_PLUGINS_DIR` to a custom plugin directory if needed.
- System fallback mode preserves host GDAL environment by default; explicit `ARION_GDAL_*` overrides still apply.
- Raster tile serving is GDAL-only; geotiff-js tile rendering fallback is intentionally disabled.
