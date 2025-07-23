"""
Spatial Analysis MCP Server - Focal operations and neighborhood analysis.
Handles focal statistics, kernel operations, and spatial filtering for rasters.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" rasterio numpy scipy pyproj
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import numpy as np
import rasterio as rio
from rasterio.warp import transform_bounds
from pyproj import CRS
from scipy.ndimage import generic_filter, uniform_filter, gaussian_filter, median_filter
import sys

# Initialize MCP server
mcp = FastMCP(name="Spatial-Analysis-Tools")

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

def handle_nodata(data: np.ndarray, nodata_val) -> np.ndarray:
    """Convert nodata values to NaN for processing."""
    if nodata_val is not None and not np.isnan(nodata_val):
        data = data.astype("float32")
        data[data == nodata_val] = np.nan
    return data

def calculate_filter_stats(original_data: np.ndarray, filtered_data: np.ndarray, 
                          filter_name: str) -> dict:
    """Calculate statistics comparing original and filtered data."""
    valid_original = ~np.isnan(original_data)
    valid_filtered = ~np.isnan(filtered_data)
    
    return {
        f"{filter_name}_stats": {
            "original_valid_pixels": int(np.sum(valid_original)),
            "filtered_valid_pixels": int(np.sum(valid_filtered)),
            "min": float(np.nanmin(filtered_data)) if np.any(valid_filtered) else None,
            "max": float(np.nanmax(filtered_data)) if np.any(valid_filtered) else None,
            "mean": float(np.nanmean(filtered_data)) if np.any(valid_filtered) else None,
            "std": float(np.nanstd(filtered_data)) if np.any(valid_filtered) else None
        }
    }

# --- Focal Statistics Tools ---

@mcp.tool()
def focal_mean(path: str, band_number: int = 1, window_size: int = 3) -> dict:
    """Calculate focal mean statistics using a moving window."""
    p = validate_raster_path(path)
    
    if window_size <= 0 or window_size % 2 == 0:
        raise ValueError("Window size must be a positive odd integer.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        data = handle_nodata(data, nodata_val)
        
        # Apply focal mean
        footprint = np.ones((window_size, window_size), dtype=bool)
        filtered_data = generic_filter(data, np.nanmean, footprint=footprint, mode='reflect')
        
        result = calculate_filter_stats(data, filtered_data, "focal_mean")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "window_size": window_size,
            "filter_type": "focal_mean",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

@mcp.tool()
def focal_max(path: str, band_number: int = 1, window_size: int = 3) -> dict:
    """Calculate focal maximum statistics using a moving window."""
    p = validate_raster_path(path)
    
    if window_size <= 0 or window_size % 2 == 0:
        raise ValueError("Window size must be a positive odd integer.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        data = handle_nodata(data, nodata_val)
        
        # Apply focal maximum
        footprint = np.ones((window_size, window_size), dtype=bool)
        filtered_data = generic_filter(data, np.nanmax, footprint=footprint, mode='reflect')
        
        result = calculate_filter_stats(data, filtered_data, "focal_max")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "window_size": window_size,
            "filter_type": "focal_max",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

@mcp.tool()
def focal_min(path: str, band_number: int = 1, window_size: int = 3) -> dict:
    """Calculate focal minimum statistics using a moving window."""
    p = validate_raster_path(path)
    
    if window_size <= 0 or window_size % 2 == 0:
        raise ValueError("Window size must be a positive odd integer.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        data = handle_nodata(data, nodata_val)
        
        # Apply focal minimum
        footprint = np.ones((window_size, window_size), dtype=bool)
        filtered_data = generic_filter(data, np.nanmin, footprint=footprint, mode='reflect')
        
        result = calculate_filter_stats(data, filtered_data, "focal_min")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "window_size": window_size,
            "filter_type": "focal_min",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

@mcp.tool()
def focal_std(path: str, band_number: int = 1, window_size: int = 3) -> dict:
    """Calculate focal standard deviation statistics using a moving window."""
    p = validate_raster_path(path)
    
    if window_size <= 0 or window_size % 2 == 0:
        raise ValueError("Window size must be a positive odd integer.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        data = handle_nodata(data, nodata_val)
        
        # Apply focal standard deviation
        footprint = np.ones((window_size, window_size), dtype=bool)
        filtered_data = generic_filter(data, np.nanstd, footprint=footprint, mode='reflect')
        
        result = calculate_filter_stats(data, filtered_data, "focal_std")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "window_size": window_size,
            "filter_type": "focal_std",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

# --- Smoothing Filters ---

@mcp.tool()
def gaussian_smooth(path: str, band_number: int = 1, sigma: float = 1.0) -> dict:
    """Apply Gaussian smoothing filter to reduce noise."""
    p = validate_raster_path(path)
    
    if sigma <= 0:
        raise ValueError("Sigma must be positive.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        original_data = handle_nodata(data, nodata_val)
        
        # Apply Gaussian filter
        # For NaN handling, we need to use a different approach
        valid_mask = ~np.isnan(original_data)
        filtered_data = np.full_like(original_data, np.nan)
        
        if np.any(valid_mask):
            # Replace NaN with mean for filtering, then restore NaN
            temp_data = original_data.copy()
            temp_data[np.isnan(temp_data)] = np.nanmean(original_data)
            filtered_temp = gaussian_filter(temp_data, sigma=sigma)
            filtered_data[valid_mask] = filtered_temp[valid_mask]
        
        result = calculate_filter_stats(original_data, filtered_data, "gaussian_smooth")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "sigma": sigma,
            "filter_type": "gaussian_smooth",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

@mcp.tool()
def median_filter_analysis(path: str, band_number: int = 1, size: int = 3) -> dict:
    """Apply median filter to remove salt-and-pepper noise."""
    p = validate_raster_path(path)
    
    if size <= 0:
        raise ValueError("Filter size must be positive.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        original_data = handle_nodata(data, nodata_val)
        
        # Apply median filter
        valid_mask = ~np.isnan(original_data)
        filtered_data = np.full_like(original_data, np.nan)
        
        if np.any(valid_mask):
            # Replace NaN with median for filtering, then restore NaN
            temp_data = original_data.copy()
            temp_data[np.isnan(temp_data)] = np.nanmedian(original_data)
            filtered_temp = median_filter(temp_data, size=size)
            filtered_data[valid_mask] = filtered_temp[valid_mask]
        
        result = calculate_filter_stats(original_data, filtered_data, "median_filter")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "filter_size": size,
            "filter_type": "median_filter",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

# --- Edge Detection ---

@mcp.tool()
def edge_detection(path: str, band_number: int = 1, method: str = "sobel") -> dict:
    """Detect edges in raster data using gradient-based methods."""
    p = validate_raster_path(path)
    
    if method not in ["sobel", "gradient"]:
        raise ValueError("Method must be 'sobel' or 'gradient'.")
    
    with rio.open(p) as src:
        if not (1 <= band_number <= src.count):
            raise ValueError(f"Invalid band number. Image has {src.count} bands.")
        
        data = src.read(band_number).astype("float32")
        nodata_val = src.nodatavals[band_number-1]
        original_data = handle_nodata(data, nodata_val)
        
        valid_mask = ~np.isnan(original_data)
        edge_data = np.full_like(original_data, np.nan)
        
        if np.any(valid_mask):
            # Replace NaN with mean for edge detection
            temp_data = original_data.copy()
            temp_data[np.isnan(temp_data)] = np.nanmean(original_data)
            
            if method == "sobel":
                # Sobel edge detection
                sobel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]])
                sobel_y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]])
                
                edge_x = generic_filter(temp_data, lambda x: np.sum(x.reshape(3, 3) * sobel_x), size=3)
                edge_y = generic_filter(temp_data, lambda x: np.sum(x.reshape(3, 3) * sobel_y), size=3)
                edge_magnitude = np.sqrt(edge_x**2 + edge_y**2)
                
            elif method == "gradient":
                # Simple gradient magnitude
                grad_y, grad_x = np.gradient(temp_data)
                edge_magnitude = np.sqrt(grad_x**2 + grad_y**2)
            
            edge_data[valid_mask] = edge_magnitude[valid_mask]
        
        result = calculate_filter_stats(original_data, edge_data, f"edge_{method}")
        result.update({
            "file_path": str(p),
            "band_number": band_number,
            "edge_method": method,
            "filter_type": f"edge_{method}",
            "bounds_wgs84": get_wgs84_bounds(src)
        })
        
        return result

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)