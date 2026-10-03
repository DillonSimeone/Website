import requests
import csv
import json
import os
import time

CSV_URL = "https://s3.amazonaws.com/falextracts/Contract Opportunities/datagov/ContractOpportunitiesFullCSV.csv"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

def download_and_process_csv():
    script_dir = os.path.dirname(os.path.realpath(__file__))
    temp_csv_path = os.path.join(script_dir, "temp_opportunities.csv")
    output_json_path = os.path.join(script_dir, "datagov_opportunities.json")
    
    print("[START] Downloading daily datagov CSV (230MB)...")
    start_time = time.time()
    
    try:
        # Stream the download to a temporary file first
        with requests.get(CSV_URL, headers=headers, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(temp_csv_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        print(f"[DOWNLOAD COMPLETE] Downloaded in {time.time() - start_time:.2f} seconds.")
    except Exception as e:
        print(f"[ERROR] Failed to download CSV: {e}")
        return
        
    print("[PROCESSING] Extracting and filtering columns from CSV...")
    process_start = time.time()
    opportunities = []
    
    try:
        # Open and parse CSV
        with open(temp_csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Truncate Description to first 150 chars to save JSON file size
                desc = row.get("Description") or ""
                desc_truncated = desc[:150] + "..." if len(desc) > 150 else desc
                
                # Format PostedDate to YYYY-MM-DD
                posted_date = row.get("PostedDate") or ""
                if len(posted_date) >= 10:
                    posted_date = posted_date[:10]
                
                opportunities.append({
                    "id": row.get("NoticeId"),
                    "title": row.get("Title"),
                    "sol": row.get("Sol#"),
                    "date": posted_date,
                    "type": row.get("Type"),
                    "agency": row.get("Department/Ind.Agency"),
                    "office": row.get("Office"),
                    "link": row.get("Link"),
                    "desc": desc_truncated
                })
        
        # Sort opportunities by date descending (newest first)
        opportunities.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        # Save to JSON
        output_data = {
            "lastUpdated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "totalCount": len(opportunities),
            "opportunities": opportunities
        }
        
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2)
            
        print(f"[PROCESS COMPLETE] Extracted {len(opportunities)} opportunities in {time.time() - process_start:.2f} seconds.")
        print(f"[PROCESS COMPLETE] Saved JSON to {output_json_path}")
        
    except Exception as e:
        print(f"[ERROR] Failed to process CSV: {e}")
        
    finally:
        # Clean up temporary CSV
        if os.path.exists(temp_csv_path):
            os.remove(temp_csv_path)
            print("[CLEANUP] Removed temporary CSV file.")

if __name__ == "__main__":
    download_and_process_csv()
