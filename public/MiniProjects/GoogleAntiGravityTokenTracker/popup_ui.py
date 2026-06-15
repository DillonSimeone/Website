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
                 last_scan_time: datetime | None = None):
        """
        Create the popup window.

        Each stats dict should have keys:
            total_prompt, total_output, total_thinking, total_cached,
            total_tokens, turns, by_model
        """
        self.on_refresh_interval_change = on_refresh_interval_change
        self.on_refresh_now = on_refresh_now
        self.refresh_interval_minutes = refresh_interval_minutes

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
        popup_w = 420
        popup_h = 680
        x = screen_w - popup_w - 12
        y = screen_h - popup_h - 52  # Above taskbar
        self.root.geometry(f"{popup_w}x{popup_h}+{x}+{y}")

        # Close on focus loss
        self.root.bind('<FocusOut>', self._on_focus_out)
        self.root.bind('<Escape>', lambda e: self.close())

        # Build UI
        self._build_ui(stats_today, stats_7d, stats_30d, stats_lifetime,
                       daily_breakdown, last_scan_time)

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
        # Small delay to handle clicks on child widgets
        self.root.after(100, self._check_focus)

    def _check_focus(self):
        """Check if focus is still within our window."""
        try:
            focused = self.root.focus_get()
            if focused is None:
                self.close()
        except Exception:
            self.close()

    def close(self):
        """Close the popup."""
        try:
            self.root.destroy()
        except Exception:
            pass

    def _build_ui(self, today, seven_d, thirty_d, lifetime, daily, last_scan):
        """Build all UI elements."""
        # Main scrollable frame
        canvas = tk.Canvas(self.root, bg=COLORS['bg'], highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.root, orient="vertical", command=canvas.yview)

        main_frame = tk.Frame(canvas, bg=COLORS['bg'])
        main_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=main_frame, anchor="nw",
                             width=self.root.winfo_reqwidth() or 420)
        canvas.configure(yscrollcommand=scrollbar.set)

        # Mouse wheel scrolling
        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        canvas.bind_all("<MouseWheel>", _on_mousewheel)

        canvas.pack(side="left", fill="both", expand=True)
        # Don't show scrollbar unless needed — keeps it clean

        # --- Header ---
        self._build_header(main_frame, last_scan)

        # --- Today's Stats (hero section) ---
        self._build_hero_section(main_frame, today)

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

        # --- Water Usage Comparison ---
        self._build_water_section(main_frame, today, lifetime)

        # --- Divider ---
        self._divider(main_frame)

        # --- Model Breakdown ---
        self._build_model_breakdown(main_frame, lifetime)

        # --- Settings ---
        self._divider(main_frame)
        self._build_settings(main_frame)

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
                                state='readonly', width=10)
        dropdown.pack(side='right')

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
