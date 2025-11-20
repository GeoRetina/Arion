#!/usr/bin/env python3
"""
PostgreSQL MCP Server for Arion
Provides secure database operations including CRUD operations and complex spatial queries.

Dependencies (Python ≥3.10):
    pip install fastmcp psycopg2-binary sqlparse
"""

import json
import logging
import sys
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP
import sqlparse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP("PostgreSQL-Database-Tools")

# Global connections storage
_connections: Dict[str, psycopg2.extensions.connection] = {}

# --- Helper Functions ---

def is_safe_query(query: str) -> bool:
    """Check if a query is safe for execution (read-only)"""
    try:
        parsed = sqlparse.parse(query)
        if not parsed:
            return False
            
        # Check for dangerous statements
        dangerous_keywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE']
        
        for statement in parsed:
            # Get the first token that's not whitespace/comment
            first_token = None
            for token in statement.flatten():
                if token.ttype not in (sqlparse.tokens.Whitespace, sqlparse.tokens.Comment.Single, sqlparse.tokens.Comment.Multiline):
                    first_token = token
                    break
                    
            if first_token and first_token.value.upper() in dangerous_keywords:
                return False
                
        return True
    except Exception:
        return False

def execute_query(connection_id: str, query: str, params: Optional[List] = None) -> Dict[str, Any]:
    """Execute a query and return results"""
    if connection_id not in _connections:
        raise ValueError(f"No connection found for ID: {connection_id}")
        
    connection = _connections[connection_id]
    
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, params)
            
            # Handle different query types
            if query.strip().upper().startswith(('SELECT', 'WITH')):
                results = cursor.fetchall()
                return {
                    'rows': [dict(row) for row in results],
                    'row_count': len(results),
                    'columns': [desc[0] for desc in cursor.description] if cursor.description else []
                }
            else:
                connection.commit()
                return {
                    'rows': [],
                    'row_count': cursor.rowcount,
                    'columns': []
                }
                
    except Exception as e:
        connection.rollback()
        logger.error(f"Query execution failed: {e}")
        raise

# --- MCP Tools ---

@mcp.tool()
def connect_database(
    connection_id: str,
    host: str,
    database: str,
    username: str,
    password: str,
    port: int = 5432,
    ssl: bool = False
) -> str:
    """
    Connect to a PostgreSQL database.
    
    Args:
        connection_id: Unique identifier for this connection
        host: Database host
        database: Database name
        username: Username
        password: Password
        port: Database port (default: 5432)
        ssl: Use SSL connection (default: False)
    
    Returns:
        Success message with connection details
    """
    try:
        # Close existing connection if it exists
        if connection_id in _connections:
            _connections[connection_id].close()
            
        # Create new connection
        connection = psycopg2.connect(
            host=host,
            port=port,
            database=database,
            user=username,
            password=password,
            sslmode='require' if ssl else 'disable'
        )
        
        _connections[connection_id] = connection
        logger.info(f"Connected to PostgreSQL database: {connection_id}")
        
        return f"Successfully connected to database: {connection_id} at {host}:{port}/{database}"
        
    except Exception as e:
        logger.error(f"Failed to connect to database {connection_id}: {e}")
        raise

@mcp.tool()
def describe_schema(
    connection_id: str,
    schema_name: str = "public",
    table_name: Optional[str] = None
) -> str:
    """
    Get database schema information including tables, columns, and spatial data.
    
    Args:
        connection_id: Database connection ID
        schema_name: Schema name (default: public)
        table_name: Specific table name (optional)
    
    Returns:
        JSON string with schema information
    """
    if table_name:
        # Describe specific table
        query = """
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """
        result = execute_query(connection_id, query, [schema_name, table_name])
        
        # Check for spatial columns
        spatial_query = """
        SELECT 
            f_geometry_column,
            coord_dimension,
            srid,
            type
        FROM geometry_columns
        WHERE f_table_schema = %s AND f_table_name = %s
        """
        try:
            spatial_result = execute_query(connection_id, spatial_query, [schema_name, table_name])
        except:
            spatial_result = {"rows": []}
        
        return json.dumps({
            "table": table_name,
            "columns": result["rows"],
            "spatial_columns": spatial_result["rows"]
        }, indent=2)
        
    else:
        # List all tables
        query = """
        SELECT 
            table_name,
            table_type
        FROM information_schema.tables 
        WHERE table_schema = %s
        ORDER BY table_name
        """
        result = execute_query(connection_id, query, [schema_name])
        
        return json.dumps({
            "schema": schema_name,
            "tables": result["rows"]
        }, indent=2)

