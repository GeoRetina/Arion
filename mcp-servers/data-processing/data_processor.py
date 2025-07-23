"""
Data Processing MCP Server - Tools for data manipulation, analysis, and transformation.
Handles CSV, JSON, Excel files and various data processing operations.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" pandas numpy openpyxl xlrd
"""

from mcp.server.fastmcp import FastMCP
from pathlib import Path
import pandas as pd
import numpy as np
import json
import sys
from typing import Dict, List, Any, Optional

# Initialize MCP server
mcp = FastMCP(name="Data-Processing-Tools")

# --- Helper Functions ---

def validate_file_path(path: str) -> Path:
    """Validate and return Path object."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")
    return p

def detect_file_type(path: Path) -> str:
    """Detect file type based on extension."""
    suffix = path.suffix.lower()
    if suffix in ['.csv', '.tsv']:
        return 'csv'
    elif suffix in ['.xlsx', '.xls']:
        return 'excel'
    elif suffix == '.json':
        return 'json'
    elif suffix == '.parquet':
        return 'parquet'
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

# --- File Reading and Basic Info ---

@mcp.tool()
def file_info(path: str) -> dict:
    """Get basic information about a data file."""
    p = validate_file_path(path)
    file_type = detect_file_type(p)
    
    try:
        if file_type == 'csv':
            df = pd.read_csv(p, nrows=0)  # Just get headers
            sample_df = pd.read_csv(p, nrows=5)
        elif file_type == 'excel':
            df = pd.read_excel(p, nrows=0)
            sample_df = pd.read_excel(p, nrows=5)
        elif file_type == 'json':
            with open(p, 'r') as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                df = pd.DataFrame(data[:0])  # Just structure
                sample_df = pd.DataFrame(data[:5])
            else:
                return {"file_type": "json", "structure": "non-tabular", "sample": str(data)[:500]}
        elif file_type == 'parquet':
            df = pd.read_parquet(p)
            sample_df = df.head(5)
        
        return {
            "file_path": str(p),
            "file_type": file_type,
            "columns": list(df.columns),
            "column_count": len(df.columns),
            "dtypes": df.dtypes.astype(str).to_dict(),
            "sample_data": sample_df.to_dict('records') if not sample_df.empty else []
        }
    except Exception as e:
        return {"error": f"Failed to read file: {str(e)}", "file_path": str(p)}

@mcp.tool()
def data_summary(path: str, max_rows: int = None) -> dict:
    """Get comprehensive summary statistics for a dataset."""
    p = validate_file_path(path)
    file_type = detect_file_type(p)
    
    try:
        if file_type == 'csv':
            df = pd.read_csv(p, nrows=max_rows)
        elif file_type == 'excel':
            df = pd.read_excel(p, nrows=max_rows)
        elif file_type == 'json':
            with open(p, 'r') as f:
                data = json.load(f)
            if isinstance(data, list):
                df = pd.DataFrame(data[:max_rows] if max_rows else data)
            else:
                return {"error": "JSON file is not a list of records"}
        elif file_type == 'parquet':
            df = pd.read_parquet(p)
            if max_rows:
                df = df.head(max_rows)
        
        summary = {
            "file_path": str(p),
            "shape": {"rows": len(df), "columns": len(df.columns)},
            "columns": list(df.columns),
            "memory_usage": df.memory_usage(deep=True).sum(),
            "missing_values": df.isnull().sum().to_dict(),
            "data_types": df.dtypes.astype(str).to_dict()
        }
        
        # Numeric statistics
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 0:
            summary["numeric_stats"] = df[numeric_cols].describe().to_dict()
        
        # Categorical statistics
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns
        if len(categorical_cols) > 0:
            summary["categorical_stats"] = {}
            for col in categorical_cols[:5]:  # Limit to first 5 categorical columns
                summary["categorical_stats"][col] = {
                    "unique_count": df[col].nunique(),
                    "top_values": df[col].value_counts().head(5).to_dict()
                }
        
        return summary
    except Exception as e:
        return {"error": f"Failed to analyze file: {str(e)}", "file_path": str(p)}

# --- Data Filtering and Querying ---

@mcp.tool()
def filter_data(path: str, column: str, operator: str, value: Any, output_path: str = None) -> dict:
    """Filter data based on column conditions."""
    p = validate_file_path(path)
    file_type = detect_file_type(p)
    
    try:
        if file_type == 'csv':
            df = pd.read_csv(p)
        elif file_type == 'excel':
            df = pd.read_excel(p)
        elif file_type == 'json':
            with open(p, 'r') as f:
                data = json.load(f)
            df = pd.DataFrame(data)
        elif file_type == 'parquet':
            df = pd.read_parquet(p)
        
        if column not in df.columns:
            raise ValueError(f"Column '{column}' not found in data")
        
        # Apply filter based on operator
        if operator == "==":
            filtered_df = df[df[column] == value]
        elif operator == "!=":
            filtered_df = df[df[column] != value]
        elif operator == ">":
            filtered_df = df[df[column] > value]
        elif operator == ">=":
            filtered_df = df[df[column] >= value]
        elif operator == "<":
            filtered_df = df[df[column] < value]
        elif operator == "<=":
            filtered_df = df[df[column] <= value]
        elif operator == "contains":
            filtered_df = df[df[column].astype(str).str.contains(str(value), na=False)]
        elif operator == "in":
            if not isinstance(value, list):
                raise ValueError("For 'in' operator, value must be a list")
            filtered_df = df[df[column].isin(value)]
        else:
            raise ValueError(f"Unsupported operator: {operator}")
        
        result = {
            "original_rows": len(df),
            "filtered_rows": len(filtered_df),
            "filter": {"column": column, "operator": operator, "value": value},
            "sample_results": filtered_df.head(10).to_dict('records')
        }
        
        # Save filtered data if output path provided
        if output_path:
            output_p = Path(output_path).expanduser().resolve()
            if output_p.suffix.lower() == '.csv':
                filtered_df.to_csv(output_p, index=False)
            elif output_p.suffix.lower() == '.json':
                filtered_df.to_json(output_p, orient='records', indent=2)
            result["saved_to"] = str(output_p)
        
        return result
    except Exception as e:
        return {"error": f"Failed to filter data: {str(e)}", "file_path": str(p)}

@mcp.tool()
def group_and_aggregate(path: str, group_by: List[str], aggregations: Dict[str, str], output_path: str = None) -> dict:
    """Group data and perform aggregations."""
    p = validate_file_path(path)
    file_type = detect_file_type(p)
    
    try:
        if file_type == 'csv':
            df = pd.read_csv(p)
        elif file_type == 'excel':
            df = pd.read_excel(p)
        elif file_type == 'json':
            with open(p, 'r') as f:
                data = json.load(f)
            df = pd.DataFrame(data)
        elif file_type == 'parquet':
            df = pd.read_parquet(p)
        
        # Validate group_by columns
        missing_cols = [col for col in group_by if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Columns not found: {missing_cols}")
        
        # Validate aggregation columns
        agg_missing = [col for col in aggregations.keys() if col not in df.columns]
        if agg_missing:
            raise ValueError(f"Aggregation columns not found: {agg_missing}")
        
        # Perform grouping and aggregation
        grouped = df.groupby(group_by).agg(aggregations).reset_index()
        
        # Flatten column names if they're MultiIndex
        if isinstance(grouped.columns, pd.MultiIndex):
            grouped.columns = ['_'.join(col).strip() if col[1] else col[0] for col in grouped.columns.values]
        
        result = {
            "original_rows": len(df),
            "grouped_rows": len(grouped),
            "group_by": group_by,
            "aggregations": aggregations,
            "sample_results": grouped.head(10).to_dict('records')
        }
        
        # Save aggregated data if output path provided
        if output_path:
            output_p = Path(output_path).expanduser().resolve()
            if output_p.suffix.lower() == '.csv':
                grouped.to_csv(output_p, index=False)
            elif output_p.suffix.lower() == '.json':
                grouped.to_json(output_p, orient='records', indent=2)
            result["saved_to"] = str(output_p)
        
        return result
    except Exception as e:
        return {"error": f"Failed to group and aggregate: {str(e)}", "file_path": str(p)}

# --- Data Transformation ---

@mcp.tool()
def merge_datasets(path1: str, path2: str, on: List[str], how: str = "inner", output_path: str = None) -> dict:
    """Merge two datasets on specified columns."""
    p1 = validate_file_path(path1)
    p2 = validate_file_path(path2)
    
    try:
        # Read first dataset
        if p1.suffix.lower() == '.csv':
            df1 = pd.read_csv(p1)
        elif p1.suffix.lower() in ['.xlsx', '.xls']:
            df1 = pd.read_excel(p1)
        elif p1.suffix.lower() == '.json':
            with open(p1, 'r') as f:
                data1 = json.load(f)
            df1 = pd.DataFrame(data1)
        
        # Read second dataset
        if p2.suffix.lower() == '.csv':
            df2 = pd.read_csv(p2)
        elif p2.suffix.lower() in ['.xlsx', '.xls']:
            df2 = pd.read_excel(p2)
        elif p2.suffix.lower() == '.json':
            with open(p2, 'r') as f:
                data2 = json.load(f)
            df2 = pd.DataFrame(data2)
        
        # Validate merge columns
        missing_cols_1 = [col for col in on if col not in df1.columns]
        missing_cols_2 = [col for col in on if col not in df2.columns]
        if missing_cols_1 or missing_cols_2:
            raise ValueError(f"Merge columns missing - Dataset 1: {missing_cols_1}, Dataset 2: {missing_cols_2}")
        
        # Perform merge
        merged_df = pd.merge(df1, df2, on=on, how=how)
        
        result = {
            "dataset1_rows": len(df1),
            "dataset2_rows": len(df2),
            "merged_rows": len(merged_df),
            "merge_columns": on,
            "merge_type": how,
            "sample_results": merged_df.head(10).to_dict('records')
        }
        
        # Save merged data if output path provided
        if output_path:
            output_p = Path(output_path).expanduser().resolve()
            if output_p.suffix.lower() == '.csv':
                merged_df.to_csv(output_p, index=False)
            elif output_p.suffix.lower() == '.json':
                merged_df.to_json(output_p, orient='records', indent=2)
            result["saved_to"] = str(output_p)
        
        return result
    except Exception as e:
        return {"error": f"Failed to merge datasets: {str(e)}", "paths": [str(p1), str(p2)]}

@mcp.tool()
def pivot_data(path: str, index: List[str], columns: str, values: str, aggfunc: str = "mean", output_path: str = None) -> dict:
    """Create pivot table from data."""
    p = validate_file_path(path)
    file_type = detect_file_type(p)
    
    try:
        if file_type == 'csv':
            df = pd.read_csv(p)
        elif file_type == 'excel':
            df = pd.read_excel(p)
        elif file_type == 'json':
            with open(p, 'r') as f:
                data = json.load(f)
            df = pd.DataFrame(data)
        elif file_type == 'parquet':
            df = pd.read_parquet(p)
        
        # Validate columns
        all_cols = index + [columns, values]
        missing_cols = [col for col in all_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Columns not found: {missing_cols}")
        
        # Create pivot table
        pivot_df = pd.pivot_table(df, index=index, columns=columns, values=values, aggfunc=aggfunc)
        pivot_df = pivot_df.reset_index()
        
        result = {
            "original_rows": len(df),
            "pivot_rows": len(pivot_df),
            "pivot_columns": len(pivot_df.columns),
            "index_columns": index,
            "pivot_column": columns,
            "values_column": values,
            "aggregation_function": aggfunc,
            "sample_results": pivot_df.head(10).to_dict('records')
        }
        
        # Save pivoted data if output path provided
        if output_path:
            output_p = Path(output_path).expanduser().resolve()
            if output_p.suffix.lower() == '.csv':
                pivot_df.to_csv(output_p, index=False)
            elif output_p.suffix.lower() == '.json':
                pivot_df.to_json(output_p, orient='records', indent=2)
            result["saved_to"] = str(output_p)
        
        return result
    except Exception as e:
        return {"error": f"Failed to pivot data: {str(e)}", "file_path": str(p)}

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)