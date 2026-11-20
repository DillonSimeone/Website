#*****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 3    
# Date:          10/11/2026
# Description:   A program that accepts food items and quantities for Shrek's
#                Swamp Diner using interactive arrow-key selection, calculates
#                tax and tips, and outputs totals in fiat and raw onions.
# Inputs:        Strings for patron names and choices, integers/floats for
#                quantities and tips
# Output:        Formatted receipt with subtotal, tax, tip, and total costs in
#                fiat currency and raw swamp onions
# Sources:       Lab 3 Assignment Instructions, Module 3 Lessons, Python
#                programming textbook chapter 3
#*****************************************************************************

import sys
import time
import random

# Windows-native immediate keypress handling without requiring external pip packages
try:
    import msvcrt
    WINDOWS_KEYPRESS = True
except ImportError:
    WINDOWS_KEYPRESS = False

# ANSI Color Palette
SWAMP_GREEN  = "\033[92m"
ONION_GOLD   = "\033[93m"
OGRE_BROWN   = "\033[33m"
MUD_RED      = "\033[91m"
BOG_CYAN     = "\033[96m"
DEEP_PURPLE  = "\033[95m"
NEON_LIME    = "\033[38;5;154m"
BRIGHT_WHITE = "\033[97m"
DARK_GRAY    = "\033[90m"
RESET        = "\033[0m"
BOLD         = "\033[1m"
UNDERLINE    = "\033[4m"

# Rainbow palette for the dynamic onion animation
ANIMATION_COLORS = [
    "\033[92m",  # Bright Green
    "\033[93m",  # Bright Yellow/Gold
    "\033[95m",  # Purple
    "\033[96m",  # Cyan
    "\033[91m",  # Red
    "\033[38;5;208m",  # Orange
    "\033[38;5;154m",  # Lime
    "\033[38;5;213m",  # Pink
]

def hide_cursor():
    """Hide terminal cursor for clean interactive rendering."""
    sys.stdout.write("\033[?25l")
    sys.stdout.flush()

def show_cursor():
    """Restore terminal cursor."""
    sys.stdout.write("\033[?25h")
    sys.stdout.flush()

def clear_screen():
    """Clear terminal screen and place cursor at home position."""
    sys.stdout.write("\033[H\033[2J")
    sys.stdout.flush()

# Keyboard Event Handling
def read_key():
    """
    Reads a single keypress.
    Returns: 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'ESCAPE', or character string.
    """
    if WINDOWS_KEYPRESS:
        ch = msvcrt.getch()
        if ch in (b'\x00', b'\xe0'):
            ch2 = msvcrt.getch()
            if ch2 == b'H':
                return 'UP'
            elif ch2 == b'P':
                return 'DOWN'
            elif ch2 == b'K':
                return 'LEFT'
            elif ch2 == b'M':
                return 'RIGHT'
        elif ch in (b'\r', b'\n'):
            return 'ENTER'
        elif ch == b'\x1b':
            return 'ESCAPE'
        else:
            try:
                return ch.decode('utf-8', errors='ignore')
            except Exception:
                return ''
    else:
        # Fallback if run in an environment without msvcrt
        key = input().strip().lower()
        if key == 'w': return 'UP'
        if key == 's': return 'DOWN'
        if key == 'a': return 'LEFT'
        if key == 'd': return 'RIGHT'
        return 'ENTER'

# Animation: Multi-layered Onion Loading Sequence
def run_onion_loading_animation(duration_seconds=3.5):
    """
    Plays an animated loading loop:
        Base phrase: 'OnIon oNIon OnION'
        Casing is randomized every 100ms
        Character colors are re-randomized every 350ms
    """
    hide_cursor()
    print(f"\n{BOLD}{SWAMP_GREEN}>>> Peeling back the layers of your order...{RESET}\n")

    base_phrase = "OnIon oNIon OnION"
    
    # Initial color mapping per character index
    current_colors = [random.choice(ANIMATION_COLORS) for _ in base_phrase]

    start_time = time.time()
    last_color_change = start_time
    last_case_change = 0

    while time.time() - start_time < duration_seconds:
        current_time = time.time()

        if current_time - last_color_change >= 0.35:
            current_colors = [random.choice(ANIMATION_COLORS) for _ in base_phrase]
            last_color_change = current_time

        if current_time - last_case_change >= 0.10:
            cased_chars = []
            for char in base_phrase:
                if char == ' ':
                    cased_chars.append(' ')
                else:
                    cased_chars.append(char.upper() if random.random() > 0.5 else char.lower())
            last_case_change = current_time

            colored_output = "".join(
                f"{current_colors[i]}{BOLD}{cased_chars[i]}{RESET}"
                for i in range(len(base_phrase))
            )

            spinner = ["🧅", "🌿", "🥘", "✨"][int(current_time * 8) % 4]
            sys.stdout.write(f"\r   {spinner}  {colored_output}  {spinner}  ( Simmering in the bog... )")
            sys.stdout.flush()

        time.sleep(0.02)

    sys.stdout.write(f"\r   🧅  {BOLD}{ONION_GOLD}ONION LAYERS FULLY REVEALED!{RESET} {' ' * 30}\n\n")
    sys.stdout.flush()
    show_cursor()

