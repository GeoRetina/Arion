# PostgreSQL MCP Server

A FastMCP-based Model Context Protocol (MCP) server that provides secure access to PostgreSQL databases with PostGIS spatial capabilities.

## Features

### 🔐 **Safe Operations**
- **Read-only complex queries**: Execute sophisticated SELECT queries with safety validation
- **Parametric CRUD operations**: Secure INSERT, UPDATE, DELETE with parameter binding
- **SQL injection prevention**: All queries use parameterized statements

### 🗺️ **Spatial Analysis**
- **PostGIS integration**: Full support for spatial functions and operations
- **Geometry format conversion**: Output as WKT or GeoJSON
- **Spatial statistics**: Calculate extents, distances, and spatial relationships

### 🔍 **Schema Inspection**
- **Database structure**: List tables, columns, and data types
- **Spatial metadata**: Identify geometry columns and spatial reference systems
- **Table statistics**: Row counts and spatial extents

## Tools Available

### Connection Management
- `connect_database` - Establish database connections
- `list_connections` - Show active database connections
- `close_connection` - Close database connections

### Schema & Metadata
- `describe_schema` - Get table and column information
- `get_table_statistics` - Table statistics including spatial extent

### Safe Retrieval
- `execute_select_query` - Run complex SELECT queries (read-only)
- `execute_spatial_query` - PostGIS spatial analysis queries

### Parametric CRUD
- `insert_record` - Insert new records with validation
- `update_record` - Update existing records safely
- `delete_record` - Delete records with WHERE conditions

## Installation

```bash
cd mcp-servers/postgresql
pip install -r requirements.txt
```

## Dependencies

- **FastMCP**: `fastmcp>=2.10.6`
- **PostgreSQL**: `psycopg2-binary>=2.9.10`
- **SQL Parsing**: `sqlparse>=0.5.3`

## Usage with FastMCP

### Starting the Server
```bash
python postgresql_server.py
```

### LLM Integration Examples

The LLM can interact with the PostgreSQL MCP server through natural language:

#### 1. Database Connection
**User:** "Connect to my local PostgreSQL database"
**Tool Call:** `connect_database`
```json
{
  "connection_id": "local_gis",
  "host": "localhost",
  "database": "geospatial_db",
  "username": "gis_user",
  "password": "password123",
  "port": 5432,
  "ssl": false
}
```

#### 2. Complex Spatial Analysis
**User:** "Find all restaurants within 500 meters of downtown"
**Tool Call:** `execute_spatial_query`
```json
{
  "connection_id": "local_gis",
  "query": "SELECT name, address, ST_Distance(location, ST_GeomFromText('POINT(-122.4194 37.7749)', 4326)) as distance FROM buildings WHERE building_type = 'restaurant' AND ST_DWithin(location, ST_GeomFromText('POINT(-122.4194 37.7749)', 4326), 500) ORDER BY distance",
  "geometry_format": "WKT"
}
```

#### 3. Parametric Data Operations
**User:** "Add a new hospital to the database"
**Tool Call:** `insert_record`
```json
{
  "connection_id": "local_gis",
  "table_name": "buildings",
  "data": {
    "name": "Central General Hospital",
    "address": "123 Medical Center Dr",
    "building_type": "hospital",
    "location": "POINT(-122.4194 37.7749)",
    "capacity": 500
  }
}
```

#### 4. Advanced Geospatial Queries
**User:** "Calculate population density by neighborhood"
**Tool Call:** `execute_select_query`
```json
{
  "connection_id": "local_gis",
  "query": "SELECT n.name as neighborhood, COUNT(b.id) as building_count, SUM(b.estimated_population) as total_population, ST_Area(n.geometry) / 1000000 as area_sq_km, (SUM(b.estimated_population) / (ST_Area(n.geometry) / 1000000)) as density_per_sq_km FROM neighborhoods n LEFT JOIN buildings b ON ST_Within(b.location, n.geometry) GROUP BY n.name, n.geometry HAVING COUNT(b.id) > 0 ORDER BY density_per_sq_km DESC",
  "limit": 20
}
```

## Security Features

### Query Safety Validation
- Only SELECT queries allowed for `execute_select_query`
- Automatic detection of dangerous SQL keywords
- Parameterized queries prevent SQL injection

### Connection Security
- SSL support for encrypted connections
- Secure credential handling
- Connection pooling and cleanup

### Data Protection
- Read-only operations for complex queries
- Explicit CRUD operations with validation
- Transaction rollback on errors

## PostGIS Functions Supported

The server supports all PostGIS functions including:

- **Spatial Relationships**: `ST_Contains`, `ST_Within`, `ST_Intersects`
- **Distance Analysis**: `ST_Distance`, `ST_DWithin`, `ST_Buffer`
- **Geometry Operations**: `ST_Union`, `ST_Intersection`, `ST_Difference`
- **Coordinate Systems**: `ST_Transform`, `ST_SetSRID`
- **Geometry Creation**: `ST_GeomFromText`, `ST_MakePoint`
- **Spatial Analysis**: `ST_Area`, `ST_Length`, `ST_Centroid`

## Integration with Arion

This FastMCP server integrates seamlessly with Arion's PostgreSQL integration:

1. **UI Configuration**: Use Arion's UI to configure database connections
2. **MCP Access**: LLM can access the same databases through this MCP server
3. **Shared Security**: Uses the same credential management system
4. **Unified Experience**: Seamless integration between UI and LLM operations

### Configuration in Arion

Add this MCP server to your Arion configuration:

```json
{
  "mcpServers": {
    "postgresql": {
      "command": "python",
      "args": ["postgresql_server.py"],
      "cwd": "/path/to/mcp-servers/postgresql"
    }
  }
}
```

## Error Handling

The server provides comprehensive error handling:
- Connection failures with detailed messages
- SQL syntax error reporting
- Security violation warnings
- Transaction rollback on failures

## Logging

All operations are logged with appropriate levels:
- INFO: Successful operations
- ERROR: Failures and exceptions
- DEBUG: Query execution details (in development)

## Natural Language Examples

The LLM can handle these types of requests:

### Spatial Analysis
- *"Find all buildings within 1km of the city center"*
- *"Calculate the area of all parks in the downtown district"*
- *"Show me the nearest hospital to coordinates [lat, lng]"*
- *"Find optimal locations for new fire stations"*

### Data Management
- *"Add a new school to the database at these coordinates"*
- *"Update all residential buildings to include flood risk data"*
- *"Delete all temporary construction sites from last month"*
- *"Show me the structure of the spatial_data table"*

### Business Intelligence
- *"Calculate population density by neighborhood"*
- *"Find areas with high commercial activity but low residential density"*
- *"Analyze traffic patterns near shopping centers"*
- *"Generate a report of all building permits issued this year"*