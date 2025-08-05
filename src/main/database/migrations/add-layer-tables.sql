-- Layer Management Database Schema
-- Migration: add-layer-tables
-- Created: 2025-01-08
-- Description: Creates the core tables for layer management system

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS layers;
DROP TABLE IF EXISTS layer_groups;
DROP INDEX IF EXISTS idx_layers_type;
DROP INDEX IF EXISTS idx_layers_group_id;
DROP INDEX IF EXISTS idx_layers_z_index;
DROP INDEX IF EXISTS idx_layer_groups_parent;
DROP INDEX IF EXISTS idx_layers_created_by;
DROP INDEX IF EXISTS idx_layers_visibility;
DROP INDEX IF EXISTS idx_layer_groups_display_order;

-- Layer groups table (must be created first due to foreign key constraint)
CREATE TABLE layer_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    parent_id TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    expanded INTEGER NOT NULL DEFAULT 1 CHECK (expanded IN (0, 1)),
    color TEXT, -- Optional color coding for groups
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES layer_groups (id) ON DELETE CASCADE
);

-- Main layers table
CREATE TABLE layers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    type TEXT NOT NULL CHECK (type IN ('raster', 'vector')),
    source_id TEXT NOT NULL,
    source_config TEXT NOT NULL, -- JSON configuration
    style_config TEXT NOT NULL,  -- JSON styling configuration
    visibility INTEGER NOT NULL DEFAULT 1 CHECK (visibility IN (0, 1)),
    opacity REAL NOT NULL DEFAULT 1.0 CHECK (opacity >= 0 AND opacity <= 1),
    z_index INTEGER NOT NULL DEFAULT 0,
    metadata TEXT, -- JSON metadata
    group_id TEXT,
    is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
    created_by TEXT NOT NULL CHECK (created_by IN ('user', 'tool', 'mcp', 'import')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES layer_groups (id) ON DELETE SET NULL
);

-- Performance indexes for layers table
CREATE INDEX idx_layers_type ON layers(type);
CREATE INDEX idx_layers_group_id ON layers(group_id);
CREATE INDEX idx_layers_z_index ON layers(z_index DESC); -- DESC for proper ordering
CREATE INDEX idx_layers_created_by ON layers(created_by);
CREATE INDEX idx_layers_visibility ON layers(visibility);
CREATE INDEX idx_layers_created_at ON layers(created_at DESC);
CREATE INDEX idx_layers_updated_at ON layers(updated_at DESC);

-- Performance indexes for layer_groups table
CREATE INDEX idx_layer_groups_parent ON layer_groups(parent_id);
CREATE INDEX idx_layer_groups_display_order ON layer_groups(display_order);
CREATE INDEX idx_layer_groups_created_at ON layer_groups(created_at DESC);

-- Layer operations history table (optional, for audit trail)
CREATE TABLE layer_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layer_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete', 'reorder', 'group', 'ungroup', 'style-change', 'visibility-toggle')),
    changes TEXT, -- JSON representation of changes
    user_id TEXT, -- Optional user identification
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (layer_id) REFERENCES layers (id) ON DELETE CASCADE
);

-- Performance indexes for operations table
CREATE INDEX idx_layer_operations_layer_id ON layer_operations(layer_id);
CREATE INDEX idx_layer_operations_timestamp ON layer_operations(timestamp DESC);
CREATE INDEX idx_layer_operations_type ON layer_operations(operation_type);

-- Layer errors table (for tracking layer-specific errors)
CREATE TABLE layer_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layer_id TEXT,
    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_details TEXT, -- JSON additional error information
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
    FOREIGN KEY (layer_id) REFERENCES layers (id) ON DELETE CASCADE
);

-- Performance indexes for errors table
CREATE INDEX idx_layer_errors_layer_id ON layer_errors(layer_id);
CREATE INDEX idx_layer_errors_timestamp ON layer_errors(timestamp DESC);
CREATE INDEX idx_layer_errors_resolved ON layer_errors(resolved);

