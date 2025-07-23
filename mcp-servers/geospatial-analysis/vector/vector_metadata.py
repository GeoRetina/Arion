"""
Vector Metadata MCP Server - Basic vector information and statistics.
Handles vector metadata extraction, attribute statistics, and dataset overview.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" geopandas shapely pyproj pandas
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import geopandas as gpd
import pandas as pd
import numpy as np
import sys

# Initialize MCP server
mcp = FastMCP(name="Vector-Metadata-Tools")

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

# --- Basic Information Tools ---

@mcp.tool()
def vector_info(path: str) -> dict:
    """Get comprehensive information about a vector dataset."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    info = gdf_to_summary(gdf)
    info["file_path"] = str(p)
    info["file_size_mb"] = round(p.stat().st_size / 1024 / 1024, 2)
    
    # Add geometry-specific information
    if not gdf.empty:
        info["geometry_info"] = {
            "valid_geometries": int(gdf.geometry.is_valid.sum()),
            "invalid_geometries": int((~gdf.geometry.is_valid).sum()),
            "empty_geometries": int(gdf.geometry.is_empty.sum()),
            "null_geometries": int(gdf.geometry.isnull().sum())
        }
        
        # Add attribute column information
        non_geom_cols = [col for col in gdf.columns if col != 'geometry']
        info["attribute_columns"] = len(non_geom_cols)
        info["column_details"] = {}
        
        for col in non_geom_cols[:10]:  # Limit to first 10 columns
            col_info = {
                "dtype": str(gdf[col].dtype),
                "null_count": int(gdf[col].isnull().sum()),
                "unique_count": int(gdf[col].nunique())
            }
            info["column_details"][col] = col_info
    
    return info

@mcp.tool()
def vector_overview(path: str) -> dict:
    """Get a quick overview of vector dataset characteristics."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Basic overview
    overview = {
        "file_path": str(p),
        "feature_count": len(gdf),
        "column_count": len(gdf.columns) - 1,  # Exclude geometry column
        "primary_geometry_type": gdf.geometry.type.mode().iloc[0] if not gdf.geometry.type.empty else None,
        "coordinate_system": gdf.crs.to_string() if gdf.crs else "No CRS defined",
        "spatial_extent": {
            "minx": float(gdf.total_bounds[0]),
            "miny": float(gdf.total_bounds[1]),
            "maxx": float(gdf.total_bounds[2]),
            "maxy": float(gdf.total_bounds[3])
        }
    }
    
    # Data quality indicators
    overview["data_quality"] = {
        "valid_geometries_pct": round(100 * gdf.geometry.is_valid.mean(), 1),
        "complete_attributes_pct": round(100 * (1 - gdf.isnull().any(axis=1).mean()), 1),
        "duplicate_geometries": int(gdf.geometry.duplicated().sum())
    }
    
    return overview

@mcp.tool()
def vector_bounds(path: str, to_crs: str = "EPSG:4326") -> dict:
    """Get bounds of vector dataset, optionally reprojected to specified CRS."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"bounds": None, "crs": None, "file_path": str(p)}
    
    # Reproject if requested and different from current CRS
    original_crs = gdf.crs.to_string() if gdf.crs else None
    if to_crs and gdf.crs and gdf.crs.to_string() != to_crs:
        try:
            gdf_proj = gdf.to_crs(to_crs)
            bounds = gdf_proj.total_bounds
            result_crs = to_crs
        except Exception as e:
            # If reprojection fails, use original bounds
            bounds = gdf.total_bounds
            result_crs = original_crs
            return {
                "error": f"Reprojection failed: {str(e)}",
                "bounds": {
                    "minx": float(bounds[0]), "miny": float(bounds[1]),
                    "maxx": float(bounds[2]), "maxy": float(bounds[3])
                },
                "crs": result_crs,
                "original_crs": original_crs
            }
    else:
        bounds = gdf.total_bounds
        result_crs = original_crs
    
    return {
        "bounds": {
            "minx": float(bounds[0]),
            "miny": float(bounds[1]),
            "maxx": float(bounds[2]),
            "maxy": float(bounds[3])
        },
        "crs": result_crs,
        "original_crs": original_crs,
        "file_path": str(p)
    }