# Interactive Food Ordering Menu
def run_interactive_food_menu():
    """
    Renders the menu where:
        Initial item selected is Onions (Index 0).
        Up/Down arrows navigate items.
        Right arrow increments quantity.
        Left arrow decrements quantity (clamped at 0).
        Enter key commits the items and proceeds.
    """
    menu_items = [
        {"name": "Whole Raw Swamp Onions", "desc": "Layers upon layers of ogre flavor", "price": 2.50, "qty": 0},
        {"name": "Roasted Weed Rat",       "desc": "Crispy roasted on a swamp stick",     "price": 6.00, "qty": 0},
        {"name": "Juicy Swamp Slugs",      "desc": "Fresh from the bog, extra slime",    "price": 3.75, "qty": 0},
        {"name": "Donkey's Morning Waffles","desc": "Warm & fluffy with pure bog honey",   "price": 5.25, "qty": 0},
        {"name": "Gingy's Gumdrop Parfait", "desc": "Everybody loves parfaits!",          "price": 4.50, "qty": 0},
        {"name": "Earwax Candle Fondue",   "desc": "Served with hard bog croutons",      "price": 4.00, "qty": 0},
    ]

    selected_index = 0
    hide_cursor()

    while True:
        clear_screen()
        print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
        print(f"{BOLD}{NEON_LIME}               SHREK'S SWAMP DINER & ONION DEPOT                {RESET}")
        print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
        print(f"{DARK_GRAY}CONTROLS: [↑/↓] Select Item | [→] Add (+1) | [←] Remove (-1) | [Enter] Confirm{RESET}\n")

        # Accumulate
        live_item_count = 0
        live_subtotal = 0.0

        for i, item in enumerate(menu_items):
            live_item_count += item["qty"]
            live_subtotal += item["qty"] * item["price"]

            is_focused = (i == selected_index)
            pointer = f"{ONION_GOLD}▶{RESET}" if is_focused else " "
            name_color = f"{BOLD}{NEON_LIME}" if is_focused else BRIGHT_WHITE

            line = (
                f" {pointer} {name_color}{item['name']:<27}{RESET} "
                f"${item['price']:>5.2f}  "
                f"[{MUD_RED if item['qty'] == 0 else BOLD + ONION_GOLD} - {RESET}"
                f" {BOLD}{item['qty']:>2} {RESET}"
                f"{SWAMP_GREEN} + {RESET}]"
            )
            print(line)
            print(f"     {DARK_GRAY}{item['desc']}{RESET}")

        print(f"\n{BOLD}{SWAMP_GREEN}----------------------------------------------------------------{RESET}")
        print(
            f" Current Basket: {BOLD}{live_item_count}{RESET} items | "
            f"Live Subtotal: {BOLD}{ONION_GOLD}${live_subtotal:.2f}{RESET}"
        )
        print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
        print(f"{ONION_GOLD}>>> Press [ENTER] when you are finished selecting your feast!{RESET}")

        key = read_key()

        if key == 'UP':
            selected_index = (selected_index - 1) % len(menu_items)
        elif key == 'DOWN':
            selected_index = (selected_index + 1) % len(menu_items)
        elif key == 'RIGHT':
            menu_items[selected_index]["qty"] += 1
        elif key == 'LEFT':
            if menu_items[selected_index]["qty"] > 0:
                menu_items[selected_index]["qty"] -= 1
        elif key == 'ENTER':
            if live_item_count == 0:
                print(f"\n{BOLD}{MUD_RED}What are you doing in my swamp?! You can't order 0 items!{RESET}")
                time.sleep(1.2)
                continue
            break

    show_cursor()
    return menu_items

