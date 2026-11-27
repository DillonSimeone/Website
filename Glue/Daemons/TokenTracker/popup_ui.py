"""
Popup UI for the LLM Token Tracker.

A sleek dark-themed popup window that appears near the system tray
showing token usage statistics across multiple time ranges.
"""

import tkinter as tk
from tkinter import ttk
from datetime import datetime, timedelta
from typing import Callable


# --- Color Palette ---
COLORS = {
    'bg': '#1a1a2e',
    'bg_secondary': '#16213e',
    'bg_card': '#1f2940',
    'bg_card_hover': '#263350',
    'accent_blue': '#4fc3f7',
    'accent_purple': '#b388ff',
    'accent_green': '#69f0ae',
    'accent_amber': '#ffd740',
    'accent_red': '#ff5252',
    'text_primary': '#e8eaed',
    'text_secondary': '#9aa0a6',
    'text_dim': '#5f6368',
    'border': '#2d3548',
    'divider': '#2a2a4a',
    'water_blue': '#29b6f6',
    'human_water': '#26a69a',
}

# --- Water Usage Constants ---
# Google's published data: ~0.26 mL per median Gemini text prompt
# Average prompt+response is roughly 500-2000 tokens total
# Conservative estimate: ~0.0003 mL per token (0.3 mL per 1K tokens)
# This accounts for both direct cooling water and indirect power-generation water
ML_PER_TOKEN = 0.0003

# Human daily water intake recommendation: ~2,500 mL (from all sources)
HUMAN_DAILY_WATER_ML = 2500.0

# --- Market API Pricing Constants (USD per 1M tokens) ---
# Derived from published developer API pricing (Google Cloud, Anthropic, Cursor)
PRICING_TABLE = {
    'opus': {'uncached': 15.00, 'cached': 1.50, 'output': 75.00},
    'sonnet': {'uncached': 3.00, 'cached': 0.30, 'output': 15.00},
    'pro': {'uncached': 2.50, 'cached': 0.625, 'output': 10.00},
    'flash': {'uncached': 0.10, 'cached': 0.025, 'output': 0.30},
    'gemini': {'uncached': 0.10, 'cached': 0.025, 'output': 0.30},
    'default': {'uncached': 3.00, 'cached': 0.75, 'output': 15.00},
}


def get_model_rates(model_name: str) -> dict:
    """Lookup API pricing rates for a given model identifier."""
    m = model_name.lower()
    for key, rates in PRICING_TABLE.items():
        if key in m:
            return rates
    return PRICING_TABLE['default']


def compute_cost_from_stats(stats: dict) -> dict:
    """
    Compute estimated API cost from a stats dict (cached vs retail uncached).
    Returns dict with keys: 'cached_cost', 'retail_cost', 'total_tokens'.
    """
    by_model = stats.get('by_model', {})
    total_cached_cost = 0.0
    total_retail_cost = 0.0

    if by_model:
        for model_name, mdata in by_model.items():
            prompt = mdata.get('prompt', 0)
            cached = mdata.get('cached', 0)
            output = mdata.get('output', 0)
            rates = get_model_rates(model_name)
            uncached = max(0, prompt - cached)

            c_cost = (uncached / 1e6 * rates['uncached']) + (cached / 1e6 * rates['cached']) + (output / 1e6 * rates['output'])
            r_cost = (prompt / 1e6 * rates['uncached']) + (output / 1e6 * rates['output'])
            total_cached_cost += c_cost
            total_retail_cost += r_cost
    else:
        prompt = stats.get('total_prompt', 0)
        cached = stats.get('total_cached', 0)
        output = stats.get('total_output', 0)
        rates = PRICING_TABLE['flash']
        uncached = max(0, prompt - cached)
        total_cached_cost = (uncached / 1e6 * rates['uncached']) + (cached / 1e6 * rates['cached']) + (output / 1e6 * rates['output'])
        total_retail_cost = (prompt / 1e6 * rates['uncached']) + (output / 1e6 * rates['output'])

    return {
        'cached_cost': total_cached_cost,
        'retail_cost': total_retail_cost,
        'total_tokens': stats.get('total_tokens', 0)
    }


def format_tokens(count: int) -> str:
    """Format a token count with commas for display."""
    if count >= 1_000_000_000:
        return f"{count / 1_000_000_000:.2f}B"
    elif count >= 1_000_000:
        return f"{count / 1_000_000:.2f}M"
    elif count >= 100_000:
        return f"{count / 1_000:.1f}K"
    elif count >= 1_000:
        return f"{count:,}"
    return str(count)


def format_water(ml: float) -> str:
    """Format water usage in human-readable units."""
    if ml >= 1000:
        return f"{ml / 1000:.2f}L"
    elif ml >= 1:
        return f"{ml:.1f}mL"
    else:
        return f"{ml:.3f}mL"


def format_water_equivalent(ml: float) -> str:
    """Express water amount in relatable terms."""
    if ml < 1:
        return f"{ml:.3f} mL (a tiny droplet)"
    elif ml < 5:
        return f"{ml:.1f} mL (an eye-dropper)"
    elif ml < 15:
        return f"{ml:.1f} mL (a tablespoon)"
    elif ml < 250:
        return f"{ml:.0f} mL (about {ml/250:.1f} cups)"
    elif ml < 500:
        return f"{ml:.0f} mL (~1 cup)"
    elif ml < 1000:
        return f"{ml:.0f} mL (~{ml/500:.1f} water bottles)"
    elif ml < 5000:
        return f"{ml/1000:.2f}L (~{ml/500:.1f} water bottles)"
    else:
        return f"{ml/1000:.1f}L (~{ml/500:.0f} water bottles)"