# --- Attribute Analysis Tools ---

@mcp.tool()
def attribute_statistics(path: str, column_name: str = None) -> dict:
    """Get detailed statistics for vector dataset attributes."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Get non-geometry columns
    attribute_cols = [col for col in gdf.columns if col != 'geometry']
    
    if column_name:
        if column_name not in attribute_cols:
            return {"error": f"Column '{column_name}' not found", "available_columns": attribute_cols}
        columns_to_analyze = [column_name]
    else:
        columns_to_analyze = attribute_cols[:10]  # Limit to first 10 columns
    
    statistics = {}
    
    for col in columns_to_analyze:
        col_data = gdf[col]
        col_stats = {
            "data_type": str(col_data.dtype),
            "total_count": len(col_data),
            "null_count": int(col_data.isnull().sum()),
            "unique_count": int(col_data.nunique())
        }
        
        # Numeric statistics
        if pd.api.types.is_numeric_dtype(col_data):
            non_null_data = col_data.dropna()
            if len(non_null_data) > 0:
                col_stats["numeric_stats"] = {
                    "min": float(non_null_data.min()),
                    "max": float(non_null_data.max()),
                    "mean": float(non_null_data.mean()),
                    "median": float(non_null_data.median()),
                    "std": float(non_null_data.std()) if len(non_null_data) > 1 else 0
                }
        
        # Categorical statistics (for non-numeric or low-cardinality numeric)
        if not pd.api.types.is_numeric_dtype(col_data) or col_data.nunique() <= 20:
            value_counts = col_data.value_counts().head(10)
            col_stats["top_values"] = {
                str(val): int(count) for val, count in value_counts.items()
            }
        
        statistics[col] = col_stats
    
    return {
        "file_path": str(p),
        "analyzed_columns": len(statistics),
        "total_columns": len(attribute_cols),
        "column_statistics": statistics
    }

@mcp.tool()
def geometry_validity(path: str) -> dict:
    """Check geometry validity and provide detailed geometry information."""
    p = validate_vector_file(path)
    gdf = gpd.read_file(p)
    
    if gdf.empty:
        return {"error": "Dataset is empty", "file_path": str(p)}
    
    # Geometry validity analysis
    validity_info = {
        "file_path": str(p),
        "total_features": len(gdf),
        "geometry_analysis": {
            "valid_count": int(gdf.geometry.is_valid.sum()),
            "invalid_count": int((~gdf.geometry.is_valid).sum()),
            "empty_count": int(gdf.geometry.is_empty.sum()),
            "null_count": int(gdf.geometry.isnull().sum())
        }
    }
    
    # Geometry type distribution
    geom_types = gdf.geometry.type.value_counts()
    validity_info["geometry_types"] = {
        geom_type: int(count) for geom_type, count in geom_types.items()
    }
    
    # Identify invalid geometries (first few)
    invalid_geoms = gdf[~gdf.geometry.is_valid]
    if len(invalid_geoms) > 0:
        validity_info["invalid_geometry_samples"] = []
        for idx, row in invalid_geoms.head(5).iterrows():
            try:
                reason = row.geometry.is_valid_reason if hasattr(row.geometry, 'is_valid_reason') else "Unknown"
            except:
                reason = "Could not determine reason"
            
            validity_info["invalid_geometry_samples"].append({
                "feature_index": int(idx),
                "geometry_type": row.geometry.geom_type if row.geometry else "None",
                "invalid_reason": reason
            })
    
    # Calculate percentages
    total = len(gdf)
    validity_info["percentages"] = {
        "valid": round(100 * validity_info["geometry_analysis"]["valid_count"] / total, 1),
        "invalid": round(100 * validity_info["geometry_analysis"]["invalid_count"] / total, 1),
        "empty": round(100 * validity_info["geometry_analysis"]["empty_count"] / total, 1),
        "null": round(100 * validity_info["geometry_analysis"]["null_count"] / total, 1)
    }
    
    return validity_info

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)