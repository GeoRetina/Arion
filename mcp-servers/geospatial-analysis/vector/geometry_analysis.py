"""
Geometry Analysis MCP Server - Geometric calculations and measurements.
Handles area, perimeter, length, centroid calculations, and geometric properties.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" geopandas shapely pyproj
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.geometry import Point, Polygon, LineString, MultiPolygon, MultiLineString
import sys

# Initialize MCP server
mcp = FastMCP(name="Geometry-Analysis-Tools")

# --- Helper Functions ---

def validate_vector_file(path: str) -> Path:
    """Validate and return Path object for vector file."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")
    return p

def get_geometry_stats(geometries: gpd.GeoSeries, geom_type: str) -> dict:
    """Calculate statistics for geometry measurements."""
    if len(geometries) == 0:
        return {"count": 0, "min": None, "max": None, "mean": None, "sum": None, "std": None}
    
    return {
        "count": len(geometries),
        "min": float(geometries.min()),
        "max": float(geometries.max()),
        "mean": float(geometries.mean()),
        "sum": float(geometries.sum()),
        "std": float(geometries.std()) if len(geometries) > 1 else 0,
        "median": float(geometries.median())
    }

# --- Area and Perimeter Analysis ---

@mcp.tool()
def area_perimeter_stats(path: str) -> dict:
    """Calculate area and perimeter statistics for polygon features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Filter for polygon geometries
    polygon_mask = gdf.geometry.type.isin(['Polygon', 'MultiPolygon'])
    polygons = gdf[polygon_mask]
    
    if polygons.empty:
        return {
            "error": "No polygon features found", 
            "file_path": str(p),
            "available_geometry_types": gdf.geometry.type.value_counts().to_dict()
        }
    
    # Calculate areas and perimeters
    areas = polygons.geometry.area
    perimeters = polygons.geometry.length  # Length of boundary = perimeter for polygons
    
    # Check if CRS is geographic (degrees) and provide warning
    is_geographic = gdf.crs and gdf.crs.is_geographic if gdf.crs else False
    
    result = {
        "file_path": str(p),
        "total_features": len(gdf),
        "polygon_features": len(polygons),
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "is_geographic_crs": is_geographic,
        "area_statistics": get_geometry_stats(areas, "area"),
        "perimeter_statistics": get_geometry_stats(perimeters, "perimeter")
    }
    
    if is_geographic:
        result["warning"] = "CRS is geographic (degrees). Consider reprojecting to a projected CRS for accurate area/perimeter measurements."
    
    # Calculate shape complexity (perimeter to area ratio)
    if len(areas) > 0 and areas.sum() > 0:
        complexity_ratios = perimeters / np.sqrt(areas)  # Normalized complexity
        result["shape_complexity"] = get_geometry_stats(complexity_ratios, "complexity")
    
    return result

@mcp.tool()
def polygon_analysis(path: str, area_threshold: float = None) -> dict:
    """Detailed analysis of polygon features including shape characteristics."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Filter for polygon geometries
    polygon_mask = gdf.geometry.type.isin(['Polygon', 'MultiPolygon'])
    polygons = gdf[polygon_mask]
    
    if polygons.empty:
        return {"error": "No polygon features found", "file_path": str(p)}
    
    # Basic measurements
    areas = polygons.geometry.area
    perimeters = polygons.geometry.length
    
    # Calculate additional shape metrics
    centroids = polygons.geometry.centroid
    
    # Compactness (isoperimetric quotient): 4π * Area / Perimeter²
    compactness = 4 * np.pi * areas / (perimeters ** 2)
    
    # Convex hull ratio: Area / Convex Hull Area
    convex_hull_areas = polygons.geometry.convex_hull.area
    convex_hull_ratio = areas / convex_hull_areas
    
    result = {
        "file_path": str(p),
        "polygon_count": len(polygons),
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "measurements": {
            "area": get_geometry_stats(areas, "area"),
            "perimeter": get_geometry_stats(perimeters, "perimeter"),
            "compactness": get_geometry_stats(compactness, "compactness"),
            "convex_hull_ratio": get_geometry_stats(convex_hull_ratio, "convex_hull_ratio")
        }
    }
    
    # Apply area threshold if specified
    if area_threshold is not None:
        large_polygons = areas >= area_threshold
        small_polygons = areas < area_threshold
        
        result["threshold_analysis"] = {
            "area_threshold": area_threshold,
            "large_polygons": int(large_polygons.sum()),
            "small_polygons": int(small_polygons.sum()),
            "large_polygons_percentage": round(100 * large_polygons.mean(), 1),
            "large_polygons_area_sum": float(areas[large_polygons].sum()),
            "small_polygons_area_sum": float(areas[small_polygons].sum())
        }
    
    return result