@mcp.tool()
def execute_select_query(
    connection_id: str,
    query: str,
    parameters: Optional[List] = None,
    limit: int = 1000
) -> str:
    """
    Execute complex SELECT queries safely (read-only operations).
    
    Args:
        connection_id: Database connection ID
        query: SELECT query to execute
        parameters: Query parameters (default: [])
        limit: Maximum number of rows to return (default: 1000)
    
    Returns:
        JSON string with query results
    """
    if parameters is None:
        parameters = []
        
    # Safety check
    if not is_safe_query(query):
        raise ValueError("Only SELECT queries are allowed for safety")
        
    # Add limit if not present
    if "LIMIT" not in query.upper():
        query += f" LIMIT {limit}"
        
    result = execute_query(connection_id, query, parameters)
    return json.dumps(result, indent=2, default=str)

@mcp.tool()
def execute_spatial_query(
    connection_id: str,
    query: str,
    parameters: Optional[List] = None,
    geometry_format: str = "WKT"
) -> str:
    """
    Execute PostGIS spatial analysis queries.
    
    Args:
        connection_id: Database connection ID
        query: Spatial query with PostGIS functions
        parameters: Query parameters (default: [])
        geometry_format: Geometry output format (WKT or GeoJSON, default: WKT)
    
    Returns:
        JSON string with spatial query results
    """
    if parameters is None:
        parameters = []
        
    # Safety check
    if not is_safe_query(query):
        raise ValueError("Only SELECT queries are allowed for safety")
        
    # Note: For full GeoJSON support, we'd need more sophisticated query parsing
    # This is a simplified implementation
    if geometry_format == "GeoJSON":
        # Basic GeoJSON conversion - would need enhancement for production use
        query = query.replace("geom", "ST_AsGeoJSON(geom) as geom_json")
        
    result = execute_query(connection_id, query, parameters)
    return json.dumps(result, indent=2, default=str)

@mcp.tool()
def insert_record(
    connection_id: str,
    table_name: str,
    data: Dict[str, Any],
    schema_name: str = "public"
) -> str:
    """
    Insert a new record into a table.
    
    Args:
        connection_id: Database connection ID
        table_name: Table name
        data: Column-value pairs to insert
        schema_name: Schema name (default: public)
    
    Returns:
        Success message with rows affected
    """
    # Build parameterized INSERT query
    columns = list(data.keys())
    values = list(data.values())
    placeholders = ["%s"] * len(values)
    
    query = f"""
    INSERT INTO {schema_name}.{table_name} ({', '.join(columns)})
    VALUES ({', '.join(placeholders)})
    """
    
    result = execute_query(connection_id, query, values)
    
    return json.dumps({
        "message": "Record inserted successfully",
        "rows_affected": result["row_count"]
    }, indent=2)

@mcp.tool()
def update_record(
    connection_id: str,
    table_name: str,
    data: Dict[str, Any],
    where_clause: Dict[str, Any],
    schema_name: str = "public"
) -> str:
    """
    Update existing records in a table.
    
    Args:
        connection_id: Database connection ID
        table_name: Table name
        data: Column-value pairs to update
        where_clause: WHERE conditions
        schema_name: Schema name (default: public)
    
    Returns:
        Success message with rows affected
    """
    # Build parameterized UPDATE query
    set_clauses = [f"{col} = %s" for col in data.keys()]
    where_clauses = [f"{col} = %s" for col in where_clause.keys()]
    
    query = f"""
    UPDATE {schema_name}.{table_name}
    SET {', '.join(set_clauses)}
    WHERE {' AND '.join(where_clauses)}
    """
    
    parameters = list(data.values()) + list(where_clause.values())
    result = execute_query(connection_id, query, parameters)
    
    return json.dumps({
        "message": "Records updated successfully",
        "rows_affected": result["row_count"]
    }, indent=2)

