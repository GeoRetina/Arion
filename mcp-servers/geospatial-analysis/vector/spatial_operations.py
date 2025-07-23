"""
Spatial Operations MCP Server - Vector spatial analysis and operations.
Handles buffers, dissolve, spatial joins, and geometric operations.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" geopandas shapely pyproj
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import unary_union
import sys

# Initialize MCP server
mcp = FastMCP(name="Spatial-Operations-Tools")

# --- Helper Functions ---

def validate_vector_file(path: str) -> Path:
    """Validate and return Path object for vector file."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")
    return p

def ensure_same_crs(gdf1: gpd.GeoDataFrame, gdf2: gpd.GeoDataFrame) -> tuple:
    """Ensure both GeoDataFrames have the same CRS, reproject if necessary."""
    if gdf1.crs != gdf2.crs:
        if gdf1.crs is None:
            raise ValueError("First dataset has no CRS defined")
        if gdf2.crs is None:
            raise ValueError("Second dataset has no CRS defined")
        # Reproject second to match first
        gdf2_proj = gdf2.to_crs(gdf1.crs)
        return gdf1, gdf2_proj
    return gdf1, gdf2

# --- Buffer Operations ---

@mcp.tool()
def buffer_analysis(path: str, distance: float, unit: str = "meters") -> dict:
    """Create buffers around geometries and return analysis."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Handle distance units and CRS
    buffer_distance = distance
    if unit == "degrees" and gdf.crs and not gdf.crs.is_geographic:
        # Convert to meters approximately if CRS is not geographic
        buffer_distance = distance * 111320  # rough conversion
    elif unit == "meters" and gdf.crs and gdf.crs.is_geographic:
        # Convert to degrees approximately if CRS is geographic
        buffer_distance = distance / 111320  # rough conversion
    
    # Create buffers
    try:
        buffered_gdf = gdf.copy()
        buffered_gdf.geometry = gdf.geometry.buffer(buffer_distance)
        
        # Calculate statistics
        original_area = gdf.geometry.area.sum() if gdf.crs and not gdf.crs.is_geographic else None
        buffered_area = buffered_gdf.geometry.area.sum() if gdf.crs and not gdf.crs.is_geographic else None
        
        result = {
            "file_path": str(p),
            "original_features": len(gdf),
            "buffered_features": len(buffered_gdf),
            "buffer_distance": buffer_distance,
            "unit": unit,
            "bounds": list(buffered_gdf.total_bounds),
            "crs": gdf.crs.to_string() if gdf.crs else None
        }
        
        if original_area is not None and buffered_area is not None:
            result["area_analysis"] = {
                "original_total_area": float(original_area),
                "buffered_total_area": float(buffered_area),
                "area_increase": float(buffered_area - original_area)
            }
        
        return result
        
    except Exception as e:
        return {"error": f"Buffer operation failed: {str(e)}", "file_path": str(p)}

@mcp.tool()
def multi_distance_buffer(path: str, distances: list[float], unit: str = "meters") -> dict:
    """Create multiple buffers at different distances."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    if not distances or not isinstance(distances, list):
        raise ValueError("distances must be a list of buffer distances")
    
    results = {
        "file_path": str(p),
        "original_features": len(gdf),
        "buffer_distances": distances,
        "unit": unit,
        "crs": gdf.crs.to_string() if gdf.crs else None,
        "buffer_results": []
    }
    
    for dist in sorted(distances):
        # Adjust distance based on unit and CRS
        buffer_distance = dist
        if unit == "meters" and gdf.crs and gdf.crs.is_geographic:
            buffer_distance = dist / 111320
        
        try:
            buffered_geom = gdf.geometry.buffer(buffer_distance)
            buffer_bounds = buffered_geom.total_bounds
            
            buffer_info = {
                "distance": dist,
                "buffer_distance_used": buffer_distance,
                "bounds": list(buffer_bounds),
                "total_area": float(buffered_geom.area.sum()) if gdf.crs and not gdf.crs.is_geographic else None
            }
            results["buffer_results"].append(buffer_info)
            
        except Exception as e:
            buffer_info = {
                "distance": dist,
                "error": f"Buffer failed: {str(e)}"
            }
            results["buffer_results"].append(buffer_info)
    
    return results

# --- Dissolve Operations ---