# --- Length Analysis ---

@mcp.tool()
def length_stats(path: str) -> dict:
    """Calculate length statistics for line features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Filter for line geometries
    line_mask = gdf.geometry.type.isin(['LineString', 'MultiLineString'])
    lines = gdf[line_mask]
    
    if lines.empty:
        return {
            "error": "No line features found", 
            "file_path": str(p),
            "available_geometry_types": gdf.geometry.type.value_counts().to_dict()
        }
    
    # Calculate lengths
    lengths = lines.geometry.length
    
    # Check if CRS is geographic
    is_geographic = gdf.crs and gdf.crs.is_geographic if gdf.crs else False
    
    result = {
        "file_path": str(p),
        "total_features": len(gdf),
        "line_features": len(lines),
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "is_geographic_crs": is_geographic,
        "length_statistics": get_geometry_stats(lengths, "length")
    }
    
    if is_geographic:
        result["warning"] = "CRS is geographic (degrees). Consider reprojecting to a projected CRS for accurate length measurements."
    
    # Analyze line complexity (for MultiLineString)
    multi_lines = lines[lines.geometry.type == 'MultiLineString']
    if len(multi_lines) > 0:
        # Count segments in MultiLineString features
        segment_counts = multi_lines.geometry.apply(lambda x: len(x.geoms) if hasattr(x, 'geoms') else 1)
        result["multiline_analysis"] = {
            "multiline_count": len(multi_lines),
            "segment_statistics": get_geometry_stats(segment_counts, "segments")
        }
    
    return result

# --- Centroid Analysis ---

@mcp.tool()
def centroid_analysis(path: str, output_crs: str = None) -> dict:
    """Calculate centroids of features and return analysis."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Calculate centroids
    centroids = gdf.geometry.centroid
    
    # Filter out invalid centroids
    valid_centroids = centroids[centroids.notna() & ~centroids.is_empty]
    
    if len(valid_centroids) == 0:
        return {"error": "No valid centroids could be calculated", "file_path": str(p)}
    
    # Reproject centroids if requested
    if output_crs and gdf.crs and gdf.crs.to_string() != output_crs:
        try:
            centroids_gdf = gpd.GeoDataFrame(geometry=valid_centroids, crs=gdf.crs)
            centroids_gdf = centroids_gdf.to_crs(output_crs)
            valid_centroids = centroids_gdf.geometry
        except Exception as e:
            return {"error": f"CRS reprojection failed: {str(e)}", "file_path": str(p)}
    
    # Extract coordinates
    coords = []
    for geom in valid_centroids.head(20):  # Limit to first 20 for performance
        if geom and not geom.is_empty:
            coords.append([geom.x, geom.y])
    
    # Calculate centroid statistics
    if coords:
        coords_array = np.array(coords)
        x_coords = coords_array[:, 0]
        y_coords = coords_array[:, 1]
        
        centroid_stats = {
            "x_coordinates": get_geometry_stats(pd.Series(x_coords), "x"),
            "y_coordinates": get_geometry_stats(pd.Series(y_coords), "y"),
            "centroid_bounds": {
                "minx": float(x_coords.min()),
                "miny": float(y_coords.min()),
                "maxx": float(x_coords.max()),
                "maxy": float(y_coords.max())
            }
        }
    else:
        centroid_stats = {"error": "No valid coordinate pairs found"}
    
    result = {
        "file_path": str(p),
        "total_features": len(gdf),
        "valid_centroids": len(valid_centroids),
        "sample_coordinates": coords,
        "centroid_statistics": centroid_stats,
        "original_crs": gdf.crs.to_string() if gdf.crs else None,
        "output_crs": output_crs or (gdf.crs.to_string() if gdf.crs else None)
    }
    
    return result

# --- Bounding Box Analysis ---