@mcp.tool()
def delete_record(
    connection_id: str,
    table_name: str,
    where_clause: Dict[str, Any],
    schema_name: str = "public"
) -> str:
    """
    Delete records from a table.
    
    Args:
        connection_id: Database connection ID
        table_name: Table name
        where_clause: WHERE conditions
        schema_name: Schema name (default: public)
    
    Returns:
        Success message with rows affected
    """
    # Build parameterized DELETE query
    where_clauses = [f"{col} = %s" for col in where_clause.keys()]
    
    query = f"""
    DELETE FROM {schema_name}.{table_name}
    WHERE {' AND '.join(where_clauses)}
    """
    
    parameters = list(where_clause.values())
    result = execute_query(connection_id, query, parameters)
    
    return json.dumps({
        "message": "Records deleted successfully",
        "rows_affected": result["row_count"]
    }, indent=2)

@mcp.tool()
def get_table_statistics(
    connection_id: str,
    table_name: str,
    schema_name: str = "public"
) -> str:
    """
    Get table statistics including row counts and spatial extent.
    
    Args:
        connection_id: Database connection ID
        table_name: Table name
        schema_name: Schema name (default: public)
    
    Returns:
        JSON string with table statistics
    """
    # Get basic statistics
    query = f"SELECT COUNT(*) as row_count FROM {schema_name}.{table_name}"
    result = execute_query(connection_id, query)
    
    stats = {"row_count": result["rows"][0]["row_count"]}
    
    # Get spatial extent if there are geometry columns
    spatial_query = """
    SELECT f_geometry_column
    FROM geometry_columns
    WHERE f_table_schema = %s AND f_table_name = %s
    """
    
    try:
        spatial_result = execute_query(connection_id, spatial_query, [schema_name, table_name])
        
        if spatial_result["rows"]:
            geom_col = spatial_result["rows"][0]["f_geometry_column"]
            extent_query = f"""
            SELECT 
                ST_XMin(ST_Extent({geom_col})) as min_x,
                ST_YMin(ST_Extent({geom_col})) as min_y,
                ST_XMax(ST_Extent({geom_col})) as max_x,
                ST_YMax(ST_Extent({geom_col})) as max_y
            FROM {schema_name}.{table_name}
            """
            extent_result = execute_query(connection_id, extent_query)
            stats["spatial_extent"] = extent_result["rows"][0]
    except:
        # PostGIS might not be available
        pass
        
    return json.dumps(stats, indent=2, default=str)

@mcp.tool()
def list_connections() -> str:
    """
    List all active database connections.
    
    Returns:
        JSON string with connection IDs
    """
    connections = list(_connections.keys())
    return json.dumps({
        "active_connections": connections,
        "count": len(connections)
    }, indent=2)

@mcp.tool()
def close_connection(connection_id: str) -> str:
    """
    Close a database connection.
    
    Args:
        connection_id: Database connection ID to close
    
    Returns:
        Success message
    """
    if connection_id in _connections:
        _connections[connection_id].close()
        del _connections[connection_id]
        logger.info(f"Closed database connection: {connection_id}")
        return f"Successfully closed connection: {connection_id}"
    else:
        return f"No connection found with ID: {connection_id}"

# --- Cleanup on exit ---
def cleanup_connections():
    """Clean up all database connections on exit"""
    for connection_id, connection in _connections.items():
        try:
            connection.close()
            logger.info(f"Closed connection: {connection_id}")
        except:
            pass
    _connections.clear()

# Register cleanup handler
import atexit
atexit.register(cleanup_connections)

if __name__ == "__main__":
    print("PostgreSQL MCP Server starting...")
    print("Available tools:")
    print("  - connect_database - Connect to PostgreSQL database")
    print("  - describe_schema - Get database schema information")
    print("  - execute_select_query - Run complex SELECT queries safely")
    print("  - execute_spatial_query - Run PostGIS spatial queries")
    print("  - insert_record - Insert new records")
    print("  - update_record - Update existing records")
    print("  - delete_record - Delete records")
    print("  - get_table_statistics - Get table statistics")
    print("  - list_connections - List active connections")
    print("  - close_connection - Close database connection")
    print()

    try:
        mcp.run()
    except KeyboardInterrupt:
        print("\nServer shutting down...")
        cleanup_connections()
    except Exception as e:
        print(f"Server error: {e}")
        cleanup_connections()
        sys.exit(1)