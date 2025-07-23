"""
Spectral Indices MCP Server - Calculation of vegetation and water indices.
Handles NDVI, NDWI, EVI, SAVI, and other spectral indices for remote sensing analysis.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" rasterio numpy pyproj
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import numpy as np
import rasterio as rio
from rasterio.warp import transform_bounds
from pyproj import CRS
import sys

# Initialize MCP server
mcp = FastMCP(name="Spectral-Indices-Tools")

# --- Helper Functions ---

def get_wgs84_bounds(src: rio.DatasetReader) -> list[float]:
    """Convert raster bounds to WGS84 coordinates."""
    if src.crs:
        try:
            wgs84_bounds = transform_bounds(src.crs, CRS.from_epsg(4326), *src.bounds)
            return list(wgs84_bounds)
        except Exception as e:
            print(f"Warning: Could not transform bounds to WGS84: {e}", file=sys.stderr)
            return list(src.bounds)
    return list(src.bounds)

def validate_raster_path(path: str) -> Path:
    """Validate and return Path object for raster file."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")
    return p

def calculate_index_stats(index_array: np.ndarray, index_name: str) -> dict:
    """Calculate statistics for a spectral index array."""
    if np.all(np.isnan(index_array)):
        return {
            f"{index_name}_stats": {
                "min": None, "max": None, "mean": None, "std": None,
                "valid_pixels": 0, "total_pixels": index_array.size
            }
        }
    
    valid_mask = ~np.isnan(index_array)
    valid_data = index_array[valid_mask]
    
    return {
        f"{index_name}_stats": {
            "min": float(np.min(valid_data)),
            "max": float(np.max(valid_data)),
            "mean": float(np.mean(valid_data)),
            "std": float(np.std(valid_data)),
            "valid_pixels": int(np.sum(valid_mask)),
            "total_pixels": int(index_array.size),
            "percentiles": {
                "25": float(np.percentile(valid_data, 25)),
                "50": float(np.percentile(valid_data, 50)),
                "75": float(np.percentile(valid_data, 75))
            }
        }
    }

# --- Vegetation Indices ---

@mcp.tool()
def calculate_ndvi(path: str, red_band: int = 3, nir_band: int = 4) -> dict:
    """Calculate NDVI (Normalized Difference Vegetation Index) statistics."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not (1 <= red_band <= src.count and 1 <= nir_band <= src.count):
            raise ValueError(f"Invalid band indices. Image has {src.count} bands.")
        
        red = src.read(red_band).astype("float32")
        nir = src.read(nir_band).astype("float32")
        
        # Handle nodata values
        red_nodata = src.nodatavals[red_band-1]
        nir_nodata = src.nodatavals[nir_band-1]
        
        if red_nodata is not None:
            red[red == red_nodata] = np.nan
        if nir_nodata is not None:
            nir[nir == nir_nodata] = np.nan
        
        # Calculate NDVI
        denominator = nir + red
        ndvi = np.full_like(denominator, np.nan, dtype=np.float32)
        valid_pixels = denominator != 0
        ndvi[valid_pixels] = (nir[valid_pixels] - red[valid_pixels]) / denominator[valid_pixels]
        
        result = calculate_index_stats(ndvi, "ndvi")
        result.update({
            "file_path": str(p),
            "red_band": red_band,
            "nir_band": nir_band,
            "bounds_wgs84": get_wgs84_bounds(src),
            "index_description": "NDVI ranges from -1 to 1. Higher values indicate healthier vegetation."
        })
        
        return result

@mcp.tool()
def calculate_evi(path: str, red_band: int = 3, nir_band: int = 4, blue_band: int = 1, 
                  G: float = 2.5, C1: float = 6.0, C2: float = 7.5, L: float = 1.0) -> dict:
    """Calculate EVI (Enhanced Vegetation Index) statistics."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not all(1 <= band <= src.count for band in [red_band, nir_band, blue_band]):
            raise ValueError(f"Invalid band indices. Image has {src.count} bands.")
        
        red = src.read(red_band).astype("float32")
        nir = src.read(nir_band).astype("float32")
        blue = src.read(blue_band).astype("float32")
        
        # Handle nodata values
        for band_idx, band_data in [(red_band, red), (nir_band, nir), (blue_band, blue)]:
            nodata_val = src.nodatavals[band_idx-1]
            if nodata_val is not None:
                band_data[band_data == nodata_val] = np.nan
        
        # Calculate EVI
        denominator = nir + C1 * red - C2 * blue + L
        evi = np.full_like(denominator, np.nan, dtype=np.float32)
        valid_pixels = denominator != 0
        evi[valid_pixels] = G * (nir[valid_pixels] - red[valid_pixels]) / denominator[valid_pixels]
        
        result = calculate_index_stats(evi, "evi")
        result.update({
            "file_path": str(p),
            "red_band": red_band,
            "nir_band": nir_band,
            "blue_band": blue_band,
            "parameters": {"G": G, "C1": C1, "C2": C2, "L": L},
            "bounds_wgs84": get_wgs84_bounds(src),
            "index_description": "EVI ranges from -1 to 1. Improved vegetation index that reduces atmospheric effects."
        })
        
        return result

