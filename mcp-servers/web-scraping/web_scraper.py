"""
Web Scraping MCP Server - Tools for web data extraction and API interactions.
Handles web scraping, API calls, and data retrieval from online sources.

Dependencies (Python ≥3.10):
    pip install "fastmcp>=2.3.3" requests beautifulsoup4 lxml selenium
"""

from mcp.server.fastmcp import FastMCP
import requests
from bs4 import BeautifulSoup
import json
import time
from urllib.parse import urljoin, urlparse
import sys
from typing import Dict, List, Optional

# Initialize MCP server
mcp = FastMCP(name="Web-Scraping-Tools")

# --- Helper Functions ---

def is_valid_url(url: str) -> bool:
    """Check if URL is valid."""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False

def get_safe_headers() -> Dict[str, str]:
    """Return safe headers for web requests."""
    return {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
    }

# --- Basic Web Scraping Tools ---

@mcp.tool()
def fetch_webpage(url: str, timeout: int = 10) -> dict:
    """Fetch webpage content and return basic information."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    try:
        response = requests.get(url, headers=get_safe_headers(), timeout=timeout)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        return {
            "url": url,
            "status_code": response.status_code,
            "title": soup.title.string.strip() if soup.title else None,
            "content_length": len(response.content),
            "encoding": response.encoding,
            "headers": dict(response.headers),
            "text_content": soup.get_text()[:1000]  # First 1000 chars
        }
    except requests.RequestException as e:
        return {"error": f"Request failed: {str(e)}", "url": url}
    except Exception as e:
        return {"error": f"Parsing failed: {str(e)}", "url": url}

@mcp.tool()
def extract_links(url: str, filter_domain: bool = True) -> dict:
    """Extract all links from a webpage."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    try:
        response = requests.get(url, headers=get_safe_headers(), timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        base_domain = urlparse(url).netloc
        
        links = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            absolute_url = urljoin(url, href)
            
            if filter_domain and urlparse(absolute_url).netloc != base_domain:
                continue
                
            links.append({
                "text": link.get_text().strip(),
                "url": absolute_url,
                "href": href
            })
        
        return {
            "source_url": url,
            "total_links": len(links),
            "links": links[:50],  # First 50 links
            "filtered_by_domain": filter_domain,
            "base_domain": base_domain
        }
    except Exception as e:
        return {"error": f"Link extraction failed: {str(e)}", "url": url}

@mcp.tool()
def extract_images(url: str, min_size: int = 100) -> dict:
    """Extract image information from a webpage."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    try:
        response = requests.get(url, headers=get_safe_headers(), timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        images = []
        for img in soup.find_all('img'):
            src = img.get('src')
            if not src:
                continue
                
            absolute_url = urljoin(url, src)
            alt_text = img.get('alt', '')
            width = img.get('width')
            height = img.get('height')
            
            # Filter by size if dimensions available
            if width and height:
                try:
                    w, h = int(width), int(height)
                    if w < min_size and h < min_size:
                        continue
                except:
                    pass
            
            images.append({
                "src": absolute_url,
                "alt": alt_text,
                "width": width,
                "height": height
            })
        
        return {
            "source_url": url,
            "total_images": len(images),
            "images": images[:30],  # First 30 images
            "min_size_filter": min_size
        }
    except Exception as e:
        return {"error": f"Image extraction failed: {str(e)}", "url": url}

# --- Content Extraction Tools ---

@mcp.tool()
def extract_text_by_tag(url: str, tag: str, class_name: str = None, limit: int = 10) -> dict:
    """Extract text content from specific HTML tags."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    try:
        response = requests.get(url, headers=get_safe_headers(), timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        if class_name:
            elements = soup.find_all(tag, class_=class_name)
        else:
            elements = soup.find_all(tag)
        
        extracted_text = []
        for element in elements[:limit]:
            text = element.get_text().strip()
            if text:
                extracted_text.append({
                    "text": text,
                    "tag": tag,
                    "class": element.get('class', [])
                })
        
        return {
            "source_url": url,
            "tag_searched": tag,
            "class_filter": class_name,
            "total_found": len(elements),
            "extracted_count": len(extracted_text),
            "content": extracted_text
        }
    except Exception as e:
        return {"error": f"Text extraction failed: {str(e)}", "url": url}

@mcp.tool()
def extract_tables(url: str, table_index: int = None) -> dict:
    """Extract table data from a webpage."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    try:
        response = requests.get(url, headers=get_safe_headers(), timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        tables = soup.find_all('table')
        
        if not tables:
            return {"error": "No tables found", "url": url}
        
        extracted_tables = []
        
        tables_to_process = [tables[table_index]] if table_index is not None and 0 <= table_index < len(tables) else tables
        
        for i, table in enumerate(tables_to_process):
            rows = []
            for tr in table.find_all('tr'):
                cells = []
                for cell in tr.find_all(['td', 'th']):
                    cells.append(cell.get_text().strip())
                if cells:
                    rows.append(cells)
            
            if rows:
                extracted_tables.append({
                    "table_index": i if table_index is None else table_index,
                    "rows": len(rows),
                    "columns": len(rows[0]) if rows else 0,
                    "data": rows[:10]  # First 10 rows
                })
        
        return {
            "source_url": url,
            "total_tables": len(tables),
            "extracted_tables": len(extracted_tables),
            "tables": extracted_tables
        }
    except Exception as e:
        return {"error": f"Table extraction failed: {str(e)}", "url": url}

# --- API and Data Tools ---

@mcp.tool()
def make_api_request(url: str, method: str = "GET", headers: dict = None, params: dict = None, json_data: dict = None) -> dict:
    """Make API request and return response data."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    method = method.upper()
    if method not in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
        raise ValueError(f"Unsupported HTTP method: {method}")
    
    try:
        request_headers = get_safe_headers()
        if headers:
            request_headers.update(headers)
        
        if method == 'GET':
            response = requests.get(url, headers=request_headers, params=params, timeout=15)
        elif method == 'POST':
            response = requests.post(url, headers=request_headers, params=params, json=json_data, timeout=15)
        elif method == 'PUT':
            response = requests.put(url, headers=request_headers, params=params, json=json_data, timeout=15)
        elif method == 'DELETE':
            response = requests.delete(url, headers=request_headers, params=params, timeout=15)
        elif method == 'PATCH':
            response = requests.patch(url, headers=request_headers, params=params, json=json_data, timeout=15)
        
        # Try to parse JSON response
        try:
            response_data = response.json()
        except:
            response_data = response.text
        
        return {
            "url": url,
            "method": method,
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "data": response_data,
            "success": response.status_code < 400
        }
    except Exception as e:
        return {"error": f"API request failed: {str(e)}", "url": url, "method": method}

@mcp.tool()
def check_robots_txt(url: str) -> dict:
    """Check robots.txt file for a domain."""
    if not is_valid_url(url):
        raise ValueError(f"Invalid URL: {url}")
    
    try:
        parsed_url = urlparse(url)
        robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
        
        response = requests.get(robots_url, headers=get_safe_headers(), timeout=10)
        
        if response.status_code == 200:
            return {
                "domain": parsed_url.netloc,
                "robots_txt_exists": True,
                "content": response.text,
                "status_code": response.status_code
            }
        else:
            return {
                "domain": parsed_url.netloc,
                "robots_txt_exists": False,
                "status_code": response.status_code
            }
    except Exception as e:
        return {"error": f"Failed to check robots.txt: {str(e)}", "url": url}

if __name__ == "__main__":
    print(f"MCP server instance '{mcp.name}' defined in {__file__}.", file=sys.stdout)
    print(f"Starting MCP server with STDIO transport (default).", file=sys.stdout)
    try:
        mcp.run()
    except Exception as e_generic:
        print(f"\n!!! An error occurred during mcp.run() for STDIO: {e_generic} !!!\n", file=sys.stderr)