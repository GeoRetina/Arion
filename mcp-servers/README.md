# MCP Servers

This directory contains the bundled Model Context Protocol (MCP) servers that ship with Arion by default.

## Directory Structure

```text
mcp-servers/
|-- file-operations/
|   `-- file_system.py              # Read-only filesystem tools
|-- geospatial-analysis/
|   |-- raster/
|   |   `-- raster_metadata.py      # Raster metadata, statistics, histograms
|   `-- vector/
|       `-- vector_metadata.py      # Vector metadata, attributes, geometry validity
|-- postgresql/
|   |-- postgresql_server.py        # PostgreSQL and PostGIS tools
|   `-- README.md
|-- web-scraping/
|   `-- web_scraper.py              # Web scraping and API tools
`-- README.md
```

## Server Categories

### Geospatial Analysis

- `Raster Metadata`: Extract raster metadata, band statistics, histograms, and unique values.
- `Vector Metadata`: Inspect vector dataset structure, attributes, bounds, and geometry validity.

### File Operations

- `File System`: Read-only filesystem operations, directory listing, and file finding.

### Database Access

- `PostgreSQL`: Connect to PostgreSQL/PostGIS and execute database operations.

### Web Scraping

- `Web Scraper`: Fetch pages, extract links, images, tables, text, and make API requests.

## Usage

Each MCP server can be run independently:

```bash
python mcp-servers/geospatial-analysis/raster/raster_metadata.py
python mcp-servers/geospatial-analysis/vector/vector_metadata.py
python mcp-servers/postgresql/postgresql_server.py
python mcp-servers/web-scraping/web_scraper.py
```

## Dependencies

Install the dependencies required for the server you want to run:

```bash
# Geospatial analysis (raster)
pip install "fastmcp>=2.3.3" rasterio numpy pyproj scipy

# Geospatial analysis (vector)
pip install "fastmcp>=2.3.3" geopandas shapely pyproj pandas

# File operations
pip install fastmcp

# PostgreSQL
pip install -r mcp-servers/postgresql/requirements.txt

# Web scraping
pip install "fastmcp>=2.3.3" requests beautifulsoup4 lxml selenium
```

## Adding New Servers

1. Create a new directory for your server category.
2. Add your MCP server Python file(s).
3. Include a short description and dependency notes.
4. Update this README with the new server information.

## Integration with Arion

These MCP servers can be configured in Arion settings to extend the application through MCP.