@mcp.tool()
def calculate_savi(path: str, red_band: int = 3, nir_band: int = 4, L: float = 0.5) -> dict:
    """Calculate SAVI (Soil Adjusted Vegetation Index) statistics."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not (1 <= red_band <= src.count and 1 <= nir_band <= src.count):
            raise ValueError(f"Invalid band indices. Image has {src.count} bands.")
        
        red = src.read(red_band).astype("float32")
        nir = src.read(nir_band).astype("float32")
        
        # Handle nodata values
        red_nodata = src.nodatavals[red_band-1]
        nir_nodata = src.nodatavals[nir_band-1]
        
        if red_nodata is not None:
            red[red == red_nodata] = np.nan
        if nir_nodata is not None:
            nir[nir == nir_nodata] = np.nan
        
        # Calculate SAVI
        denominator = nir + red + L
        savi = np.full_like(denominator, np.nan, dtype=np.float32)
        valid_pixels = denominator != 0
        savi[valid_pixels] = ((nir[valid_pixels] - red[valid_pixels]) / denominator[valid_pixels]) * (1 + L)
        
        result = calculate_index_stats(savi, "savi")
        result.update({
            "file_path": str(p),
            "red_band": red_band,
            "nir_band": nir_band,
            "L_parameter": L,
            "bounds_wgs84": get_wgs84_bounds(src),
            "index_description": f"SAVI with L={L}. Reduces soil brightness influence on vegetation measurements."
        })
        
        return result

# --- Water Indices ---

@mcp.tool()
def calculate_ndwi(path: str, green_band: int = 2, nir_band: int = 4) -> dict:
    """Calculate NDWI (Normalized Difference Water Index) statistics."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not (1 <= green_band <= src.count and 1 <= nir_band <= src.count):
            raise ValueError(f"Invalid band indices. Image has {src.count} bands.")
        
        green = src.read(green_band).astype("float32")
        nir = src.read(nir_band).astype("float32")
        
        # Handle nodata values
        green_nodata = src.nodatavals[green_band-1]
        nir_nodata = src.nodatavals[nir_band-1]
        
        if green_nodata is not None:
            green[green == green_nodata] = np.nan
        if nir_nodata is not None:
            nir[nir == nir_nodata] = np.nan
        
        # Calculate NDWI
        denominator = green + nir
        ndwi = np.full_like(denominator, np.nan, dtype=np.float32)
        valid_pixels = denominator != 0
        ndwi[valid_pixels] = (green[valid_pixels] - nir[valid_pixels]) / denominator[valid_pixels]
        
        result = calculate_index_stats(ndwi, "ndwi")
        result.update({
            "file_path": str(p),
            "green_band": green_band,
            "nir_band": nir_band,
            "bounds_wgs84": get_wgs84_bounds(src),
            "index_description": "NDWI ranges from -1 to 1. Higher values indicate water presence."
        })
        
        return result