-- Style presets table (for reusable layer styles)
CREATE TABLE style_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    layer_type TEXT NOT NULL CHECK (layer_type IN ('raster', 'vector')),
    geometry_type TEXT CHECK (geometry_type IN ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection')),
    style_config TEXT NOT NULL, -- JSON style configuration
    preview TEXT, -- Base64 encoded preview image
    is_built_in INTEGER NOT NULL DEFAULT 0 CHECK (is_built_in IN (0, 1)),
    tags TEXT, -- JSON array of tags
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for style_presets table
CREATE INDEX idx_style_presets_layer_type ON style_presets(layer_type);
CREATE INDEX idx_style_presets_geometry_type ON style_presets(geometry_type);
CREATE INDEX idx_style_presets_is_built_in ON style_presets(is_built_in);

-- Layer performance metrics table (for monitoring)
CREATE TABLE layer_performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layer_id TEXT NOT NULL,
    load_time REAL NOT NULL, -- milliseconds
    render_time REAL NOT NULL, -- milliseconds
    memory_usage INTEGER, -- bytes
    feature_count INTEGER,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (layer_id) REFERENCES layers (id) ON DELETE CASCADE
);

-- Performance indexes for metrics table
CREATE INDEX idx_layer_performance_layer_id ON layer_performance_metrics(layer_id);
CREATE INDEX idx_layer_performance_timestamp ON layer_performance_metrics(timestamp DESC);

-- Triggers for maintaining updated_at timestamps
CREATE TRIGGER update_layers_updated_at
    AFTER UPDATE ON layers
    FOR EACH ROW
    BEGIN
        UPDATE layers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_layer_groups_updated_at
    AFTER UPDATE ON layer_groups
    FOR EACH ROW
    BEGIN
        UPDATE layer_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_style_presets_updated_at
    AFTER UPDATE ON style_presets
    FOR EACH ROW
    BEGIN
        UPDATE style_presets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Views for common queries
CREATE VIEW active_layers AS
SELECT 
    l.*,
    lg.name as group_name,
    lg.color as group_color
FROM layers l
LEFT JOIN layer_groups lg ON l.group_id = lg.id
WHERE l.visibility = 1
ORDER BY l.z_index DESC, l.created_at DESC;

CREATE VIEW layers_with_groups AS
SELECT 
    l.*,
    lg.name as group_name,
    lg.color as group_color,
    lg.expanded as group_expanded
FROM layers l
LEFT JOIN layer_groups lg ON l.group_id = lg.id
ORDER BY 
    COALESCE(lg.display_order, 999999), 
    l.z_index DESC, 
    l.created_at DESC;

-- Insert some default style presets
INSERT INTO style_presets (id, name, description, layer_type, geometry_type, style_config, is_built_in, tags) VALUES
('preset-vector-point-default', 'Default Points', 'Default styling for point layers', 'vector', 'Point', 
 '{"pointRadius": 6, "pointColor": "#3b82f6", "pointOpacity": 0.8, "pointStrokeColor": "#ffffff", "pointStrokeWidth": 2}', 
 1, '["default", "points"]'),

('preset-vector-line-default', 'Default Lines', 'Default styling for line layers', 'vector', 'LineString', 
 '{"lineColor": "#3b82f6", "lineWidth": 2, "lineOpacity": 0.8, "lineCap": "round", "lineJoin": "round"}', 
 1, '["default", "lines"]'),

('preset-vector-polygon-default', 'Default Polygons', 'Default styling for polygon layers', 'vector', 'Polygon', 
 '{"fillColor": "#3b82f6", "fillOpacity": 0.3, "fillOutlineColor": "#1e40af"}', 
 1, '["default", "polygons"]'),

('preset-raster-default', 'Default Raster', 'Default styling for raster layers', 'raster', NULL, 
 '{"rasterOpacity": 1, "rasterBrightnessMin": 0, "rasterBrightnessMax": 1, "rasterSaturation": 0, "rasterContrast": 0}', 
 1, '["default", "raster"]');

-- Create a default "Uncategorized" group
INSERT INTO layer_groups (id, name, description, display_order, expanded) VALUES
('group-uncategorized', 'Uncategorized', 'Default group for ungrouped layers', 999, 1);

-- Migration completion marker
CREATE TABLE schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version) VALUES ('add-layer-tables-v1.0');

-- Pragma settings for optimal performance
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA temp_store = MEMORY;