class TokenPopup:
    """Dark-themed popup window showing token usage statistics."""

    def __init__(self,
                 stats_today: dict,
                 stats_7d: dict,
                 stats_30d: dict,
                 stats_lifetime: dict,
                 daily_breakdown: dict,
                 refresh_interval_minutes: int,
                 on_refresh_interval_change: Callable[[int], None] | None = None,
                 on_refresh_now: Callable[[], None] | None = None,
                 last_scan_time: datetime | None = None,
                 provider_breakdown: dict | None = None,
                 parent: tk.Tk | None = None):
        """
        Create the popup window.

        Each stats dict should have keys:
            total_prompt, total_output, total_thinking, total_cached,
            total_tokens, turns, by_model
        """
        self.on_refresh_interval_change = on_refresh_interval_change
        self.on_refresh_now = on_refresh_now
        self.refresh_interval_minutes = refresh_interval_minutes
        self.provider_breakdown = provider_breakdown or {}
        self.parent = parent

        if parent is not None:
            self.root = tk.Toplevel(parent)
        else:
            self.root = tk.Tk()
            self.root.withdraw()  # Hide initially

        # Window configuration
        self.root.title("Token Tracker")
        self.root.overrideredirect(True)  # Borderless
        self.root.attributes('-topmost', True)
        self.root.configure(bg=COLORS['bg'])

        # Position near system tray (bottom-right of screen)
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        popup_w = 450
        popup_h = 760
        x = screen_w - popup_w - 12
        y = screen_h - popup_h - 52  # Above taskbar
        self.root.geometry(f"{popup_w}x{popup_h}+{x}+{y}")

        # Close on focus loss
        self.root.bind('<FocusOut>', self._on_focus_out)
        self.root.bind('<Escape>', lambda e: self.close())

        # Setup modern dark style for ttk widgets
        self._setup_styles()

        # Build UI
        self._build_ui(stats_today, stats_7d, stats_30d, stats_lifetime,
                       daily_breakdown, last_scan_time, self.provider_breakdown)

        # Show with fade-in effect
        self.root.attributes('-alpha', 0.0)
        self.root.deiconify()
        self.root.focus_force()
        self._fade_in(0.0)

    def _fade_in(self, alpha: float):
        """Animate fade-in."""
        if alpha < 0.95:
            alpha += 0.1
            self.root.attributes('-alpha', alpha)
            self.root.after(15, self._fade_in, alpha)
        else:
            self.root.attributes('-alpha', 0.97)

    def _on_focus_out(self, event):
        """Close popup when it loses focus."""
        # Only process if the root window itself lost focus
        if event.widget == self.root:
            self.root.after(100, self._check_focus)

    def _check_focus(self):
        """Check if focus is still within our window or its child popdowns."""
        try:
            focused = self.root.focus_get()
            
            # Check if focus is on any widget belonging to our window or the combobox popdown
            if focused is not None:
                focused_str = str(focused)
                if focused_str.startswith(str(self.root)) or 'popdown' in focused_str:
                    return  # Keep popup open!
                    
            # Check if the combobox popdown is currently open/visible (try both sibling and child hierarchy)
            popdown_parents = []
            if hasattr(self, 'dropdown_parent_path'):
                popdown_parents.append(self.dropdown_parent_path)
            if hasattr(self, 'dropdown_path'):
                popdown_parents.append(self.dropdown_path)
                
            for parent in popdown_parents:
                popdown_name = f"{parent}.popdown"
                try:
                    if self.root.tk.call('winfo', 'exists', popdown_name) and \
                       self.root.tk.call('winfo', 'ismapped', popdown_name):
                        return  # Keep popup open!
                except Exception:
                    pass

            if focused is None:
                self.close()
        except Exception:
            self.close()

    def _setup_styles(self):
        """Configure styles for ttk widgets."""
        style = ttk.Style(self.root)
        try:
            style.theme_use('clam')
        except Exception:
            pass

        # Configure style for Combobox
        style.configure('TCombobox',
                        fieldbackground=COLORS['bg_card'],
                        background=COLORS['bg_card'],
                        foreground=COLORS['text_primary'],
                        bordercolor=COLORS['border'],
                        lightcolor=COLORS['border'],
                        darkcolor=COLORS['border'],
                        arrowcolor=COLORS['accent_blue'])

        style.map('TCombobox',
                  fieldbackground=[('readonly', COLORS['bg_card']),
                                   ('focus', COLORS['bg_card_hover'])],
                  background=[('readonly', COLORS['bg_card']),
                              ('active', COLORS['bg_card_hover'])],
                  foreground=[('readonly', COLORS['text_primary'])],
                  arrowcolor=[('disabled', COLORS['text_dim']),
                              ('pressed', COLORS['accent_blue']),
                              ('active', COLORS['accent_blue'])],
                  bordercolor=[('focus', COLORS['accent_blue']),
                               ('!focus', COLORS['border'])],
                  lightcolor=[('focus', COLORS['accent_blue']),
                              ('!focus', COLORS['border'])],
                  darkcolor=[('focus', COLORS['accent_blue']),
                             ('!focus', COLORS['border'])])

        # Style the dropdown Listbox
        self.root.option_add('*TCombobox*Listbox.background', COLORS['bg_card'])
        self.root.option_add('*TCombobox*Listbox.foreground', COLORS['text_primary'])
        self.root.option_add('*TCombobox*Listbox.selectBackground', COLORS['bg_card_hover'])
        self.root.option_add('*TCombobox*Listbox.selectForeground', COLORS['accent_blue'])
        self.root.option_add('*TCombobox*Listbox.font', ('Segoe UI', 9))

    def close(self):
        """Close the popup."""
        try:
            self.root.unbind_all("<MouseWheel>")
        except Exception:
            pass
        try:
            self.root.destroy()
        except Exception:
            pass

    def _build_ui(self, today, seven_d, thirty_d, lifetime, daily, last_scan, provider_breakdown):
        """Build all UI elements."""
        # Main scrollable frame
        canvas = tk.Canvas(self.root, bg=COLORS['bg'], highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.root, orient="vertical", command=canvas.yview)

        main_frame = tk.Frame(canvas, bg=COLORS['bg'])
        self.window_item = canvas.create_window((0, 0), window=main_frame, anchor="nw")
        
        def _configure_frame(event):
            # Update canvas scrollregion
            canvas.configure(scrollregion=canvas.bbox("all"))
            
        def _configure_canvas(event):
            # Make sure main_frame fills the full canvas width when canvas resizes
            canvas.itemconfig(self.window_item, width=canvas.winfo_width())
            
        main_frame.bind("<Configure>", _configure_frame)
        canvas.bind("<Configure>", _configure_canvas)
        canvas.configure(yscrollcommand=scrollbar.set)

        # Mouse wheel scrolling
        def _on_mousewheel(event):
            try:
                if canvas.winfo_exists():
                    canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
            except Exception:
                pass
        canvas.bind_all("<MouseWheel>", _on_mousewheel)

        canvas.pack(side="left", fill="both", expand=True)
        # Don't show scrollbar unless needed — keeps it clean

        # --- Header ---
        self._build_header(main_frame, last_scan)

        # --- Today's Stats (hero section) ---
        self._build_hero_section(main_frame, today)

        # --- Per-provider breakdown ---
        if provider_breakdown:
            self._build_provider_section(main_frame, provider_breakdown)

        # --- Divider ---
        self._divider(main_frame)

        # --- Time Range Cards ---
        self._build_stat_card(main_frame, "Last 7 Days", seven_d,
                              COLORS['accent_blue'])
        self._build_stat_card(main_frame, "Last 30 Days", thirty_d,
                              COLORS['accent_purple'])
        self._build_stat_card(main_frame, "Lifetime", lifetime,
                              COLORS['accent_green'])

        # --- Divider ---
        self._divider(main_frame)

        # --- Plan Value & Cost Estimator ---
        self._build_cost_estimator_section(main_frame, today, thirty_d, lifetime)

        # --- Divider ---
        self._divider(main_frame)

        # --- Water Usage Comparison ---
        self._build_water_section(main_frame, today, lifetime)

        # --- Divider ---
        self._divider(main_frame)

        # --- Model Breakdown ---
        self._build_model_breakdown(main_frame, lifetime)

        # --- Settings ---
        self._divider(main_frame)
        self._build_settings(main_frame)

        # --- Source paths footer ---
        if provider_breakdown:
            self._build_sources_footer(main_frame, provider_breakdown)

        # Bottom padding
        tk.Frame(main_frame, bg=COLORS['bg'], height=16).pack(fill='x')

    def _build_header(self, parent, last_scan):
        """Build the header bar."""
        header = tk.Frame(parent, bg=COLORS['bg_secondary'], padx=16, pady=12)
        header.pack(fill='x')

        title = tk.Label(header, text="⚡ Token Tracker",
                         bg=COLORS['bg_secondary'],
                         fg=COLORS['text_primary'],
                         font=('Segoe UI Semibold', 14))
        title.pack(side='left')

        # Close button
        close_btn = tk.Label(header, text="✕",
                             bg=COLORS['bg_secondary'],
                             fg=COLORS['text_secondary'],
                             font=('Segoe UI', 12),
                             cursor='hand2')
        close_btn.pack(side='right')
        close_btn.bind('<Button-1>', lambda e: self.close())
        close_btn.bind('<Enter>',
                       lambda e: close_btn.config(fg=COLORS['accent_red']))
        close_btn.bind('<Leave>',
                       lambda e: close_btn.config(fg=COLORS['text_secondary']))

        # Last scan time
        if last_scan:
            scan_text = f"Last scan: {last_scan.strftime('%H:%M:%S')}"
            scan_lbl = tk.Label(header, text=scan_text,
                                bg=COLORS['bg_secondary'],
                                fg=COLORS['text_dim'],
                                font=('Segoe UI', 8))
            scan_lbl.pack(side='right', padx=(0, 12))

    def _build_hero_section(self, parent, today):
        """Build the prominent 'Today' section."""
        hero = tk.Frame(parent, bg=COLORS['bg'], padx=20, pady=16)
        hero.pack(fill='x')

        tk.Label(hero, text="TODAY",
                 bg=COLORS['bg'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 9, 'bold')).pack(anchor='w')

        # Big number
        total = today.get('total_tokens', 0)
        tk.Label(hero, text=format_tokens(total),
                 bg=COLORS['bg'], fg=COLORS['accent_amber'],
                 font=('Segoe UI Light', 36)).pack(anchor='w', pady=(4, 2))

        tk.Label(hero, text="total tokens",
                 bg=COLORS['bg'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 10)).pack(anchor='w')

        # Breakdown row
        breakdown = tk.Frame(hero, bg=COLORS['bg'])
        breakdown.pack(fill='x', pady=(12, 0))

        self._mini_stat(breakdown, "Prompt",
                        format_tokens(today.get('total_prompt', 0)),
                        COLORS['accent_blue'])
        self._mini_stat(breakdown, "Output",
                        format_tokens(today.get('total_output', 0)),
                        COLORS['accent_green'])
        self._mini_stat(breakdown, "Thinking",
                        format_tokens(today.get('total_thinking', 0)),
                        COLORS['accent_purple'])
        self._mini_stat(breakdown, "Turns",
                        str(today.get('turns', 0)),
                        COLORS['text_secondary'])

    def _build_provider_section(self, parent, provider_breakdown):
        """Build per-provider token breakdown under the Today hero."""
        section = tk.Frame(parent, bg=COLORS['bg'], padx=20, pady=4)
        section.pack(fill='x')

        tk.Label(section, text="BY PROVIDER (TODAY)",
                 bg=COLORS['bg'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 9, 'bold')).pack(anchor='w', pady=(0, 6))

        provider_labels = {
            'antigravity': ('AntiGravity', COLORS['accent_blue']),
            'cursor': ('Cursor', COLORS['accent_purple']),
        }

        for key, (label, color) in provider_labels.items():
            info = provider_breakdown.get(key)
            if not info:
                continue

            card = tk.Frame(section, bg=COLORS['bg_card'], padx=12, pady=8)
            card.pack(fill='x', pady=2)

            header = tk.Frame(card, bg=COLORS['bg_card'])
            header.pack(fill='x')

            tk.Label(header, text=label, bg=COLORS['bg_card'], fg=color,
                     font=('Segoe UI Semibold', 10)).pack(side='left')

            today_tokens = info.get('today_tokens', 0)
            tk.Label(header, text=format_tokens(today_tokens),
                     bg=COLORS['bg_card'], fg=COLORS['text_primary'],
                     font=('Segoe UI Semibold', 11)).pack(side='right')

            accounts = info.get('accounts', [])
            if accounts:
                acct_text = f"Account: {', '.join(accounts)}"
                tk.Label(card, text=acct_text, bg=COLORS['bg_card'],
                         fg=COLORS['text_dim'], font=('Segoe UI', 8)).pack(anchor='w')

            disclaimer = info.get('disclaimer', '')
            if disclaimer:
                tk.Label(card, text=disclaimer, bg=COLORS['bg_card'],
                         fg=COLORS['accent_amber'], font=('Segoe UI', 7)).pack(anchor='w')

    def _build_sources_footer(self, parent, provider_breakdown):
        """Show discovered data source paths."""
        section = tk.Frame(parent, bg=COLORS['bg'], padx=20, pady=4)
        section.pack(fill='x')

        tk.Label(section, text="DATA SOURCES",
                 bg=COLORS['bg'], fg=COLORS['text_dim'],
                 font=('Segoe UI', 8, 'bold')).pack(anchor='w')

        for provider, info in provider_breakdown.items():
            for path in info.get('paths', [])[:3]:
                display = path if len(path) < 55 else "..." + path[-52:]
                tk.Label(section, text=f"  {provider}: {display}",
                         bg=COLORS['bg'], fg=COLORS['text_dim'],
                         font=('Segoe UI', 7)).pack(anchor='w')

    def _mini_stat(self, parent, label, value, color):
        """Build a small stat block inline."""
        frame = tk.Frame(parent, bg=COLORS['bg'])
        frame.pack(side='left', expand=True, fill='x')

        tk.Label(frame, text=value, bg=COLORS['bg'], fg=color,
                 font=('Segoe UI Semibold', 11)).pack(anchor='w')
        tk.Label(frame, text=label, bg=COLORS['bg'],
                 fg=COLORS['text_dim'],
                 font=('Segoe UI', 8)).pack(anchor='w')

    def _build_stat_card(self, parent, title, stats, accent_color):
        """Build a compact stat card for a time range."""
        card = tk.Frame(parent, bg=COLORS['bg_card'], padx=16, pady=12)
        card.pack(fill='x', padx=16, pady=4)

        # Title row
        header = tk.Frame(card, bg=COLORS['bg_card'])
        header.pack(fill='x')

        tk.Label(header, text=title, bg=COLORS['bg_card'],
                 fg=accent_color,
                 font=('Segoe UI Semibold', 10)).pack(side='left')

        total = stats.get('total_tokens', 0)
        tk.Label(header, text=format_tokens(total),
                 bg=COLORS['bg_card'], fg=COLORS['text_primary'],
                 font=('Segoe UI Semibold', 12)).pack(side='right')

        # Details row
        details = tk.Frame(card, bg=COLORS['bg_card'])
        details.pack(fill='x', pady=(6, 0))

        prompt = stats.get('total_prompt', 0)
        output = stats.get('total_output', 0)
        thinking = stats.get('total_thinking', 0)
        turns = stats.get('turns', 0)

        detail_text = (f"↓{format_tokens(prompt)} prompt  "
                       f"↑{format_tokens(output)} output  "
                       f"💭{format_tokens(thinking)} thinking  "
                       f"🔄{turns} turns")
        tk.Label(details, text=detail_text,
                 bg=COLORS['bg_card'], fg=COLORS['text_dim'],
                 font=('Segoe UI', 8)).pack(anchor='w')

    def _build_cost_estimator_section(self, parent, today, thirty_d, lifetime):
        """Build interactive Cost & Plan Value Estimator with slider."""
        section = tk.Frame(parent, bg=COLORS['bg'], padx=16, pady=4)
        section.pack(fill='x')

        header_frame = tk.Frame(section, bg=COLORS['bg'])
        header_frame.pack(fill='x')

        tk.Label(header_frame, text="💰 PLAN VALUE & COST ESTIMATOR",
                 bg=COLORS['bg'], fg=COLORS['accent_green'],
                 font=('Segoe UI', 9, 'bold')).pack(side='left')

        cost_today = compute_cost_from_stats(today)
        cost_30d = compute_cost_from_stats(thirty_d)
        cost_life = compute_cost_from_stats(lifetime)

        # Subtitle
        tk.Label(section, text="Compare flat subscription costs vs equivalent pay-per-token API market value",
                 bg=COLORS['bg'], fg=COLORS['text_dim'],
                 font=('Segoe UI', 8)).pack(anchor='w', pady=(2, 6))

        # Metrics Card (2 columns: 30-Day Value & Lifetime Value)
        metrics_card = tk.Frame(section, bg=COLORS['bg_card'], padx=14, pady=10)
        metrics_card.pack(fill='x', pady=(0, 6))

        # Col 1: 30-Day Value
        c1 = tk.Frame(metrics_card, bg=COLORS['bg_card'])
        c1.pack(side='left', expand=True, fill='x')
        tk.Label(c1, text="30-Day API Value", bg=COLORS['bg_card'],
                 fg=COLORS['text_secondary'], font=('Segoe UI', 8)).pack(anchor='w')
        tk.Label(c1, text=f"${cost_30d['cached_cost']:,.2f}", bg=COLORS['bg_card'],
                 fg=COLORS['accent_green'], font=('Segoe UI Semibold', 13)).pack(anchor='w')
        tk.Label(c1, text=f"Retail: ${cost_30d['retail_cost']:,.2f}", bg=COLORS['bg_card'],
                 fg=COLORS['text_dim'], font=('Segoe UI', 7)).pack(anchor='w')

        # Divider between cols
        tk.Frame(metrics_card, bg=COLORS['border'], width=1).pack(side='left', fill='y', padx=10)

        # Col 2: Lifetime Value
        c2 = tk.Frame(metrics_card, bg=COLORS['bg_card'])
        c2.pack(side='left', expand=True, fill='x')
        tk.Label(c2, text="Lifetime API Value", bg=COLORS['bg_card'],
                 fg=COLORS['text_secondary'], font=('Segoe UI', 8)).pack(anchor='w')
        tk.Label(c2, text=f"${cost_life['cached_cost']:,.2f}", bg=COLORS['bg_card'],
                 fg=COLORS['accent_purple'], font=('Segoe UI Semibold', 13)).pack(anchor='w')
        tk.Label(c2, text=f"Retail: ${cost_life['retail_cost']:,.2f}", bg=COLORS['bg_card'],
                 fg=COLORS['text_dim'], font=('Segoe UI', 7)).pack(anchor='w')

        # Interactive Slider Box
        slider_card = tk.Frame(section, bg=COLORS['bg_card'], padx=14, pady=10)
        slider_card.pack(fill='x', pady=4)

        slider_hdr = tk.Frame(slider_card, bg=COLORS['bg_card'])
        slider_hdr.pack(fill='x')

        tk.Label(slider_hdr, text="Your Monthly Plan Fee:",
                 bg=COLORS['bg_card'], fg=COLORS['text_primary'],
                 font=('Segoe UI Semibold', 9)).pack(side='left')

        fee_display = tk.Label(slider_hdr, text="$20 / mo",
                               bg=COLORS['bg_card'], fg=COLORS['accent_blue'],
                               font=('Segoe UI Semibold', 10))
        fee_display.pack(side='right')

        # Slider variable
        plan_var = tk.DoubleVar(value=20.0)
        mode_var = tk.StringVar(value='cached')

        # Scale slider (tk.Scale for clean dark-theme styling)
        slider = tk.Scale(slider_card, from_=0, to=100, resolution=1, orient='horizontal',
                          variable=plan_var, showvalue=0, bd=0, highlightthickness=0,
                          bg=COLORS['bg_card'], troughcolor=COLORS['bg'],
                          activebackground=COLORS['accent_blue'])
        slider.pack(fill='x', pady=(6, 8))

        # Quick preset pills
        pills_frame = tk.Frame(slider_card, bg=COLORS['bg_card'])
        pills_frame.pack(fill='x')

        def set_fee(val):
            plan_var.set(val)
            _update_estimates()

        presets = [
            ("$20 Single", 20),
            ("$40 Dual Pro", 40),
            ("$60 Triple", 60),
            ("$0 Free Tier", 0),
        ]
        for pill_label, val in presets:
            btn = tk.Label(pills_frame, text=pill_label, bg='#2a3550', fg=COLORS['accent_blue'],
                           font=('Segoe UI', 7, 'bold'), padx=6, pady=3, cursor='hand2')
            btn.pack(side='left', padx=(0, 4))
            btn.bind('<Button-1>', lambda e, v=val: set_fee(v))
            btn.bind('<Enter>', lambda e, b=btn: b.config(bg='#3a4870'))
            btn.bind('<Leave>', lambda e, b=btn: b.config(bg='#2a3550'))

        # Benchmark pricing mode pills
        tier_frame = tk.Frame(slider_card, bg=COLORS['bg_card'])
        tier_frame.pack(fill='x', pady=(8, 0))

        tk.Label(tier_frame, text="API Benchmark:",
                 bg=COLORS['bg_card'], fg=COLORS['text_dim'],
                 font=('Segoe UI', 7)).pack(side='left', padx=(0, 6))

        cached_pill = tk.Label(tier_frame, text="⚡ Prompt Cached",
                               bg='#1f3b2f', fg=COLORS['accent_green'],
                               font=('Segoe UI', 7, 'bold'), padx=6, pady=2, cursor='hand2')
        cached_pill.pack(side='left', padx=2)

        retail_pill = tk.Label(tier_frame, text="🏷️ Retail Uncached",
                               bg='#2a3550', fg=COLORS['text_dim'],
                               font=('Segoe UI', 7), padx=6, pady=2, cursor='hand2')
        retail_pill.pack(side='left', padx=2)

        # Dynamic Verdict & ROI Card
        verdict_card = tk.Frame(section, bg='#132d22', padx=14, pady=10, highlightthickness=1, highlightbackground='#235e40')
        verdict_card.pack(fill='x', pady=(6, 4))

        roi_badge = tk.Label(verdict_card, text="8.3× ROI (+726%)",
                             bg='#132d22', fg=COLORS['accent_green'],
                             font=('Segoe UI Semibold', 12))
        roi_badge.pack(anchor='w')

        net_label = tk.Label(verdict_card, text="+$145.20 / mo net surplus value",
                             bg='#132d22', fg=COLORS['text_primary'],
                             font=('Segoe UI', 9))
        net_label.pack(anchor='w', pady=(2, 0))

        verdict_text = tk.Label(verdict_card, text="",
                                bg='#132d22', fg='#a3cfbb',
                                font=('Segoe UI', 8), wraplength=380, justify='left')
        verdict_text.pack(anchor='w', pady=(4, 0))

        def _update_estimates(*args):
            fee = plan_var.get()
            fee_display.config(text=f"${int(fee)} / mo" if fee == int(fee) else f"${fee:.2f} / mo")

            is_retail = (mode_var.get() == 'retail')
            val_30d = cost_30d['retail_cost'] if is_retail else cost_30d['cached_cost']
            val_life = cost_life['retail_cost'] if is_retail else cost_life['cached_cost']

            # Monthly net value
            net = val_30d - fee

            # Estimate active months (~6 months of sustained usage)
            active_months = 6.0
            life_spent = fee * active_months
            life_net = val_life - life_spent

            if fee > 0:
                roi_mult = val_30d / fee
                roi_pct = ((val_30d - fee) / fee) * 100
                roi_str = f"{roi_mult:.1f}× ROI ({roi_pct:+.0f}%)"
            else:
                roi_mult = float('inf')
                roi_str = "∞ Free Value"

            if net > 50:
                verdict_card.config(bg='#132d22', highlightbackground='#235e40')
                roi_badge.config(bg='#132d22', fg=COLORS['accent_green'], text=roi_str)
                net_label.config(bg='#132d22', text=f"+${net:,.2f} / mo net surplus value  (Lifetime: +${life_net:,.2f})")
                verdict_text.config(bg='#132d22', fg='#a3cfbb',
                    text=f"🔥 Definite YES! You are extracting {roi_mult:.1f}× more API compute than your ${int(fee)} plan fee.")
            elif net > 0:
                verdict_card.config(bg='#132d22', highlightbackground='#235e40')
                roi_badge.config(bg='#132d22', fg=COLORS['accent_green'], text=roi_str)
                net_label.config(bg='#132d22', text=f"+${net:,.2f} / mo net surplus value  (Lifetime: +${life_net:,.2f})")
                verdict_text.config(bg='#132d22', fg='#a3cfbb',
                    text=f"✅ Worth it! Your usage comfortably outvalues your ${int(fee)}/mo subscription cost.")
            elif net == 0:
                verdict_card.config(bg='#262b3a', highlightbackground='#3d455d')
                roi_badge.config(bg='#262b3a', fg=COLORS['accent_amber'], text="1.0× Break-Even")
                net_label.config(bg='#262b3a', text="$0.00 / mo net (even)")
                verdict_text.config(bg='#262b3a', fg=COLORS['text_secondary'],
                    text="⚖️ Exact break-even. You are getting exactly the token volume you pay for.")
            else:
                verdict_card.config(bg='#2d1818', highlightbackground='#5e2323')
                roi_badge.config(bg='#2d1818', fg=COLORS['accent_red'], text=roi_str)
                net_label.config(bg='#2d1818', text=f"-${abs(net):,.2f} / mo underutilized")
                verdict_text.config(bg='#2d1818', fg='#cfabab',
                    text=f"⚠️ Underutilized at ${int(fee)}/mo. You could switch to pay-per-token API or downscale.")

        slider.config(command=lambda v: _update_estimates())

        def switch_mode(mode):
            mode_var.set(mode)
            if mode == 'cached':
                cached_pill.config(bg='#1f3b2f', fg=COLORS['accent_green'], font=('Segoe UI', 7, 'bold'))
                retail_pill.config(bg='#2a3550', fg=COLORS['text_dim'], font=('Segoe UI', 7))
            else:
                retail_pill.config(bg='#3d2c55', fg=COLORS['accent_purple'], font=('Segoe UI', 7, 'bold'))
                cached_pill.config(bg='#2a3550', fg=COLORS['text_dim'], font=('Segoe UI', 7))
            _update_estimates()

        cached_pill.bind('<Button-1>', lambda e: switch_mode('cached'))
        retail_pill.bind('<Button-1>', lambda e: switch_mode('retail'))

        # Initial calculation
        _update_estimates()

    def _build_water_section(self, parent, today, lifetime):
        """Build the water usage comparison section."""
        section = tk.Frame(parent, bg=COLORS['bg'], padx=20, pady=8)
        section.pack(fill='x')

        tk.Label(section, text="💧 WATER USAGE",
                 bg=COLORS['bg'], fg=COLORS['water_blue'],
                 font=('Segoe UI', 9, 'bold')).pack(anchor='w')

        # LLM water today
        today_tokens = today.get('total_tokens', 0)
        today_water_ml = today_tokens * ML_PER_TOKEN

        water_card = tk.Frame(section, bg=COLORS['bg_card'], padx=14, pady=10)
        water_card.pack(fill='x', pady=(8, 4))

        tk.Label(water_card, text="AI Water Usage Today",
                 bg=COLORS['bg_card'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 9)).pack(anchor='w')
        tk.Label(water_card,
                 text=format_water_equivalent(today_water_ml),
                 bg=COLORS['bg_card'], fg=COLORS['water_blue'],
                 font=('Segoe UI Semibold', 11)).pack(anchor='w', pady=(2, 0))

        # LLM water lifetime
        lifetime_tokens = lifetime.get('total_tokens', 0)
        lifetime_water_ml = lifetime_tokens * ML_PER_TOKEN

        water_card2 = tk.Frame(section, bg=COLORS['bg_card'], padx=14, pady=10)
        water_card2.pack(fill='x', pady=4)

        tk.Label(water_card2, text="AI Water Usage Lifetime",
                 bg=COLORS['bg_card'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 9)).pack(anchor='w')
        tk.Label(water_card2,
                 text=format_water_equivalent(lifetime_water_ml),
                 bg=COLORS['bg_card'], fg=COLORS['water_blue'],
                 font=('Segoe UI Semibold', 11)).pack(anchor='w', pady=(2, 0))

        # Human comparison
        human_card = tk.Frame(section, bg=COLORS['bg_card'], padx=14, pady=10)
        human_card.pack(fill='x', pady=4)

        tk.Label(human_card, text="🧍 Human Token-Water Usage",
                 bg=COLORS['bg_card'], fg=COLORS['human_water'],
                 font=('Segoe UI', 9, 'bold')).pack(anchor='w')

        # How many "human days of water" has the AI used?
        human_days = lifetime_water_ml / HUMAN_DAILY_WATER_ML
        if human_days < 1:
            human_equiv = f"Your AI has used {human_days:.3f} days of your drinking water"
        else:
            human_equiv = f"Your AI has used {human_days:.1f} days of your drinking water"

        tk.Label(human_card, text=human_equiv,
                 bg=COLORS['bg_card'], fg=COLORS['text_primary'],
                 font=('Segoe UI', 10)).pack(anchor='w', pady=(4, 0))

        # Fun comparison
        human_tokens_per_day = HUMAN_DAILY_WATER_ML / ML_PER_TOKEN
        tk.Label(human_card,
                 text=f"You drink the equivalent of ~{format_tokens(int(human_tokens_per_day))} tokens/day",
                 bg=COLORS['bg_card'], fg=COLORS['text_dim'],
                 font=('Segoe UI', 8)).pack(anchor='w', pady=(2, 0))

        # Today's efficiency ratio
        if today_water_ml > 0:
            ratio = HUMAN_DAILY_WATER_ML / today_water_ml
            ratio_text = f"You drink {ratio:,.0f}× more water than your AI used today"
        else:
            ratio_text = "No AI water used today — your body wins this round 🏆"
        tk.Label(human_card, text=ratio_text,
                 bg=COLORS['bg_card'], fg=COLORS['text_dim'],
                 font=('Segoe UI', 8)).pack(anchor='w', pady=(2, 0))

    def _build_model_breakdown(self, parent, lifetime):
        """Build the model breakdown section."""
        section = tk.Frame(parent, bg=COLORS['bg'], padx=20, pady=8)
        section.pack(fill='x')

        tk.Label(section, text="🤖 MODELS",
                 bg=COLORS['bg'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 9, 'bold')).pack(anchor='w')

        by_model = lifetime.get('by_model', {})
        if not by_model:
            tk.Label(section, text="No model data available",
                     bg=COLORS['bg'], fg=COLORS['text_dim'],
                     font=('Segoe UI', 9)).pack(anchor='w', pady=4)
            return

        # Sort by total tokens descending
        sorted_models = sorted(by_model.items(),
                               key=lambda x: x[1].get('prompt', 0) + x[1].get('output', 0),
                               reverse=True)

        total_all = lifetime.get('total_tokens', 1)

        model_colors = {
            'gemini': COLORS['accent_blue'],
            'claude': COLORS['accent_purple'],
            'gpt': COLORS['accent_green'],
        }

        for model_name, model_data in sorted_models:
            model_total = model_data.get('prompt', 0) + model_data.get('output', 0)
            pct = (model_total / total_all * 100) if total_all > 0 else 0

            # Pick color based on model name
            color = COLORS['text_primary']
            for prefix, c in model_colors.items():
                if prefix in model_name.lower():
                    color = c
                    break

            row = tk.Frame(section, bg=COLORS['bg_card'], padx=12, pady=8)
            row.pack(fill='x', pady=2)

            # Model name
            display_name = model_name.replace('-', ' ').title()
            tk.Label(row, text=display_name,
                     bg=COLORS['bg_card'], fg=color,
                     font=('Segoe UI', 9)).pack(side='left')

            # Token count + percentage
            info_text = f"{format_tokens(model_total)} ({pct:.1f}%)"
            tk.Label(row, text=info_text,
                     bg=COLORS['bg_card'], fg=COLORS['text_secondary'],
                     font=('Segoe UI', 9)).pack(side='right')

    def _build_settings(self, parent):
        """Build the settings section."""
        section = tk.Frame(parent, bg=COLORS['bg'], padx=20, pady=8)
        section.pack(fill='x')

        tk.Label(section, text="⚙️ SETTINGS",
                 bg=COLORS['bg'], fg=COLORS['text_secondary'],
                 font=('Segoe UI', 9, 'bold')).pack(anchor='w')

        # Refresh interval
        interval_frame = tk.Frame(section, bg=COLORS['bg_card'], padx=12, pady=10)
        interval_frame.pack(fill='x', pady=(8, 4))

        tk.Label(interval_frame, text="Refresh interval",
                 bg=COLORS['bg_card'], fg=COLORS['text_primary'],
                 font=('Segoe UI', 9)).pack(side='left')

        # Dropdown for interval
        interval_var = tk.StringVar(value=str(self.refresh_interval_minutes))
        intervals = ['5', '15', '30', '60', '120', '360']
        interval_labels = {
            '5': '5 min', '15': '15 min', '30': '30 min',
            '60': '1 hour', '120': '2 hours', '360': '6 hours'
        }

        interval_display = tk.StringVar(
            value=interval_labels.get(str(self.refresh_interval_minutes),
                                      f"{self.refresh_interval_minutes} min")
        )

        dropdown = ttk.Combobox(interval_frame,
                                values=[interval_labels[i] for i in intervals],
                                textvariable=interval_display,
                                state='readonly', width=10,
                                font=('Segoe UI', 9))
        dropdown.pack(side='right')
        self.dropdown_path = str(dropdown)
        self.dropdown_parent_path = dropdown.winfo_parent()

        def on_interval_change(event):
            selected = dropdown.get()
            # Reverse lookup
            for k, v in interval_labels.items():
                if v == selected:
                    minutes = int(k)
                    if self.on_refresh_interval_change:
                        self.on_refresh_interval_change(minutes)
                    break
        dropdown.bind('<<ComboboxSelected>>', on_interval_change)

        # Refresh now button
        if self.on_refresh_now:
            refresh_btn = tk.Label(section, text="🔄 Refresh Now",
                                   bg=COLORS['bg_card'],
                                   fg=COLORS['accent_blue'],
                                   font=('Segoe UI', 9),
                                   padx=12, pady=8,
                                   cursor='hand2')
            refresh_btn.pack(fill='x', pady=4)
            refresh_btn.bind('<Button-1>', lambda e: self.on_refresh_now())
            refresh_btn.bind('<Enter>',
                             lambda e: refresh_btn.config(bg=COLORS['bg_card_hover']))
            refresh_btn.bind('<Leave>',
                             lambda e: refresh_btn.config(bg=COLORS['bg_card']))

    def _divider(self, parent):
        """Add a subtle divider line."""
        tk.Frame(parent, bg=COLORS['divider'], height=1).pack(
            fill='x', padx=20, pady=8)

    def run(self):
        """Run the popup's event loop."""
        if self.parent is None:
            self.root.mainloop()