@mcp.tool()
def bounding_box_analysis(path: str) -> dict:
    """Analyze bounding boxes of individual features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Calculate bounding boxes for each feature
    bounds_list = []
    widths = []
    heights = []
    areas = []
    
    for geom in gdf.geometry:
        if geom and not geom.is_empty:
            bounds = geom.bounds  # (minx, miny, maxx, maxy)
            width = bounds[2] - bounds[0]
            height = bounds[3] - bounds[1]
            area = width * height
            
            bounds_list.append(bounds)
            widths.append(width)
            heights.append(height)
            areas.append(area)
    
    if not bounds_list:
        return {"error": "No valid geometries found", "file_path": str(p)}
    
    # Convert to pandas Series for statistics
    widths_series = pd.Series(widths)
    heights_series = pd.Series(heights)
    areas_series = pd.Series(areas)
    
    # Calculate aspect ratios
    aspect_ratios = widths_series / heights_series
    
    result = {
        "file_path": str(p),
        "analyzed_features": len(bounds_list),
        "total_features": len(gdf),
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "bounding_box_statistics": {
            "widths": get_geometry_stats(widths_series, "width"),
            "heights": get_geometry_stats(heights_series, "height"),
            "areas": get_geometry_stats(areas_series, "bbox_area"),
            "aspect_ratios": get_geometry_stats(aspect_ratios, "aspect_ratio")
        },
        "overall_bounds": {
            "minx": float(min(b[0] for b in bounds_list)),
            "miny": float(min(b[1] for b in bounds_list)),
            "maxx": float(max(b[2] for b in bounds_list)),
            "maxy": float(max(b[3] for b in bounds_list))
        }
    }
    
    return result

# --- Point Pattern Analysis ---

@mcp.tool()
def point_pattern_analysis(path: str, grid_size: int = 10) -> dict:
    """Analyze spatial distribution patterns of point features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Filter for point geometries
    point_mask = gdf.geometry.type.isin(['Point', 'MultiPoint'])
    points = gdf[point_mask]
    
    if points.empty:
        return {
            "error": "No point features found", 
            "file_path": str(p),
            "available_geometry_types": gdf.geometry.type.value_counts().to_dict()
        }
    
    # Extract coordinates
    coords = []
    for geom in points.geometry:
        if geom and not geom.is_empty:
            if geom.geom_type == 'Point':
                coords.append([geom.x, geom.y])
            elif geom.geom_type == 'MultiPoint':
                for point in geom.geoms:
                    coords.append([point.x, point.y])
    
    if not coords:
        return {"error": "No valid point coordinates found", "file_path": str(p)}
    
    coords_array = np.array(coords)
    
    # Calculate basic distribution statistics
    x_coords = coords_array[:, 0]
    y_coords = coords_array[:, 1]
    
    # Create a simple density grid
    bounds = points.total_bounds
    x_edges = np.linspace(bounds[0], bounds[2], grid_size + 1)
    y_edges = np.linspace(bounds[1], bounds[3], grid_size + 1)
    
    # Count points in each grid cell
    hist, _, _ = np.histogram2d(x_coords, y_coords, bins=[x_edges, y_edges])
    
    # Calculate density statistics
    cell_counts = hist.flatten()
    non_empty_cells = cell_counts[cell_counts > 0]
    
    result = {
        "file_path": str(p),
        "total_features": len(gdf),
        "point_features": len(points),
        "total_points": len(coords),
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "distribution_statistics": {
            "x_coordinates": get_geometry_stats(pd.Series(x_coords), "x"),
            "y_coordinates": get_geometry_stats(pd.Series(y_coords), "y")
        },
        "density_analysis": {
            "grid_size": grid_size,
            "total_cells": len(cell_counts),
            "non_empty_cells": len(non_empty_cells),
            "empty_cells": len(cell_counts) - len(non_empty_cells),
            "max_points_per_cell": int(cell_counts.max()),
            "mean_points_per_cell": float(cell_counts.mean()),
            "density_variation": float(cell_counts.std()) if len(cell_counts) > 1 else 0
        },
        "spatial_bounds": {
            "minx": float(bounds[0]),
            "miny": float(bounds[1]),
            "maxx": float(bounds[2]),
            "maxy": float(bounds[3])
        }
    }
    
    return result

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)