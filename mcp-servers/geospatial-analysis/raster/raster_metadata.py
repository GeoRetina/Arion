"""
Raster Metadata MCP Server - Basic raster information and statistics.
Handles raster metadata extraction, band statistics, and basic file info.

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
mcp = FastMCP(name="Raster-Metadata-Tools")

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

# --- Metadata Tools ---

@mcp.tool()
def extract_metadata(path: str) -> dict:
    """Extract comprehensive metadata from a raster file."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        metadata = {
            "file_path": str(p),
            "driver": src.driver,
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtypes": [str(dtype) for dtype in src.dtypes],
            "crs": src.crs.to_string() if src.crs else None,
            "bounds_original_crs": list(src.bounds),
            "bounds_wgs84": get_wgs84_bounds(src),
            "transform": list(src.transform),
            "nodata_values": src.nodatavals,
            "tags": src.tags(),
            "file_size_mb": round(p.stat().st_size / 1024 / 1024, 2)
        }
        
        # Add band-specific metadata
        metadata["bands"] = []
        for i in range(1, src.count + 1):
            band_info = {
                "band_number": i,
                "dtype": str(src.dtypes[i-1]),
                "nodata": src.nodatavals[i-1],
                "tags": src.tags(i)
            }
            metadata["bands"].append(band_info)
        
        return metadata

@mcp.tool()
def raster_overview(path: str) -> dict:
    """Get a quick overview of raster characteristics."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        # Calculate pixel size
        pixel_area = abs(src.transform[0] * src.transform[4])
        total_pixels = src.width * src.height
        
        return {
            "file_path": str(p),
            "dimensions": {"width": src.width, "height": src.height},
            "bands": src.count,
            "data_type": str(src.dtypes[0]) if src.count > 0 else None,
            "coordinate_system": src.crs.to_string() if src.crs else "No CRS",
            "pixel_size": {"x": abs(src.transform[0]), "y": abs(src.transform[4])},
            "pixel_area": pixel_area,
            "total_pixels": total_pixels,
            "coverage_area": pixel_area * total_pixels,
            "has_nodata": any(nodata is not None for nodata in src.nodatavals)
        }

# --- Statistical Tools ---

@mcp.tool()
def band_statistics(path: str, band_number: int = None) -> dict:
    """Calculate comprehensive statistics for raster bands."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if band_number is not None:
            if not (1 <= band_number <= src.count):
                raise ValueError(f"Invalid band number. Raster has {src.count} bands.")
            bands_to_process = [band_number]
        else:
            bands_to_process = list(range(1, src.count + 1))
        
        statistics = {}
        for band_idx in bands_to_process:
            data = src.read(band_idx, masked=True)
            
            if data.count() == 0:
                stats = {"min": None, "max": None, "mean": None, "std": None, "count": 0}
            else:
                stats = {
                    "min": float(np.ma.min(data)),
                    "max": float(np.ma.max(data)),
                    "mean": float(np.ma.mean(data)),
                    "std": float(np.ma.std(data)),
                    "count": int(data.count()),
                    "percentiles": {
                        "25": float(np.ma.percentile(data, 25)),
                        "50": float(np.ma.percentile(data, 50)),
                        "75": float(np.ma.percentile(data, 75))
                    }
                }
            
            statistics[f"band_{band_idx}"] = stats
        
        return {
            "file_path": str(p),
            "statistics": statistics,
            "bounds_wgs84": get_wgs84_bounds(src)
        }

@mcp.tool()
def histogram_data(path: str, band_number: int = 1, bins: int = 50) -> dict:
    """Generate histogram data for a raster band."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Raster has {src.count} bands.")
        
        data = src.read(band_number, masked=True)
        
        if data.count() == 0:
            return {
                "error": "No valid data in band",
                "band_number": band_number
            }
        
        # Calculate histogram
        hist, bin_edges = np.histogram(data.compressed(), bins=bins)
        
        return {
            "file_path": str(p),
            "band_number": band_number,
            "bins": bins,
            "histogram": hist.tolist(),
            "bin_edges": bin_edges.tolist(),
            "total_pixels": int(data.count()),
            "data_range": {
                "min": float(np.ma.min(data)),
                "max": float(np.ma.max(data))
            }
        }

@mcp.tool()
def unique_values(path: str, band_number: int = 1, max_unique: int = 100) -> dict:
    """Get unique values and their counts for a raster band."""
    p = validate_raster_path(path)
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Raster has {src.count} bands.")
        
        data = src.read(band_number, masked=True)
        
        if data.count() == 0:
            return {
                "error": "No valid data in band",
                "band_number": band_number
            }
        
        # Get unique values and counts
        unique_vals, counts = np.unique(data.compressed(), return_counts=True)
        
        # Limit results if too many unique values
        if len(unique_vals) > max_unique:
            # Sort by count (descending) and take top values
            sorted_indices = np.argsort(counts)[::-1][:max_unique]
            unique_vals = unique_vals[sorted_indices]
            counts = counts[sorted_indices]
            truncated = True
        else:
            truncated = False
        
        value_counts = {}
        for val, count in zip(unique_vals, counts):
            value_counts[str(float(val))] = int(count)
        
        return {
            "file_path": str(p),
            "band_number": band_number,
            "total_unique_values": len(np.unique(data.compressed())),
            "returned_values": len(value_counts),
            "truncated": truncated,
            "value_counts": value_counts
        }

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)