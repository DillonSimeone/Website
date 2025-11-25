import sys
import os
import re

# Define the target include path for LVGL files
LVGL_INCLUDE_PATH = '#include "../../../lvgl.h"'

def fix_lvgl_asset(file_path):
    filename = os.path.basename(file_path)
    base_name = os.path.splitext(filename)[0]
    upper_name = base_name.upper()
    
    print(f"Processing: {filename} (Asset: {base_name})")
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        # --- 1. Ensure correct include path ---
        if '#include "lvgl/lvgl.h"' in content:
            content = content.replace('#include "lvgl/lvgl.h"', LVGL_INCLUDE_PATH)
            print("  - Fixed 'lvgl/lvgl.h' path.")
        elif LVGL_INCLUDE_PATH not in content:
            # Check for the local include and replace it
            if '#include "lvgl.h"' in content:
                 content = content.replace('#include "lvgl.h"', LVGL_INCLUDE_PATH)
                 print("  - Fixed 'lvgl.h' path.")
            else:
                 # Ensure the path is at the top if no include was found
                 content = LVGL_INCLUDE_PATH + "\n\n" + content
                 print(f"  - Added missing include: {LVGL_INCLUDE_PATH}")

        # --- 2. Prepare/Insert Attribute Macros ---
        # (This block from your original script is crucial for compiler compatibility)
        attributes_block = f"""
#ifndef LV_ATTRIBUTE_MEM_ALIGN
#define LV_ATTRIBUTE_MEM_ALIGN
#endif

#ifndef LV_ATTRIBUTE_IMG_{upper_name}
#define LV_ATTRIBUTE_IMG_{upper_name}
#endif
"""
        if f"LV_ATTRIBUTE_IMG_{upper_name}" not in content:
            # Find the last include statement to insert attributes after it
            last_include = list(re.finditer(r'^#include\s+.*$', content, re.MULTILINE))
            if last_include:
                end_pos = last_include[-1].end()
                content = content[:end_pos] + "\n" + attributes_block + content[end_pos:]
            else:
                content = attributes_block + content
            print("  - Ensured attribute macros are present.")


        # --- 3. Find and Fix Broken Map Array Definition ---
        map_name = f"{base_name}_map"
        correct_decl = f"const LV_ATTRIBUTE_MEM_ALIGN LV_ATTRIBUTE_LARGE_CONST LV_ATTRIBUTE_IMG_{upper_name} uint8_t {map_name}[] = {{"
        
        # We need a robust regex to replace the declaration line regardless of how broken it is
        # Find the line that starts with attributes and ends at the opening brace of the map array
        map_array_start_pattern = r"const\s+(?:LV_ATTRIBUTE_\w+\s+)+(?:const\s+)?(?:LV_ATTRIBUTE_\w+\s+)*uint8_t\s*[^=]*=\s*\{"
        
        # Try to find and replace the broken declaration line
        content = re.sub(map_array_start_pattern, correct_decl + " ", content, count=1)
        
        # As a fallback, try to fix a simpler definition
        simple_pattern = r"const\s+uint8_t\s+" + re.escape(map_name) + r"\[\]\s*=\s*\{"
        if re.search(simple_pattern, content) and "LV_ATTRIBUTE_LARGE_CONST" not in content:
             content = re.sub(simple_pattern, correct_decl + " ", content, count=1)
             
        print("  - Verified/Fixed map array declaration format.")


        # --- 4. Chroma Key Transparency Fix (Index 0 Alpha = 0x00) ---
        
        # Regex to target the "Color of index 0" block in the data array
        # It looks for the data array name, finds the start, then targets the first 4 hex values.
        chroma_pattern = re.compile(
            r"(\s*\/\*Color of index 0\*\/\s*)"  # Group 1: The comment and surrounding space
            r"((?:0x[0-9a-fA-F]{2},\s*){3}0x[0-9a-fA-F]{2})," # Group 2: The 4 hex values
        )
        
        def chroma_replace(match):
            # Extract the 4 hex values (e.g., "0xAA, 0xRR, 0xGG, 0xBB")
            color_bytes_str = match.group(2).split(',')
            
            # The first byte is the Alpha channel. Force it to 0x00.
            # R, G, B channels remain the same (0xAA gets replaced by 0x00).
            fixed_color_str = f"0x00, {color_bytes_str[1].strip()}, {color_bytes_str[2].strip()}, {color_bytes_str[3].strip()}"
            
            print(f"  - Chroma Key Fix: Set Alpha of Index 0 to 0x00.")
            return f"{match.group(1)}{fixed_color_str},"

        # Find the map array content to operate on
        map_data_start = content.find(map_name)
        if map_data_start != -1:
            # Temporarily replace the color definition using the chroma_replace function
            content_after_map = content[map_data_start:]
            fixed_data = chroma_pattern.sub(chroma_replace, content_after_map, count=1)
            content = content[:map_data_start] + fixed_data
            
        else:
            print("  - WARNING: Could not find map array to apply Chroma Key fix.")


        # --- 5. Fix Descriptor Struct (ensure const and correct map name) ---
        # Find the line defining the descriptor struct
        dsc_pattern = r"(?:const\s+)?lv_img_dsc_t\s+" + re.escape(base_name) + r"\s*=\s*\{"
        replacement_dsc = f"const lv_img_dsc_t {base_name} = {{"
        content = re.sub(dsc_pattern, replacement_dsc, content)
        
        # Ensure .data points to the correct map name
        data_pattern = r'\.data\s*=\s*[^,\}]+'
        replacement_data = f".data = {map_name}"
        content = re.sub(data_pattern, replacement_data, content)
        print("  - Verified descriptor struct definitions.")


        # --- 6. Write back the fixed content ---
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        print("  - File saved successfully.\n")

    except Exception as e:
        print(f"ERROR processing {filename}: {e}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: Drag and drop your LVGL .c file(s) onto this script, or run it like:")
        print("python lvgl_asset_fixer.py <file1.c> <file2.c> ...")
    else:
        print("\n--- LVGL Asset Auto-Fixer v1.0 ---")
        for arg in sys.argv[1:]:
            if os.path.isfile(arg) and arg.lower().endswith('.c'):
                fix_lvgl_asset(arg)
            else:
                print(f"Skipping: {arg} (Not a .c file or path invalid)\n")