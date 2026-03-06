import os
import json
import re

def extract_tags():
    if not os.path.exists('index.html'):
        print("index.html not found")
        return

    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # Create tags directory
    if not os.path.exists('tags'):
        os.makedirs('tags')

    # Regex to find spoilers
    # <div class="spoiler" id="([^"]+)">.*?<span class="spoiler-title">\s*([^<]+)\s*</span>.*?<div class="category-tags">(.*?)</div>\s*</div>\s*</div>
    # Using re.DOTALL to match across lines
    spoiler_pattern = re.compile(r'<div class="spoiler" id="([^"]+)">.*?<span class="spoiler-title">\s*(.*?)\s*</span>.*?<div class="category-tags">(.*?)</div>\s*</div>\s*</div>', re.DOTALL)
    
    # Within category-tags, find all quick-tags
    tag_pattern = re.compile(r'<div class="quick-tag\s*([^"]*)"\s*data-tag="([^"]+)"\s*onclick="toggleTag\(\'[^\']+\',\s*this\)">\s*(.*?)\s*</div>', re.DOTALL)

    spoilers = spoiler_pattern.findall(content)
    
    all_categories = []

    for s_id, s_title, s_tags_html in spoilers:
        # Clean title
        s_title = s_title.replace('&amp;', '&').strip()
        
        tags = []
        # Find horizontal rules too? No, let's keep it simple for now or preserve them.
        # Actually, let's just extract tags.
        
        found_tags = tag_pattern.findall(s_tags_html)
        for t_classes, t_id, t_label in found_tags:
            t_label = t_label.strip()
            # Clean up labels that might have newlines (like red hair)
            t_label = re.sub(r'\s+', ' ', t_label)
            
            tags.append({
                "id": t_id,
                "label": t_label,
                "classes": t_classes.strip().split()
            })
        
        category_data = {
            "id": s_id,
            "title": s_title,
            "tags": tags
        }
        
        with open(f'tags/{s_id}.json', 'w', encoding='utf-8') as f_out:
            json.dump(category_data, f_out, indent=4)
        
        all_categories.append(s_id)
        print(f"Extracted {s_id} ({len(tags)} tags)")

    # Create a manifest file
    with open('tags/manifest.json', 'w', encoding='utf-8') as f_out:
        json.dump(all_categories, f_out, indent=4)

if __name__ == "__main__":
    extract_tags()
