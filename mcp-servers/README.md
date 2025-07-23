# MCP Servers

This directory contains organized Model Context Protocol (MCP) servers for extending Arion's capabilities.

## Directory Structure

```
mcp-servers/
├── geospatial-analysis/
│   ├── raster/
│   │   ├── raster_metadata.py      # Metadata, statistics, histograms
│   │   ├── spectral_indices.py     # NDVI, NDWI, EVI, SAVI calculations
│   │   └── spatial_analysis.py     # Focal operations, smoothing, edge detection
│   └── vector/
│       └── vector_analysis.py      # Vector data analysis tools
├── file-operations/
│   └── file_system.py              # File system operations
├── web-scraping/
│   └── web_scraper.py              # Web scraping and API tools
└── data-processing/
    └── data_processor.py           # Data manipulation and analysis
```

## Server Categories

### Geospatial Analysis

#### Raster Tools
- **Metadata Tools**: Extract raster metadata, band statistics, histograms, unique value analysis
- **Spectral Indices**: Calculate NDVI, NDWI, EVI, SAVI, MNDWI and other vegetation/water indices
- **Spatial Analysis**: Focal statistics (mean, max, min, std), Gaussian smoothing, median filtering, edge detection

#### Vector Tools
- **Vector Analysis**: Vector data processing, spatial joins, geometry operations, area/perimeter calculations

### File Operations
- **File System**: Read-only filesystem operations, directory listing, file finding

### Web Scraping
- **Web Scraper**: Web page content extraction, link and image extraction, API requests, robots.txt checking

### Data Processing
- **Data Processor**: CSV/JSON/Excel processing, data filtering, grouping, merging, pivot tables

## Usage

Each MCP server can be run independently:

```bash
# Run a specific server
python mcp-servers/geospatial-analysis/raster/raster_metadata.py
python mcp-servers/geospatial-analysis/raster/spectral_indices.py
python mcp-servers/web-scraping/web_scraper.py
```

## Dependencies

Install required dependencies for each server:

```bash
# Geospatial analysis (raster)
pip install "fastmcp>=2.3.3" rasterio numpy pyproj scipy

# Geospatial analysis (vector)
pip install "fastmcp>=2.3.3" geopandas shapely pyproj

# File operations
pip install fastmcp

# Web scraping
pip install "fastmcp>=2.3.3" requests beautifulsoup4 lxml selenium

# Data processing
pip install "fastmcp>=2.3.3" pandas numpy openpyxl xlrd
```

## Adding New Servers

1. Create a new directory for your server category
2. Add your MCP server Python file(s)
3. Follow the naming convention and include proper documentation
4. Update this README with the new server information

## Integration with Arion

These MCP servers can be configured in Arion's settings to extend the application's capabilities through the Model Context Protocol.