PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS qgis_catalog_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qgis_algorithm_catalogs (
  cache_key TEXT PRIMARY KEY,
  launcher_path TEXT NOT NULL,
  version TEXT,
  allow_plugin_algorithms INTEGER NOT NULL DEFAULT 0,
  built_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qgis_algorithm_entries (
  cache_key TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT,
  provider TEXT,
  supported_for_execution INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  parameter_names TEXT NOT NULL DEFAULT '[]',
  parameter_types TEXT NOT NULL DEFAULT '[]',
  parameter_descriptions TEXT NOT NULL DEFAULT '[]',
  required_parameter_names TEXT NOT NULL DEFAULT '[]',
  output_parameter_names TEXT NOT NULL DEFAULT '[]',
  help_fetched_at TEXT,
  raw_help_preview TEXT,
  sort_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cache_key, id),
  FOREIGN KEY (cache_key) REFERENCES qgis_algorithm_catalogs(cache_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qgis_algorithm_entries_cache_key
  ON qgis_algorithm_entries(cache_key);

CREATE INDEX IF NOT EXISTS idx_qgis_algorithm_entries_cache_provider
  ON qgis_algorithm_entries(cache_key, provider);

CREATE INDEX IF NOT EXISTS idx_qgis_algorithm_entries_cache_sort_name
  ON qgis_algorithm_entries(cache_key, sort_name, id);

CREATE VIRTUAL TABLE IF NOT EXISTS qgis_algorithm_entries_fts USING fts5(
  cache_key UNINDEXED,
  id,
  name,
  provider,
  summary,
  parameter_names,
  required_parameter_names,
  output_parameter_names,
  parameter_types,
  parameter_descriptions,
  raw_help_preview,
  supported UNINDEXED,
  sort_name UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS qgis_algorithm_entries_ai
AFTER INSERT ON qgis_algorithm_entries
BEGIN
  INSERT INTO qgis_algorithm_entries_fts (
    rowid,
    cache_key,
    id,
    name,
    provider,
    summary,
    parameter_names,
    required_parameter_names,
    output_parameter_names,
    parameter_types,
    parameter_descriptions,
    raw_help_preview,
    supported,
    sort_name
  )
  VALUES (
    NEW.rowid,
    NEW.cache_key,
    COALESCE(NEW.id, ''),
    COALESCE(NEW.name, ''),
    COALESCE(NEW.provider, ''),
    COALESCE(NEW.summary, ''),
    COALESCE(NEW.parameter_names, ''),
    COALESCE(NEW.required_parameter_names, ''),
    COALESCE(NEW.output_parameter_names, ''),
    COALESCE(NEW.parameter_types, ''),
    COALESCE(NEW.parameter_descriptions, ''),
    COALESCE(NEW.raw_help_preview, ''),
    CASE WHEN NEW.supported_for_execution = 1 THEN '1' ELSE '0' END,
    COALESCE(NEW.sort_name, '')
  );
END;

CREATE TRIGGER IF NOT EXISTS qgis_algorithm_entries_ad
AFTER DELETE ON qgis_algorithm_entries
BEGIN
  DELETE FROM qgis_algorithm_entries_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER IF NOT EXISTS qgis_algorithm_entries_au
AFTER UPDATE ON qgis_algorithm_entries
BEGIN
  DELETE FROM qgis_algorithm_entries_fts WHERE rowid = OLD.rowid;
  INSERT INTO qgis_algorithm_entries_fts (
    rowid,
    cache_key,
    id,
    name,
    provider,
    summary,
    parameter_names,
    required_parameter_names,
    output_parameter_names,
    parameter_types,
    parameter_descriptions,
    raw_help_preview,
    supported,
    sort_name
  )
  VALUES (
    NEW.rowid,
    NEW.cache_key,
    COALESCE(NEW.id, ''),
    COALESCE(NEW.name, ''),
    COALESCE(NEW.provider, ''),
    COALESCE(NEW.summary, ''),
    COALESCE(NEW.parameter_names, ''),
    COALESCE(NEW.required_parameter_names, ''),
    COALESCE(NEW.output_parameter_names, ''),
    COALESCE(NEW.parameter_types, ''),
    COALESCE(NEW.parameter_descriptions, ''),
    COALESCE(NEW.raw_help_preview, ''),
    CASE WHEN NEW.supported_for_execution = 1 THEN '1' ELSE '0' END,
    COALESCE(NEW.sort_name, '')
  );
END;

INSERT OR IGNORE INTO qgis_catalog_schema_migrations (version)
VALUES ('add-qgis-algorithm-catalog-cache-v1');
