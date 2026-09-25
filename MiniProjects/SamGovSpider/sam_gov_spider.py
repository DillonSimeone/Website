import requests
import json
import time
import os

BASE_URL = "https://sam.gov/api/prod/fileextractservices/v1/api/listfiles"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

def fetch_directory(domain):
    """
    Fetches the list of files and folders for a given domain/subfolder from SAM.gov
    """
    params = {
        "domain": domain,
        "privacy": "Public"
    }
    
    print(f"[CRAWLING] Fetching: {domain}")
    try:
        response = requests.get(BASE_URL, headers=HEADERS, params=params, timeout=20)
        if response.status_code == 200:
            try:
                return response.json()
            except Exception as e:
                print(f"[ERROR] Failed to parse JSON for {domain}: {e}")
                return None
        else:
            print(f"[ERROR] HTTP {response.status_code} for {domain}")
            return None
    except Exception as e:
        print(f"[ERROR] Request failed for {domain}: {e}")
        return None

def build_tree():
    """
    Recursively builds the folder tree starting from 'Contract Opportunities'
    """
    visited = set()
    
    # We will build a recursive helper
    def crawl(current_domain, display_name):
        # Prevent infinite loops (should not happen in S3 hierarchy, but good practice)
        if current_domain in visited:
            return None
        visited.add(current_domain)
        
        # Rate limit friendly sleep
        time.sleep(0.5)
        
        data = fetch_directory(current_domain)
        if not data:
            return None
            
        items = data.get("_embedded", {}).get("customS3ObjectSummaryList", [])
        
        folders = []
        files = []
        
        for item in items:
            key = item.get("key", "")
            display = item.get("displayKey", "")
            
            # Skip self-references if S3 returns the directory itself in the listing
            # In listfiles, a subfolder listing sometimes includes the folder itself
            # e.g., key == current_domain + "/"
            if key.rstrip('/') == current_domain.rstrip('/'):
                continue
                
            is_folder = key.endswith('/')
            
            if is_folder:
                # Strip trailing slash for the domain parameter in the next request
                sub_domain = key.rstrip('/')
                sub_tree = crawl(sub_domain, display)
                if sub_tree:
                    folders.append(sub_tree)
            else:
                files.append({
                    "name": display,
                    "key": key,
                    "dateModified": item.get("dateModified"),
                    "fileFormat": item.get("fileFormat"),
                    "description": item.get("description"),
                    "size": item.get("fileSize") or "N/A",
                    "downloadUrl": f"https://sam.gov/api/prod/fileextractservices/v1/api/download?key={key}"
                })
                
        return {
            "name": display_name,
            "key": current_domain + "/",
            "type": "folder",
            "folders": folders,
            "files": files
        }

    print("[START] Starting crawl of SAM.gov Contract Opportunities...")
    tree = crawl("Contract Opportunities", "Contract Opportunities")
    return tree

if __name__ == "__main__":
    start_time = time.time()
    result_tree = build_tree()
    
    if result_tree:
        output_data = {
            "lastUpdated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "totalFiles": 0,  # We can calculate this
            "tree": result_tree
        }
        
        # Calculate total files count
        def count_files(node):
            count = len(node.get("files", []))
            for folder in node.get("folders", []):
                count += count_files(folder)
            return count
            
        output_data["totalFiles"] = count_files(result_tree)
        
        # Write to JSON
        script_dir = os.path.dirname(os.path.realpath(__file__))
        output_path = os.path.join(script_dir, "sam_gov_data.json")
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2)
            
        duration = time.time() - start_time
        print(f"[COMPLETE] Crawl finished in {duration:.2f} seconds.")
        print(f"[COMPLETE] Saved {output_data['totalFiles']} files to {output_path}")
    else:
        print("[FAILED] Crawl failed to produce results.")
