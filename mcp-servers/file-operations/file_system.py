"""
filesystem_server.py – Read-only filesystem MCP server (macOS/Unix).

Dependencies (Python ≥3.10):
    pip install fastmcp

Start the server:
    python filesystem_server.py
"""

import os
from pathlib import Path
from fnmatch import fnmatch
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("FileSystem-Tools")

@mcp.tool()
def get_home_path() -> str:
    """
    Return the current user's home directory, including username. This should be first performed when trying to access files, and you don't need to ask user for the username with this.
    E.g. /Users/alice on macOS.
    """
    # Path.home() points to the home directory of the user running the process  [oai_citation:0‡Stack Overflow](https://stackoverflow.com/questions/22947427/getting-home-directory-with-pathlib?utm_source=chatgpt.com)
    return str(Path.home())

@mcp.tool()
def list_dir(path: str, recursive: bool = False) -> dict:
    """
    List directory contents.
    - path can include ~; it will be expanded to the user’s home.
    - recursive=True will walk subdirectories.
    """
    p = Path(path).expanduser().resolve()  # expanduser() handles "~" → home dir  [oai_citation:1‡Python documentation](https://docs.python.org/3/library/pathlib.html?utm_source=chatgpt.com)
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {p}")
    if not p.is_dir():
        raise NotADirectoryError(f"Not a directory: {p}")

    if not recursive:
        dirs, files = [], []
        for entry in p.iterdir():
            if entry.is_dir():
                dirs.append(str(entry))
            elif entry.is_file():
                files.append(str(entry))
        return {"directories": sorted(dirs), "files": sorted(files)}
    else:
        all_files = []
        for root, _, filenames in os.walk(p):
            for fname in filenames:
                all_files.append(str(Path(root) / fname))
        return {"all_files": sorted(all_files)}

@mcp.tool()
def find_files(path: str, pattern: str, recursive: bool = True) -> list[str]:
    """
    Find files using shell patterns (e.g. '*.tif', 'data_?.csv').
    - path supports ~ expansion.
    - recursive controls subdirectory search.
    """
    base = Path(path).expanduser().resolve()
    if not base.exists():
        raise FileNotFoundError(f"Path not found: {base}")
    if not base.is_dir():
        raise NotADirectoryError(f"Not a directory: {base}")

    matches = []
    if recursive:
        for root, _, filenames in os.walk(base):
            for fname in filenames:
                if fnmatch(fname, pattern):
                    matches.append(str(Path(root) / fname))
    else:
        for entry in base.iterdir():
            if entry.is_file() and fnmatch(entry.name, pattern):
                matches.append(str(entry))
    return sorted(matches)

if __name__ == "__main__":
    mcp.run()