# Interactive Tip Selection Screen
def run_interactive_tip_menu(subtotal):
    """
    Renders tip selection:
    Options: 0%, 10%, 20%, Custom (set via Left/Right keys; range 0% to infinity).
    Press Enter to confirm.
    """
    tip_modes = ["0%", "10%", "20%", "Custom"]
    selected_mode_idx = 1  # Default to 10%
    custom_tip_value = 15  # Default custom percentage

    hide_cursor()

    while True:
        clear_screen()
        print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
        print(f"{BOLD}{ONION_GOLD}                   CHOOSE TIP FOR SWAMP CHEF                    {RESET}")
        print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
        print(f"{DARK_GRAY}CONTROLS: [↑/↓] Change Option | [←/→] Adjust Custom Tip % | [Enter] Confirm{RESET}\n")
        print(f" Subtotal: {BOLD}{ONION_GOLD}${subtotal:.2f}{RESET}\n")

        for idx, mode in enumerate(tip_modes):
            is_focused = (idx == selected_mode_idx)
            pointer = f"{ONION_GOLD}▶{RESET}" if is_focused else " "
            label_color = f"{BOLD}{NEON_LIME}" if is_focused else BRIGHT_WHITE

            if mode == "0%":
                calc_tip = 0.0
                print(f" {pointer} {label_color}0%  - Cheapskate Lord Farquaad Style ({RESET}${calc_tip:.2f}{label_color}){RESET}")
            elif mode == "10%":
                calc_tip = subtotal * 0.10
                print(f" {pointer} {label_color}10% - Respectable Swamp Creature ({RESET}${calc_tip:.2f}{label_color}){RESET}")
            elif mode == "20%":
                calc_tip = subtotal * 0.20
                print(f" {pointer} {label_color}20% - True Friend of the Ogre ({RESET}${calc_tip:.2f}{label_color}){RESET}")
            elif mode == "Custom":
                calc_tip = subtotal * (custom_tip_value / 100.0)
                print(
                    f" {pointer} {label_color}Custom Tip: [ {RESET}{BOLD}{custom_tip_value}%{RESET}{label_color} ]"
                    f" (← / → to adjust from 0% to ∞%) -> ${calc_tip:.2f}{RESET}"
                )

        print(f"\n{BOLD}{SWAMP_GREEN}----------------------------------------------------------------{RESET}")
        if tip_modes[selected_mode_idx] == "0%":
            active_tip_pct = 0.0
        elif tip_modes[selected_mode_idx] == "10%":
            active_tip_pct = 10.0
        elif tip_modes[selected_mode_idx] == "20%":
            active_tip_pct = 20.0
        else:
            active_tip_pct = float(custom_tip_value)

        active_tip_dollars = subtotal * (active_tip_pct / 100.0)
        print(f" Selected Tip: {BOLD}{active_tip_pct:.0f}% ({ONION_GOLD}${active_tip_dollars:.2f}{RESET})")
        print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
        print(f"{ONION_GOLD}>>> Press [ENTER] to lock in your tip!{RESET}")

        key = read_key()

        if key == 'UP':
            selected_mode_idx = (selected_mode_idx - 1) % len(tip_modes)
        elif key == 'DOWN':
            selected_mode_idx = (selected_mode_idx + 1) % len(tip_modes)
        elif key == 'RIGHT':
            if tip_modes[selected_mode_idx] == "Custom":
                custom_tip_value += 1
            else:
                selected_mode_idx = min(selected_mode_idx + 1, len(tip_modes) - 1)
        elif key == 'LEFT':
            if tip_modes[selected_mode_idx] == "Custom":
                if custom_tip_value > 0:
                    custom_tip_value -= 1
            else:
                selected_mode_idx = max(selected_mode_idx - 1, 0)
        elif key == 'ENTER':
            break

    show_cursor()
    return active_tip_pct