@mcp.tool()
def dissolve_features(path: str, dissolve_field: str = None) -> dict:
    """Dissolve features by attribute field or dissolve all features."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    original_count = len(gdf)
    
    try:
        if dissolve_field and dissolve_field in gdf.columns:
            # Dissolve by field
            dissolved = gdf.dissolve(by=dissolve_field, as_index=False)
            dissolved_count = len(dissolved)
            unique_values = gdf[dissolve_field].nunique()
            
            # Get value counts for the dissolve field
            value_counts = gdf[dissolve_field].value_counts().head(10).to_dict()
            
        else:
            # Dissolve all features into one
            dissolved = gdf.dissolve(as_index=False)
            dissolved_count = len(dissolved)
            unique_values = 1
            value_counts = None
        
        # Calculate areas if possible
        original_area = gdf.geometry.area.sum() if gdf.crs and not gdf.crs.is_geographic else None
        dissolved_area = dissolved.geometry.area.sum() if gdf.crs and not gdf.crs.is_geographic else None
        
        result = {
            "file_path": str(p),
            "original_features": original_count,
            "dissolved_features": dissolved_count,
            "dissolve_field": dissolve_field,
            "unique_values": unique_values,
            "bounds": list(dissolved.total_bounds),
            "crs": gdf.crs.to_string() if gdf.crs else None
        }
        
        if value_counts:
            result["field_value_counts"] = {str(k): int(v) for k, v in value_counts.items()}
        
        if original_area is not None and dissolved_area is not None:
            result["area_analysis"] = {
                "original_total_area": float(original_area),
                "dissolved_total_area": float(dissolved_area),
                "area_preserved": abs(dissolved_area - original_area) < 0.01
            }
        
        return result
        
    except Exception as e:
        return {"error": f"Dissolve operation failed: {str(e)}", "file_path": str(p)}

# --- Spatial Join Operations ---

@mcp.tool()
def spatial_join_analysis(target_path: str, join_path: str, how: str = "inner", op: str = "intersects") -> dict:
    """Perform spatial join between two vector datasets and return analysis."""
    target_p = validate_vector_file(target_path)
    join_p = validate_vector_file(join_path)
    
    target_gdf = gpd.read_file(target_p)
    join_gdf = gpd.read_file(join_p)
    
    if target_gdf.empty or join_gdf.empty:
        return {"error": "One or both datasets are empty"}
    
    # Validate spatial join parameters
    valid_how = ["left", "right", "outer", "inner"]
    valid_ops = ["intersects", "within", "contains", "overlaps", "crosses", "touches"]
    
    if how not in valid_how:
        raise ValueError(f"how must be one of: {valid_how}")
    if op not in valid_ops:
        raise ValueError(f"op must be one of: {valid_ops}")
    
    try:
        # Ensure same CRS
        target_gdf, join_gdf = ensure_same_crs(target_gdf, join_gdf)
        
        # Perform spatial join
        result_gdf = gpd.sjoin(target_gdf, join_gdf, how=how, predicate=op)
        
        # Calculate join statistics
        matched_target_features = len(result_gdf.index.unique()) if not result_gdf.empty else 0
        
        # Analyze join results
        join_stats = {
            "target_file": str(target_p),
            "join_file": str(join_p),
            "target_features": len(target_gdf),
            "join_features": len(join_gdf),
            "result_features": len(result_gdf),
            "join_operation": op,
            "join_type": how,
            "matched_target_features": matched_target_features,
            "crs": result_gdf.crs.to_string() if not result_gdf.empty and result_gdf.crs else None
        }
        
        # Calculate match percentages
        if len(target_gdf) > 0:
            join_stats["match_percentage"] = round(100 * matched_target_features / len(target_gdf), 1)
        
        # Analyze attribute overlap
        if not result_gdf.empty:
            target_cols = set(target_gdf.columns) - {'geometry'}
            join_cols = set(join_gdf.columns) - {'geometry'}
            result_cols = set(result_gdf.columns) - {'geometry'}
            
            join_stats["column_analysis"] = {
                "target_columns": len(target_cols),
                "join_columns": len(join_cols),
                "result_columns": len(result_cols),
                "new_columns_added": len(result_cols - target_cols)
            }
        
        return join_stats
        
    except Exception as e:
        return {"error": f"Spatial join failed: {str(e)}", "target_file": str(target_p), "join_file": str(join_p)}

@mcp.tool()
def proximity_analysis(target_path: str, reference_path: str, max_distance: float = 1000) -> dict:
    """Analyze proximity between features in two datasets."""
    target_p = validate_vector_file(target_path)
    ref_p = validate_vector_file(reference_path)
    
    target_gdf = gpd.read_file(target_p)
    ref_gdf = gpd.read_file(ref_p)
    
    if target_gdf.empty or ref_gdf.empty:
        return {"error": "One or both datasets are empty"}
    
    try:
        # Ensure same CRS
        target_gdf, ref_gdf = ensure_same_crs(target_gdf, ref_gdf)
        
        # Calculate distances (simplified approach for first few features)
        sample_size = min(100, len(target_gdf))  # Limit for performance
        distances = []
        
        for idx, target_geom in target_gdf.head(sample_size).geometry.items():
            if target_geom and not target_geom.is_empty:
                min_dist = ref_gdf.geometry.distance(target_geom).min()
                distances.append(float(min_dist))
        
        if not distances:
            return {"error": "No valid distances calculated"}
        
        # Analyze distances
        distances_array = pd.Series(distances)
        
        result = {
            "target_file": str(target_p),
            "reference_file": str(ref_p),
            "analyzed_features": len(distances),
            "total_target_features": len(target_gdf),
            "max_distance_threshold": max_distance,
            "distance_statistics": {
                "min_distance": float(distances_array.min()),
                "max_distance": float(distances_array.max()),
                "mean_distance": float(distances_array.mean()),
                "median_distance": float(distances_array.median()),
                "std_distance": float(distances_array.std())
            },
            "proximity_analysis": {
                "within_threshold": int((distances_array <= max_distance).sum()),
                "beyond_threshold": int((distances_array > max_distance).sum()),
                "percentage_within": round(100 * (distances_array <= max_distance).mean(), 1)
            },
            "crs": target_gdf.crs.to_string() if target_gdf.crs else None
        }
        
        return result
        
    except Exception as e:
        return {"error": f"Proximity analysis failed: {str(e)}", "target_file": str(target_p), "reference_file": str(ref_p)}

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)