import requests
import time
import json
import os

# --- CONFIGURATION ---
TAG_FOLDER = 'tags'
MANIFEST_PATH = os.path.join(TAG_FOLDER, 'manifest.json')
DANBOORU_API = "https://danbooru.donmai.us/tags.json"
E621_API = "https://e621.net/tags.json"
HEADERS = {'User-Agent': 'PonyPromptMaker/1.0 (DillonSimeone)'}

# Visual Thresholds (Post Counts)
POPULAR_MIN = 100000
UNCOMMON_MIN = 10000

# Model tokens that shouldn't be queried as tags
MODEL_TRIGGERS = [
    'score_9', 'score_8_up', 'score_7_up', 'score_6_up', 'score_5_up', 'score_4_up',
    'score_6', 'score_5', 'score_4',
    'source_anime', 'source_cartoon', 'source_furry', 'source_pony',
    'rating_safe', 'rating_questionable', 'rating_explicit'
]

def get_color_class(count):
    if count >= POPULAR_MIN:
        return "tag-popular"
    elif count >= UNCOMMON_MIN:
        return "tag-uncommon"
    elif count > 0:
        return "tag-rare"
    return ""

def fetch_tag_counts(tag_names, api_url):
    """Batch fetch tag counts from an API."""
    results = {}
    is_danbooru = "danbooru" in api_url
    
    if is_danbooru:
        batch_size = 50
        for i in range(0, len(tag_names), batch_size):
            batch = tag_names[i:i+batch_size]
            try:
                params = {
                    "search[name_comma]": ",".join(batch),
                    "limit": 100
                }
                resp = requests.get(api_url, headers=HEADERS, params=params, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    count_received = 0
                    for t in data:
                        tag_name = t.get('name')
                        if tag_name in batch:
                            results[tag_name] = t.get('post_count', 0)
                            count_received += 1
                    print(f"  Batch {i//batch_size + 1}: Received {count_received} matches")
                time.sleep(1) 
            except Exception as e:
                print(f"Request failed: {e}")
    else:
        # e621: Do one-by-one for truly missing tags to be 100% sure
        print(f"  Fetching {len(tag_names)} tags from e621 individually...")
        for tag_name in tag_names:
            try:
                params = {"search[name]": tag_name}
                resp = requests.get(api_url, headers=HEADERS, params=params, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    if data:
                        results[tag_name] = data[0].get('post_count', 0)
                time.sleep(0.3)
            except:
                pass
            
    return results

def update_tags():
    if not os.path.exists(MANIFEST_PATH):
        print(f"Manifest not found at {MANIFEST_PATH}")
        return

    with open(MANIFEST_PATH, 'r') as f:
        manifest = json.load(f)

    all_tag_ids = []
    category_files = []

    for cat_id in manifest:
        file_path = os.path.join(TAG_FOLDER, f"{cat_id}.json")
        if os.path.exists(file_path):
            category_files.append(file_path)
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for tag in data['tags']:
                    if tag['id'] not in MODEL_TRIGGERS:
                        all_tag_ids.append(tag['id'])
        else:
            print(f"Warning: Category file {file_path} not found.")

    all_tag_ids = list(set(all_tag_ids)) # Unique tags
    print(f"Fetching counts for {len(all_tag_ids)} tags from Danbooru...")
    counts = fetch_tag_counts(all_tag_ids, DANBOORU_API)

    # Fallback to e621 for missing tags (furry tags) or zero counts if likely furry
    missing = [t for t in all_tag_ids if t not in counts or counts[t] == 0]
    if missing:
        print(f"Checking e621 for {len(missing)} missing/zero tags...")
        e6_counts = fetch_tag_counts(missing, E621_API)
        for t, c in e6_counts.items():
            if t not in counts or c > counts.get(t, 0):
                counts[t] = c

    # Update the JSON files
    for file_path in category_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        updated = False
        for tag in data['tags']:
            if tag['id'] in MODEL_TRIGGERS:
                count = 1000000
            else:
                count = counts.get(tag['id'], 0)
            
            new_class = get_color_class(count)
            # Filter out existing popularity classes
            clean_classes = [c for c in tag['classes'] if c not in ['tag-popular', 'tag-uncommon', 'tag-rare']]
            if new_class:
                clean_classes.append(new_class)
            
            if tag['classes'] != clean_classes:
                tag['classes'] = clean_classes
                updated = True
        
        if updated:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4)
            print(f"Updated {os.path.basename(file_path)}")

    print("\nDone! All categories synchronized with Booru data.")

if __name__ == "__main__":
    update_tags()