# Receipt & Calculations
def print_swamp_receipt(patron_name, ordered_items, tip_percent):
    """
    Computes total using accumulator variables and displays the final receipt
    payable in both fiat currency and raw onions.
    """
    clear_screen()
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f"{BOLD}{ONION_GOLD}                 OFFICIAL SWAMP DINER RECEIPT                   {RESET}")
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f" Patron Name: {BOLD}{BRIGHT_WHITE}{patron_name}{RESET}")
    print(f" Swamp Server: {BOLD}{SWAMP_GREEN}Shrek & Donkey{RESET}")
    print(f"{BOLD}{SWAMP_GREEN}----------------------------------------------------------------{RESET}")
    print(f" {'ITEM':<28} {'QTY':<6} {'UNIT':<9} {'TOTAL'}")
    print(f"{BOLD}{SWAMP_GREEN}----------------------------------------------------------------{RESET}")

    # Accumulator
    total_items = 0
    subtotal = 0.0

    for item in ordered_items:
        qty = item["qty"]
        if qty > 0:
            total_items += qty  # Numeric accumulator 1
            item_total = qty * item["price"]
            subtotal += item_total  # Numeric accumulator 2
            print(f" {item['name']:<28} {qty:<6} ${item['price']:<8.2f} ${item_total:>6.2f}")

    # Swamp Tax calculation (8.0% Bog Environmental Duty)
    tax_rate = 0.08
    swamp_tax = subtotal * tax_rate

    tip_amount = subtotal * (tip_percent / 100.0)

    total_fiat = subtotal + swamp_tax + tip_amount

    # Raw onion currency conversion:
    # 1 Raw Swamp Onion = $2.50
    raw_onion_unit_price = ordered_items[0]["price"]
    total_raw_onions = total_fiat / raw_onion_unit_price
    whole_onions = int(total_raw_onions)
    peeled_layers = round((total_raw_onions - whole_onions) * 10)

    print(f"{BOLD}{SWAMP_GREEN}----------------------------------------------------------------{RESET}")
    print(f" Total Items Purchased:       {BOLD}{total_items}{RESET}")
    print(f" Subtotal:                    {BOLD}${subtotal:.2f}{RESET}")
    print(f" Bog Environmental Tax (8%):  ${swamp_tax:.2f}")
    print(f" Chef Tip ({tip_percent:.0f}%):              ${tip_amount:.2f}")
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f" {BOLD}{NEON_LIME}TOTAL PAYABLE (FIAT):         ${total_fiat:.2f} USD{RESET}")
    print(f" {BOLD}{ONION_GOLD}TOTAL PAYABLE (RAW ONIONS):   {whole_onions} Whole Onions + {peeled_layers} Peeled Layers{RESET}")
    print(f"                              ({total_raw_onions:.2f} Raw Onions @ ${raw_onion_unit_price:.2f}/ea)")
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f" {SWAMP_GREEN}\"Ogres are like onions. Onions have layers. You have a bill.\"{RESET}")
    print(f" {DARK_GRAY}\"That'll do, Donkey. That'll do.\"{RESET}\n")

# Main Program Loop
def main():
    clear_screen()
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f"{BOLD}{NEON_LIME}            WELCOME TO SHREK'S SWAMP DINER (LAB 3)              {RESET}")
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f"{DARK_GRAY}Featuring live arrow-key item selection & the dual-currency onion exchange!{RESET}\n")

    # Outer loop to continually run the program until user is finished
    run_again = "y"
    while run_again.lower() == "y":

        # Requirement 1: Accept string input using input() with conditional validation
        while True:
            patron_name = input(f"{BOLD}{ONION_GOLD}Enter your Swamp Patron Name (e.g. Shrek, Fiona, Donkey): {RESET}").strip()
            if len(patron_name) == 0:
                print(f"{MUD_RED}Error: Name cannot be empty! Even a swamp rat has a name.{RESET}")
            elif any(char.isdigit() for char in patron_name):
                print(f"{MUD_RED}Error: Numbers detected! True fairy tale names only contain letters.{RESET}")
            else:
                break

        print(f"\n{SWAMP_GREEN}Welcome, {BOLD}{patron_name}{RESET}{SWAMP_GREEN}! Entering interactive swamp menu...{RESET}")
        time.sleep(1.0)

        # Requirement 2: Inner loop for food item selection
        ordered_items = run_interactive_food_menu()

        subtotal = sum(item["qty"] * item["price"] for item in ordered_items)

        # Requirement 3: Tip selection (0%, 10%, 20%, Custom from 0% to infinity%)
        tip_percent = run_interactive_tip_menu(subtotal)

        # Requirement 4: Rainbow Onion Loading Animation
        # Randomized upper/lower casing every 100ms, colors every 350ms
        run_onion_loading_animation(duration_seconds=3.5)

        # Requirement 5: Receipt printing & calculations
        print_swamp_receipt(patron_name, ordered_items, tip_percent)

        # Requirement 6: Outer loop check to run again
        while True:
            run_again_input = input(f"{BOLD}{ONION_GOLD}Would you like to place another swamp order? (y/n): {RESET}").strip().lower()
            if run_again_input in ("y", "yes", "n", "no"):
                run_again = "y" if run_again_input in ("y", "yes") else "n"
                break
            else:
                print(f"{MUD_RED}Invalid choice! Please enter 'y' for yes or 'n' for no.{RESET}")

    clear_screen()
    print(f"\n{BOLD}{SWAMP_GREEN}================================================================{RESET}")
    print(f"{BOLD}{NEON_LIME}        \"NOW GET OUT OF MY SWAMP!\" - SHREK                      {RESET}")
    print(f"{BOLD}{SWAMP_GREEN}================================================================{RESET}\n")

if __name__ == "__main__":
    main()
