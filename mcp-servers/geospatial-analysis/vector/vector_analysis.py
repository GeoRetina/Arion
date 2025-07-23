"""
Vector Analysis MCP Server - Vector geospatial processing tools.
Handles vector data analysis, geometry operations, and spatial queries.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" geopandas shapely pyproj
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import unary_union
import json
import sys

# Initialize MCP server
mcp = FastMCP(name="Vector-Analysis-Tools")

# --- Helper Functions ---

def validate_vector_file(path: str) -> Path:
    """Validate and return Path object for vector file."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")
    return p

def gdf_to_summary(gdf: gpd.GeoDataFrame) -> dict:
    """Convert GeoDataFrame to summary dict."""
    return {
        "total_features": len(gdf),
        "geometry_types": gdf.geometry.type.value_counts().to_dict(),
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "bounds": list(gdf.total_bounds) if not gdf.empty else None,
        "columns": list(gdf.columns)
    }

# --- Basic Vector Tools ---

@mcp.tool()
def vector_info(path: str) -> dict:
    """Get basic information about a vector dataset."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    info = gdf_to_summary(gdf)
    info["file_path"] = str(p)
    
    # Add attribute statistics for numeric columns
    numeric_cols = gdf.select_dtypes(include=['number']).columns
    if len(numeric_cols) > 0:
        info["numeric_stats"] = {}
        for col in numeric_cols:
            info["numeric_stats"][col] = {
                "min": float(gdf[col].min()),
                "max": float(gdf[col].max()),
                "mean": float(gdf[col].mean()),
                "count": int(gdf[col].count())
            }
    
    return info

@mcp.tool()
def vector_bounds(path: str, to_crs: str = "EPSG:4326") -> dict:
    """Get bounds of vector dataset, optionally reprojected to specified CRS."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"bounds": None, "crs": None}
    
    # Reproject if requested
    if to_crs and gdf.crs and gdf.crs.to_string() != to_crs:
        gdf = gdf.to_crs(to_crs)
    
    bounds = gdf.total_bounds
    return {
        "bounds": {
            "minx": float(bounds[0]),
            "miny": float(bounds[1]),
            "maxx": float(bounds[2]),
            "maxy": float(bounds[3])
        },
        "crs": gdf.crs.to_string() if gdf.crs else None
    }

# --- Geometry Operations ---

@mcp.tool()
def buffer_analysis(path: str, distance: float, unit: str = "meters") -> dict:
    """Create buffers around geometries and return analysis."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "No features found in dataset"}
    
    # Convert distance based on unit and CRS
    if unit == "degrees" and gdf.crs and gdf.crs.is_geographic:
        buffer_distance = distance
    elif unit == "meters" and gdf.crs and not gdf.crs.is_geographic:
        buffer_distance = distance
    elif unit == "meters" and gdf.crs and gdf.crs.is_geographic:
        # For geographic CRS, approximate meters to degrees
        buffer_distance = distance / 111320  # rough conversion
    else:
        buffer_distance = distance
    
    # Create buffers
    buffered = gdf.copy()
    buffered.geometry = gdf.geometry.buffer(buffer_distance)
    
    return {
        "original_features": len(gdf),
        "buffered_features": len(buffered),
        "buffer_distance": buffer_distance,
        "unit": unit,
        "total_buffer_area": float(buffered.geometry.area.sum()),
        "bounds": list(buffered.total_bounds)
    }

@mcp.tool()
def dissolve_features(path: str, dissolve_field: str = None) -> dict:
    """Dissolve features by attribute field or dissolve all features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "No features found in dataset"}
    
    original_count = len(gdf)
    
    if dissolve_field and dissolve_field in gdf.columns:
        dissolved = gdf.dissolve(by=dissolve_field)
        dissolved_count = len(dissolved)
        unique_values = gdf[dissolve_field].nunique()
    else:
        # Dissolve all features into one
        dissolved = gdf.dissolve()
        dissolved_count = len(dissolved)
        unique_values = 1
    
    return {
        "original_features": original_count,
        "dissolved_features": dissolved_count,
        "dissolve_field": dissolve_field,
        "unique_values": unique_values,
        "total_area": float(dissolved.geometry.area.sum()),
        "bounds": list(dissolved.total_bounds)
    }

# --- Spatial Analysis ---

@mcp.tool()
def spatial_join_analysis(target_path: str, join_path: str, how: str = "inner", op: str = "intersects") -> dict:
    """Perform spatial join between two vector datasets and return analysis."""
    target_p = validate_vector_file(target_path)
    join_p = validate_vector_file(join_path)
    
    target_gdf = gpd.read_file(target_p)
    join_gdf = gpd.read_file(join_p)
    
    if target_gdf.empty or join_gdf.empty:
        return {"error": "One or both datasets are empty"}
    
    # Ensure same CRS
    if target_gdf.crs != join_gdf.crs:
        join_gdf = join_gdf.to_crs(target_gdf.crs)
    
    # Perform spatial join
    result = gpd.sjoin(target_gdf, join_gdf, how=how, predicate=op)
    
    return {
        "target_features": len(target_gdf),
        "join_features": len(join_gdf),
        "result_features": len(result),
        "join_operation": op,
        "join_type": how,
        "matched_target_features": len(result.index.unique()),
        "crs": result.crs.to_string() if result.crs else None
    }

@mcp.tool()
def centroid_analysis(path: str) -> dict:
    """Calculate centroids of features and return analysis."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "No features found in dataset"}
    
    # Calculate centroids
    centroids = gdf.copy()
    centroids.geometry = gdf.geometry.centroid
    
    # Get centroid coordinates
    coords = []
    for geom in centroids.geometry:
        if geom:
            coords.append([geom.x, geom.y])
    
    return {
        "total_features": len(gdf),
        "centroid_coordinates": coords[:10],  # First 10 centroids
        "total_centroids": len(coords),
        "bounds": list(centroids.total_bounds) if coords else None,
        "crs": gdf.crs.to_string() if gdf.crs else None
    }

# --- Geometric Calculations ---

@mcp.tool()
def area_perimeter_stats(path: str) -> dict:
    """Calculate area and perimeter statistics for polygon features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "No features found in dataset"}
    
    # Filter for polygon geometries
    polygons = gdf[gdf.geometry.type.isin(['Polygon', 'MultiPolygon'])]
    
    if polygons.empty:
        return {"error": "No polygon features found"}
    
    # Calculate areas and perimeters
    areas = polygons.geometry.area
    perimeters = polygons.geometry.length
    
    return {
        "polygon_features": len(polygons),
        "area_stats": {
            "min": float(areas.min()),
            "max": float(areas.max()),
            "mean": float(areas.mean()),
            "sum": float(areas.sum())
        },
        "perimeter_stats": {
            "min": float(perimeters.min()),
            "max": float(perimeters.max()),
            "mean": float(perimeters.mean()),
            "sum": float(perimeters.sum())
        },
        "crs": gdf.crs.to_string() if gdf.crs else None
    }

@mcp.tool()
def length_stats(path: str) -> dict:
    """Calculate length statistics for line features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "No features found in dataset"}
    
    # Filter for line geometries
    lines = gdf[gdf.geometry.type.isin(['LineString', 'MultiLineString'])]
    
    if lines.empty:
        return {"error": "No line features found"}
    
    # Calculate lengths
    lengths = lines.geometry.length
    
    return {
        "line_features": len(lines),
        "length_stats": {
            "min": float(lengths.min()),
            "max": float(lengths.max()),
            "mean": float(lengths.mean()),
            "sum": float(lengths.sum())
        },
        "crs": gdf.crs.to_string() if gdf.crs else None
    }

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)