if __name__ == '__main__':
    # Test with dummy data
    dummy_stats = {
        'total_prompt': 125000,
        'total_output': 45000,
        'total_thinking': 12000,
        'total_cached': 80000,
        'total_tokens': 170000,
        'turns': 42,
        'by_model': {
            'gemini-3-flash-a': {'prompt': 100000, 'output': 35000, 'thinking': 8000, 'turns': 30},
            'claude-opus-4-6-thinking': {'prompt': 25000, 'output': 10000, 'thinking': 4000, 'turns': 12},
        }
    }
    dummy_lifetime = {
        'total_prompt': 5_800_000,
        'total_output': 920_000,
        'total_thinking': 300_000,
        'total_cached': 2_000_000,
        'total_tokens': 6_720_000,
        'turns': 811,
        'by_model': {
            'gemini-3-flash-a': {'prompt': 5_000_000, 'output': 700_000, 'thinking': 200_000, 'turns': 737},
            'claude-opus-4-6-thinking': {'prompt': 150_000, 'output': 67_000, 'thinking': 80_000, 'turns': 48},
            'gemini-pro-default': {'prompt': 150_000, 'output': 34_000, 'thinking': 0, 'turns': 25},
        }
    }

    popup = TokenPopup(
        stats_today=dummy_stats,
        stats_7d=dummy_stats,
        stats_30d=dummy_stats,
        stats_lifetime=dummy_lifetime,
        daily_breakdown={},
        refresh_interval_minutes=60,
        last_scan_time=datetime.now()
    )
    popup.run()