@mcp.tool()
def calculate_mndwi(path: str, green_band: int = 2, swir_band: int = 6) -> dict:
    """Calculate MNDWI (Modified Normalized Difference Water Index) statistics."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not (1 <= green_band <= src.count and 1 <= swir_band <= src.count):
            raise ValueError(f"Invalid band indices. Image has {src.count} bands.")
        
        green = src.read(green_band).astype("float32")
        swir = src.read(swir_band).astype("float32")
        
        # Handle nodata values
        green_nodata = src.nodatavals[green_band-1]
        swir_nodata = src.nodatavals[swir_band-1]
        
        if green_nodata is not None:
            green[green == green_nodata] = np.nan
        if swir_nodata is not None:
            swir[swir == swir_nodata] = np.nan
        
        # Calculate MNDWI
        denominator = green + swir
        mndwi = np.full_like(denominator, np.nan, dtype=np.float32)
        valid_pixels = denominator != 0
        mndwi[valid_pixels] = (green[valid_pixels] - swir[valid_pixels]) / denominator[valid_pixels]
        
        result = calculate_index_stats(mndwi, "mndwi")
        result.update({
            "file_path": str(p),
            "green_band": green_band,
            "swir_band": swir_band,
            "bounds_wgs84": get_wgs84_bounds(src),
            "index_description": "MNDWI uses SWIR band for better water detection in urban areas."
        })
        
        return result

# --- Multi-Index Analysis ---

@mcp.tool()
def calculate_multiple_indices(path: str, red_band: int = 3, nir_band: int = 4, 
                              green_band: int = 2, blue_band: int = 1) -> dict:
    """Calculate multiple vegetation and water indices in one operation."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        bands_needed = [red_band, nir_band, green_band, blue_band]
        if not all(1 <= band <= src.count for band in bands_needed):
            raise ValueError(f"Invalid band indices. Image has {src.count} bands.")
        
        # Read all bands
        red = src.read(red_band).astype("float32")
        nir = src.read(nir_band).astype("float32")
        green = src.read(green_band).astype("float32")
        blue = src.read(blue_band).astype("float32")
        
        # Handle nodata values
        for band_idx, band_data in [(red_band, red), (nir_band, nir), (green_band, green), (blue_band, blue)]:
            nodata_val = src.nodatavals[band_idx-1]
            if nodata_val is not None:
                band_data[band_data == nodata_val] = np.nan
        
        results = {
            "file_path": str(p),
            "band_configuration": {
                "red_band": red_band, "nir_band": nir_band,
                "green_band": green_band, "blue_band": blue_band
            },
            "bounds_wgs84": get_wgs84_bounds(src),
            "indices": {}
        }
        
        # Calculate NDVI
        ndvi_denom = nir + red
        ndvi = np.full_like(ndvi_denom, np.nan, dtype=np.float32)
        valid_ndvi = ndvi_denom != 0
        ndvi[valid_ndvi] = (nir[valid_ndvi] - red[valid_ndvi]) / ndvi_denom[valid_ndvi]
        results["indices"]["ndvi"] = calculate_index_stats(ndvi, "ndvi")["ndvi_stats"]
        
        # Calculate NDWI
        ndwi_denom = green + nir
        ndwi = np.full_like(ndwi_denom, np.nan, dtype=np.float32)
        valid_ndwi = ndwi_denom != 0
        ndwi[valid_ndwi] = (green[valid_ndwi] - nir[valid_ndwi]) / ndwi_denom[valid_ndwi]
        results["indices"]["ndwi"] = calculate_index_stats(ndwi, "ndwi")["ndwi_stats"]
        
        # Calculate EVI (simplified with default parameters)
        evi_denom = nir + 6.0 * red - 7.5 * blue + 1.0
        evi = np.full_like(evi_denom, np.nan, dtype=np.float32)
        valid_evi = evi_denom != 0
        evi[valid_evi] = 2.5 * (nir[valid_evi] - red[valid_evi]) / evi_denom[valid_evi]
        results["indices"]["evi"] = calculate_index_stats(evi, "evi")["evi_stats"]
        
        return results

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)