import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, colorchooser, simpledialog, messagebox
from typing import Dict, List, Optional
from PIL import Image, ImageDraw
import pystray
import winreg

from govee_api import GoveeManager, GoveeDevice
from pixelblaze_controller import PixelblazeManager, PixelblazeDevice
from wled_controller import WLEDManager, WLEDDevice
from esp32_now_controller import ESP32NowManager, ESP32NowDevice, PATTERNS as ESP32_PATTERNS

# Colors - Modern Dark Palette
BG_DARK = "#181825"
BG_CARD = "#242438"
BG_CARD_HOVER = "#2a2a44"
BORDER_COLOR = "#313244"
TEXT_PRIMARY = "#cdd6f4"
TEXT_SECONDARY = "#a6adc8"
TEXT_MUTED = "#6c7086"
ACCENT_BLUE = "#89b4fa"
ACCENT_PURPLE = "#cba6f7"
ACCENT_GREEN = "#a6e3a1"
ACCENT_RED = "#f38ba8"
ACCENT_YELLOW = "#f9e2af"
ACCENT_WARM = "#fab387"

PRESET_COLORS = [
    ("#ff5555", 255, 85, 85, "Crimson"),
    ("#ffb86c", 255, 184, 108, "Sunset"),
    ("#50fa7b", 80, 250, 123, "Emerald"),
    ("#8be9fd", 139, 233, 253, "Ice Blue"),
    ("#bd93f9", 189, 147, 249, "Purple"),
    ("#ff79c6", 255, 121, 198, "Pink"),
]

REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_NAME = "GoveeTrayControl"

def is_autostart_enabled() -> bool:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, REG_NAME)
        winreg.CloseKey(key)
        return bool(val)
    except Exception:
        return False

def set_autostart(enable: bool) -> bool:
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_SET_VALUE)
        if enable:
            if getattr(sys, 'frozen', False):
                target_exe = sys.executable
            else:
                target_exe = os.path.abspath(sys.argv[0])
            cmd = f'"{target_exe}" --minimized'
            winreg.SetValueEx(key, REG_NAME, 0, winreg.REG_SZ, cmd)
        else:
            try:
                winreg.DeleteValue(key, REG_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print(f"Error setting autostart: {e}")
        return False

def create_bulb_icon(on: bool = True) -> Image.Image:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if on:
        d.ellipse((4, 4, 60, 60), fill=(255, 215, 0, 45))
        bulb_color = (255, 210, 40)
        base_color = (190, 190, 200)
    else:
        bulb_color = (110, 110, 125)
        base_color = (70, 70, 80)

    d.ellipse((14, 10, 50, 44), fill=bulb_color)
    d.polygon([(20, 36), (44, 36), (39, 49), (25, 49)], fill=bulb_color)
    d.rectangle((26, 49, 38, 54), fill=base_color)
    d.arc((26, 52, 38, 58), start=0, end=180, fill=base_color, width=2)
    return img


# ==============================================================================
# Govee Card
# ==============================================================================
class DeviceCard(tk.Frame):
    def __init__(self, parent, dev: GoveeDevice, manager: GoveeManager, status_callback):
        super().__init__(parent, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1)
        self.dev = dev
        self.manager = manager
        self.status_callback = status_callback
        
        self.brightness_var = tk.IntVar(value=dev.brightness)
        self.is_on_var = tk.BooleanVar(value=dev.is_on)
        self._build_ui()

    def _build_ui(self):
        self.configure(padx=12, pady=7)

        # Header Row
        header = tk.Frame(self, bg=BG_CARD)
        header.pack(fill="x", pady=(0, 4))

        info_frame = tk.Frame(header, bg=BG_CARD)
        info_frame.pack(side="left", fill="y")

        name_label = tk.Label(
            info_frame, 
            text=self.dev.name, 
            font=("Segoe UI", 10, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_CARD
        )
        name_label.pack(anchor="w")

        sub_row = tk.Frame(info_frame, bg=BG_CARD)
        sub_row.pack(anchor="w")

        self.sub_label = tk.Label(
            sub_row, 
            text=self._get_conn_text(), 
            font=("Segoe UI", 8), 
            fg=ACCENT_GREEN if self.dev.lan_ip else TEXT_MUTED, 
            bg=BG_CARD
        )
        self.sub_label.pack(side="left")

        self.lan_btn = tk.Button(
            sub_row,
            text="⚡ IP" if self.dev.lan_ip else "+ Connect IP",
            font=("Segoe UI", 7, "bold"),
            bg=BORDER_COLOR,
            fg=ACCENT_GREEN if self.dev.lan_ip else ACCENT_YELLOW,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=5,
            pady=0,
            cursor="hand2",
            command=self._prompt_lan_ip
        )
        self.lan_btn.pack(side="left", padx=(5, 0))

        # Power Toggle
        self.power_btn = tk.Button(
            header,
            text="ON" if self.dev.is_on else "OFF",
            font=("Segoe UI", 9, "bold"),
            bg=ACCENT_GREEN if self.dev.is_on else BORDER_COLOR,
            fg="#11111b" if self.dev.is_on else TEXT_SECONDARY,
            activebackground=ACCENT_GREEN,
            bd=0,
            padx=14,
            pady=3,
            cursor="hand2",
            command=self._toggle_power
        )
        self.power_btn.pack(side="right")

        # Brightness Slider Row
        bright_frame = tk.Frame(self, bg=BG_CARD)
        bright_frame.pack(fill="x", pady=(1, 3))

        bright_header = tk.Frame(bright_frame, bg=BG_CARD)
        bright_header.pack(fill="x")

        tk.Label(
            bright_header, 
            text="Brightness", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left")

        self.bright_val_label = tk.Label(
            bright_header, 
            text=f"{self.dev.brightness}%", 
            font=("Segoe UI", 8, "bold"), 
            fg=ACCENT_YELLOW, 
            bg=BG_CARD
        )
        self.bright_val_label.pack(side="right")

        self.slider = ttk.Scale(
            bright_frame,
            from_=1,
            to=100,
            orient="horizontal",
            variable=self.brightness_var,
            command=self._on_slider_move
        )
        self.slider.pack(fill="x", pady=(2, 0))
        self.slider.bind("<ButtonRelease-1>", self._on_slider_release)

        # True White Row
        temp_frame = tk.Frame(self, bg=BG_CARD)
        temp_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            temp_frame, 
            text="True White (Max Lumens):", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        temp_btn_row = tk.Frame(temp_frame, bg=BG_CARD)
        temp_btn_row.pack(fill="x")

        for label, kelvin, tint in [("Warm (2700K)", 2700, "#ffd199"), ("Neutral (4000K)", 4000, "#ffeedd"), ("Daylight (6500K)", 6500, "#d8eeff")]:
            btn = tk.Button(
                temp_btn_row,
                text=label,
                font=("Segoe UI", 8),
                bg=BORDER_COLOR,
                fg=tint,
                activebackground=BG_CARD_HOVER,
                bd=0,
                padx=6,
                pady=1,
                cursor="hand2",
                command=lambda k=kelvin, l=label: self._set_color_temp(k, l)
            )
            btn.pack(side="left", padx=(0, 4))

        # Color Presets Row
        color_frame = tk.Frame(self, bg=BG_CARD)
        color_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            color_frame, 
            text="RGB Colors:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        color_btn_row = tk.Frame(color_frame, bg=BG_CARD)
        color_btn_row.pack(fill="x")

        for hex_col, r, g, b, cname in PRESET_COLORS:
            btn = tk.Button(
                color_btn_row,
                bg=hex_col,
                activebackground=hex_col,
                bd=0,
                width=2,
                height=1,
                cursor="hand2",
                command=lambda red=r, gr=g, bl=b, n=cname: self._set_color_rgb(red, gr, bl, n)
            )
            btn.pack(side="left", padx=(0, 4))

        custom_btn = tk.Button(
            color_btn_row,
            text="🎨 Custom...",
            font=("Segoe UI", 8),
            bg=BORDER_COLOR,
            fg=TEXT_PRIMARY,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=6,
            pady=1,
            cursor="hand2",
            command=self._pick_custom_color
        )
        custom_btn.pack(side="left", padx=(4, 0))

    def _toggle_power(self):
        new_state = not self.dev.is_on
        self.manager.set_power(self.dev.mac, new_state)
        self.update_state_ui()
        self.status_callback(f"Turned {self.dev.name} {'ON' if new_state else 'OFF'}")

    def _on_slider_move(self, val):
        v = int(float(val))
        self.bright_val_label.configure(text=f"{v}%")

    def _on_slider_release(self, event=None):
        v = int(self.brightness_var.get())
        self.manager.set_brightness(self.dev.mac, v, debounce=False)
        self.status_callback(f"Set {self.dev.name} brightness to {v}%")
        if not self.dev.is_on:
            self.dev.is_on = True
            self.update_state_ui()

    def _set_color_temp(self, kelvin: int, label: str):
        self.manager.set_color_temp(self.dev.mac, kelvin)
        self.status_callback(f"Set {self.dev.name} to {label}")
        if not self.dev.is_on:
            self.dev.is_on = True
            self.update_state_ui()

    def _set_color_rgb(self, r: int, g: int, b: int, name: str):
        self.manager.set_color_rgb(self.dev.mac, r, g, b)
        self.status_callback(f"Set {self.dev.name} to {name}")
        if not self.dev.is_on:
            self.dev.is_on = True
            self.update_state_ui()

    def _pick_custom_color(self):
        curr_rgb = (
            (self.dev.color_rgb >> 16) & 0xFF,
            (self.dev.color_rgb >> 8) & 0xFF,
            self.dev.color_rgb & 0xFF
        )
        color = colorchooser.askcolor(
            color=f"#{curr_rgb[0]:02x}{curr_rgb[1]:02x}{curr_rgb[2]:02x}",
            title=f"Choose Color for {self.dev.name}"
        )
        if color and color[0]:
            r, g, b = [int(c) for c in color[0]]
            self._set_color_rgb(r, g, b, f"#{r:02x}{g:02x}{b:02x}")

    def _get_conn_text(self):
        if self.dev.lan_ip:
            return f"{self.dev.sku} • LAN ⚡ {self.dev.lan_ip}"
        return f"{self.dev.sku} • Cloud ☁️"

    def _prompt_lan_ip(self):
        curr_val = self.dev.lan_ip or "192.168.1."
        ip = simpledialog.askstring(
            f"Connect {self.dev.name} to LAN",
            f"Enter local Wi-Fi IP for {self.dev.name}:\n\n"
            f"(Found in Govee mobile app: ⚙️ Device Settings ➔ Device Info ➔ IP Address)\n\n"
            f"Leave blank to revert to Cloud mode.",
            initialvalue=curr_val,
            parent=self.winfo_toplevel()
        )
        if ip is not None:
            ip = ip.strip()
            if ip:
                self.manager.set_device_ip(self.dev.mac, ip)
                self.status_callback(f"Connected {self.dev.name} to LAN ({ip}) ⚡")
            else:
                self.manager.set_device_ip(self.dev.mac, "")
                self.status_callback(f"Reverted {self.dev.name} to Cloud mode ☁️")
            self.update_state_ui()

    def update_state_ui(self):
        self.brightness_var.set(self.dev.brightness)
        self.bright_val_label.configure(text=f"{self.dev.brightness}%")
        if self.dev.is_on:
            self.power_btn.configure(text="ON", bg=ACCENT_GREEN, fg="#11111b")
        else:
            self.power_btn.configure(text="OFF", bg=BORDER_COLOR, fg=TEXT_SECONDARY)
        if hasattr(self, "sub_label"):
            self.sub_label.configure(
                text=self._get_conn_text(),
                fg=ACCENT_GREEN if self.dev.lan_ip else TEXT_MUTED
            )
        if hasattr(self, "lan_btn"):
            self.lan_btn.configure(
                text="⚡ IP" if self.dev.lan_ip else "+ Connect IP",
                fg=ACCENT_GREEN if self.dev.lan_ip else ACCENT_YELLOW
            )


# ==============================================================================
# Pixelblaze Card (Dropdown Patterns + Brightness + Power)
# ==============================================================================
class PixelblazeCard(tk.Frame):
    def __init__(self, parent, dev: PixelblazeDevice, manager: PixelblazeManager, status_callback):
        super().__init__(parent, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1)
        self.dev = dev
        self.manager = manager
        self.status_callback = status_callback
        self.brightness_var = tk.IntVar(value=dev.brightness)
        self._pattern_names = []
        self._pattern_ids = []
        self._build_ui()

    def _build_ui(self):
        self.configure(padx=12, pady=7)

        header = tk.Frame(self, bg=BG_CARD)
        header.pack(fill="x", pady=(0, 4))

        info_frame = tk.Frame(header, bg=BG_CARD)
        info_frame.pack(side="left", fill="y")

        name_label = tk.Label(
            info_frame, 
            text=self.dev.name, 
            font=("Segoe UI", 10, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_CARD
        )
        name_label.pack(anchor="w")

        sub_label = tk.Label(
            info_frame, 
            text=f"Pixelblaze ✨ • {self.dev.ip}", 
            font=("Segoe UI", 8), 
            fg=ACCENT_WARM, 
            bg=BG_CARD
        )
        sub_label.pack(anchor="w")

        self.power_btn = tk.Button(
            header,
            text="ON" if self.dev.is_on else "OFF",
            font=("Segoe UI", 9, "bold"),
            bg=ACCENT_GREEN if self.dev.is_on else BORDER_COLOR,
            fg="#11111b" if self.dev.is_on else TEXT_SECONDARY,
            activebackground=ACCENT_GREEN,
            bd=0,
            padx=14,
            pady=3,
            cursor="hand2",
            command=self._toggle_power
        )
        self.power_btn.pack(side="right")

        # Brightness Slider Row
        bright_frame = tk.Frame(self, bg=BG_CARD)
        bright_frame.pack(fill="x", pady=(1, 3))

        bright_header = tk.Frame(bright_frame, bg=BG_CARD)
        bright_header.pack(fill="x")

        tk.Label(
            bright_header, 
            text="Brightness", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left")

        self.bright_val_label = tk.Label(
            bright_header, 
            text=f"{self.dev.brightness}%", 
            font=("Segoe UI", 8, "bold"), 
            fg=ACCENT_YELLOW, 
            bg=BG_CARD
        )
        self.bright_val_label.pack(side="right")

        self.slider = ttk.Scale(
            bright_frame,
            from_=0,
            to=100,
            orient="horizontal",
            variable=self.brightness_var,
            command=self._on_slider_move
        )
        self.slider.pack(fill="x", pady=(2, 0))
        self.slider.bind("<ButtonRelease-1>", self._on_slider_release)

        # Pattern Dropdown Row
        pattern_frame = tk.Frame(self, bg=BG_CARD)
        pattern_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            pattern_frame, 
            text="Pattern Selection:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        self._pattern_ids = list(self.dev.patterns.keys())
        self._pattern_names = [self.dev.patterns[pid] for pid in self._pattern_ids]
        if not self._pattern_names:
            self._pattern_names = ["(Loading patterns...)"]

        self.pattern_combo = ttk.Combobox(
            pattern_frame, 
            values=self._pattern_names, 
            state="readonly",
            style="Dark.TCombobox"
        )
        if self.dev.active_pattern_name in self._pattern_names:
            self.pattern_combo.set(self.dev.active_pattern_name)
        elif self._pattern_names:
            self.pattern_combo.current(0)
        self.pattern_combo.pack(fill="x")
        self.pattern_combo.bind("<<ComboboxSelected>>", self._on_pattern_selected)
        self.pattern_combo.bind("<MouseWheel>", self._on_combo_scroll)

    def _on_combo_scroll(self, event):
        if not self._pattern_names:
            return "break"
        curr_idx = self.pattern_combo.current()
        if curr_idx < 0:
            curr_idx = 0
        step = -1 if event.delta > 0 else 1
        new_idx = max(0, min(len(self._pattern_names) - 1, curr_idx + step))
        if new_idx != curr_idx:
            self.pattern_combo.current(new_idx)
            self._on_pattern_selected()
        return "break"

    def _toggle_power(self):
        new_state = not self.dev.is_on
        self.manager.set_power(self.dev.ip, new_state)
        self.update_state_ui()
        self.status_callback(f"Pixelblaze {self.dev.name}: {'ON' if new_state else 'OFF'}")

    def _on_slider_move(self, val):
        v = int(float(val))
        self.bright_val_label.configure(text=f"{v}%")

    def _on_slider_release(self, event=None):
        v = int(self.brightness_var.get())
        self.manager.set_brightness(self.dev.ip, v)
        self.status_callback(f"Pixelblaze {self.dev.name} brightness: {v}%")
        self.update_state_ui()

    def _on_pattern_selected(self, event=None):
        sel_name = self.pattern_combo.get()
        for pid, name in self.dev.patterns.items():
            if name == sel_name:
                self.manager.set_pattern(self.dev.ip, pid)
                self.status_callback(f"Pixelblaze: {name}")
                self.dev.is_on = True
                self.update_state_ui()
                break

    def update_state_ui(self):
        self.brightness_var.set(self.dev.brightness)
        self.bright_val_label.configure(text=f"{self.dev.brightness}%")
        if self.dev.is_on:
            self.power_btn.configure(text="ON", bg=ACCENT_GREEN, fg="#11111b")
        else:
            self.power_btn.configure(text="OFF", bg=BORDER_COLOR, fg=TEXT_SECONDARY)
        if self.dev.patterns:
            self._pattern_ids = list(self.dev.patterns.keys())
            self._pattern_names = [self.dev.patterns[pid] for pid in self._pattern_ids]
            self.pattern_combo.configure(values=self._pattern_names)
            if self.dev.active_pattern_name in self._pattern_names:
                self.pattern_combo.set(self.dev.active_pattern_name)


# ==============================================================================
# WLED Card (Effects Dropdown + Colors + Brightness + Power)
# ==============================================================================
class WLEDCard(tk.Frame):
    def __init__(self, parent, dev: WLEDDevice, manager: WLEDManager, status_callback):
        super().__init__(parent, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1)
        self.dev = dev
        self.manager = manager
        self.status_callback = status_callback
        self.brightness_var = tk.IntVar(value=dev.brightness)
        self._build_ui()

    def _build_ui(self):
        self.configure(padx=12, pady=7)

        header = tk.Frame(self, bg=BG_CARD)
        header.pack(fill="x", pady=(0, 4))

        info_frame = tk.Frame(header, bg=BG_CARD)
        info_frame.pack(side="left", fill="y")

        name_label = tk.Label(
            info_frame, 
            text=self.dev.name, 
            font=("Segoe UI", 10, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_CARD
        )
        name_label.pack(anchor="w")

        sub_label = tk.Label(
            info_frame, 
            text=f"WLED 🌈 • {self.dev.ip}", 
            font=("Segoe UI", 8), 
            fg=ACCENT_GREEN, 
            bg=BG_CARD
        )
        sub_label.pack(anchor="w")

        self.power_btn = tk.Button(
            header,
            text="ON" if self.dev.is_on else "OFF",
            font=("Segoe UI", 9, "bold"),
            bg=ACCENT_GREEN if self.dev.is_on else BORDER_COLOR,
            fg="#11111b" if self.dev.is_on else TEXT_SECONDARY,
            activebackground=ACCENT_GREEN,
            bd=0,
            padx=14,
            pady=3,
            cursor="hand2",
            command=self._toggle_power
        )
        self.power_btn.pack(side="right")

        # Brightness Slider Row
        bright_frame = tk.Frame(self, bg=BG_CARD)
        bright_frame.pack(fill="x", pady=(1, 3))

        bright_header = tk.Frame(bright_frame, bg=BG_CARD)
        bright_header.pack(fill="x")

        tk.Label(
            bright_header, 
            text="Brightness", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left")

        self.bright_val_label = tk.Label(
            bright_header, 
            text=f"{self.dev.brightness}%", 
            font=("Segoe UI", 8, "bold"), 
            fg=ACCENT_YELLOW, 
            bg=BG_CARD
        )
        self.bright_val_label.pack(side="right")

        self.slider = ttk.Scale(
            bright_frame,
            from_=0,
            to=100,
            orient="horizontal",
            variable=self.brightness_var,
            command=self._on_slider_move
        )
        self.slider.pack(fill="x", pady=(2, 0))
        self.slider.bind("<ButtonRelease-1>", self._on_slider_release)

        # Effect Dropdown Row
        fx_frame = tk.Frame(self, bg=BG_CARD)
        fx_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            fx_frame, 
            text="Effect / Pattern:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        self.effect_combo = ttk.Combobox(
            fx_frame, 
            values=self.dev.effects, 
            state="readonly",
            style="Dark.TCombobox"
        )
        if self.dev.active_effect_name in self.dev.effects:
            self.effect_combo.set(self.dev.active_effect_name)
        elif self.dev.effects:
            self.effect_combo.current(0)
        self.effect_combo.pack(fill="x")
        self.effect_combo.bind("<<ComboboxSelected>>", self._on_effect_selected)
        self.effect_combo.bind("<MouseWheel>", self._on_combo_scroll)

    def _on_combo_scroll(self, event):
        if not self.dev.effects:
            return "break"
        curr_idx = self.effect_combo.current()
        if curr_idx < 0:
            curr_idx = 0
        step = -1 if event.delta > 0 else 1
        new_idx = max(0, min(len(self.dev.effects) - 1, curr_idx + step))
        if new_idx != curr_idx:
            self.effect_combo.current(new_idx)
            self._on_effect_selected()
        return "break"

        # Colors Row
        color_frame = tk.Frame(self, bg=BG_CARD)
        color_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            color_frame, 
            text="Colors:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        color_btn_row = tk.Frame(color_frame, bg=BG_CARD)
        color_btn_row.pack(fill="x")

        for hex_col, r, g, b, cname in PRESET_COLORS:
            btn = tk.Button(
                color_btn_row,
                bg=hex_col,
                activebackground=hex_col,
                bd=0,
                width=2,
                height=1,
                cursor="hand2",
                command=lambda red=r, gr=g, bl=b, n=cname: self._set_color(red, gr, bl, n)
            )
            btn.pack(side="left", padx=(0, 4))

        custom_btn = tk.Button(
            color_btn_row,
            text="🎨 Custom...",
            font=("Segoe UI", 8),
            bg=BORDER_COLOR,
            fg=TEXT_PRIMARY,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=6,
            pady=1,
            cursor="hand2",
            command=self._pick_custom_color
        )
        custom_btn.pack(side="left", padx=(4, 0))

    def _toggle_power(self):
        new_state = not self.dev.is_on
        self.manager.set_power(self.dev.ip, new_state)
        self.update_state_ui()
        self.status_callback(f"WLED {self.dev.name}: {'ON' if new_state else 'OFF'}")

    def _on_slider_move(self, val):
        v = int(float(val))
        self.bright_val_label.configure(text=f"{v}%")

    def _on_slider_release(self, event=None):
        v = int(self.brightness_var.get())
        self.manager.set_brightness(self.dev.ip, v)
        self.status_callback(f"WLED {self.dev.name} brightness: {v}%")
        self.update_state_ui()

    def _on_effect_selected(self, event=None):
        sel_name = self.effect_combo.get()
        self.manager.set_effect(self.dev.ip, sel_name)
        self.status_callback(f"WLED: {sel_name}")
        self.dev.is_on = True
        self.update_state_ui()

    def _set_color(self, r, g, b, name):
        self.manager.set_color(self.dev.ip, r, g, b)
        self.status_callback(f"WLED Color: {name}")
        self.dev.is_on = True
        self.update_state_ui()

    def _pick_custom_color(self):
        curr = self.dev.color_rgb
        color = colorchooser.askcolor(
            color=f"#{curr[0]:02x}{curr[1]:02x}{curr[2]:02x}",
            title=f"Choose Color for {self.dev.name}"
        )
        if color and color[0]:
            r, g, b = [int(c) for c in color[0]]
            self._set_color(r, g, b, f"#{r:02x}{g:02x}{b:02x}")

    def update_state_ui(self):
        self.brightness_var.set(self.dev.brightness)
        self.bright_val_label.configure(text=f"{self.dev.brightness}%")
        if self.dev.is_on:
            self.power_btn.configure(text="ON", bg=ACCENT_GREEN, fg="#11111b")
        else:
            self.power_btn.configure(text="OFF", bg=BORDER_COLOR, fg=TEXT_SECONDARY)
        if self.dev.effects:
            self.effect_combo.configure(values=self.dev.effects)
            if self.dev.active_effect_name in self.dev.effects:
                self.effect_combo.set(self.dev.active_effect_name)


# ==============================================================================
# ESP32-C3 FastLED Card (Groundwork for ESP-NOW)
# ==============================================================================
class ESP32NowCard(tk.Frame):
    def __init__(self, parent, dev: ESP32NowDevice, manager: ESP32NowManager, status_callback):
        super().__init__(parent, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1)
        self.dev = dev
        self.manager = manager
        self.status_callback = status_callback
        self.brightness_var = tk.IntVar(value=dev.brightness)
        self._build_ui()

    def _build_ui(self):
        self.configure(padx=12, pady=7)

        header = tk.Frame(self, bg=BG_CARD)
        header.pack(fill="x", pady=(0, 4))

        info_frame = tk.Frame(header, bg=BG_CARD)
        info_frame.pack(side="left", fill="y")

        name_label = tk.Label(
            info_frame, 
            text=self.dev.name, 
            font=("Segoe UI", 10, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_CARD
        )
        name_label.pack(anchor="w")

        sub_label = tk.Label(
            info_frame, 
            text="ESP32-C3 FastLED • ESP-NOW ⚡", 
            font=("Segoe UI", 8), 
            fg=ACCENT_PURPLE, 
            bg=BG_CARD
        )
        sub_label.pack(anchor="w")

        self.power_btn = tk.Button(
            header,
            text="ON" if self.dev.is_on else "OFF",
            font=("Segoe UI", 9, "bold"),
            bg=ACCENT_GREEN if self.dev.is_on else BORDER_COLOR,
            fg="#11111b" if self.dev.is_on else TEXT_SECONDARY,
            activebackground=ACCENT_GREEN,
            bd=0,
            padx=14,
            pady=3,
            cursor="hand2",
            command=self._toggle_power
        )
        self.power_btn.pack(side="right")

        # Brightness Slider Row
        bright_frame = tk.Frame(self, bg=BG_CARD)
        bright_frame.pack(fill="x", pady=(1, 3))

        bright_header = tk.Frame(bright_frame, bg=BG_CARD)
        bright_header.pack(fill="x")

        tk.Label(
            bright_header, 
            text="Brightness", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left")

        self.bright_val_label = tk.Label(
            bright_header, 
            text=f"{self.dev.brightness}%", 
            font=("Segoe UI", 8, "bold"), 
            fg=ACCENT_YELLOW, 
            bg=BG_CARD
        )
        self.bright_val_label.pack(side="right")

        self.slider = ttk.Scale(
            bright_frame,
            from_=0,
            to=100,
            orient="horizontal",
            variable=self.brightness_var,
            command=self._on_slider_move
        )
        self.slider.pack(fill="x", pady=(2, 0))
        self.slider.bind("<ButtonRelease-1>", self._on_slider_release)

        # Pattern Dropdown Row
        pattern_frame = tk.Frame(self, bg=BG_CARD)
        pattern_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            pattern_frame, 
            text="FastLED Pattern:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        self.pattern_combo = ttk.Combobox(
            pattern_frame, 
            values=ESP32_PATTERNS, 
            state="readonly",
            style="Dark.TCombobox"
        )
        self.pattern_combo.current(self.dev.active_pattern_idx)
        self.pattern_combo.pack(fill="x")
        self.pattern_combo.bind("<<ComboboxSelected>>", self._on_pattern_selected)
        self.pattern_combo.bind("<MouseWheel>", self._on_combo_scroll)

    def _on_combo_scroll(self, event):
        if not ESP32_PATTERNS:
            return "break"
        curr_idx = self.pattern_combo.current()
        if curr_idx < 0:
            curr_idx = 0
        step = -1 if event.delta > 0 else 1
        new_idx = max(0, min(len(ESP32_PATTERNS) - 1, curr_idx + step))
        if new_idx != curr_idx:
            self.pattern_combo.current(new_idx)
            self._on_pattern_selected()
        return "break"

        # Colors Row
        color_frame = tk.Frame(self, bg=BG_CARD)
        color_frame.pack(fill="x", pady=(3, 2))

        tk.Label(
            color_frame, 
            text="Colors:", 
            font=("Segoe UI", 8, "bold"), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(anchor="w", pady=(0, 2))

        color_btn_row = tk.Frame(color_frame, bg=BG_CARD)
        color_btn_row.pack(fill="x")

        for hex_col, r, g, b, cname in PRESET_COLORS:
            btn = tk.Button(
                color_btn_row,
                bg=hex_col,
                activebackground=hex_col,
                bd=0,
                width=2,
                height=1,
                cursor="hand2",
                command=lambda red=r, gr=g, bl=b, n=cname: self._set_color(red, gr, bl, n)
            )
            btn.pack(side="left", padx=(0, 4))

        custom_btn = tk.Button(
            color_btn_row,
            text="🎨 Custom...",
            font=("Segoe UI", 8),
            bg=BORDER_COLOR,
            fg=TEXT_PRIMARY,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=6,
            pady=1,
            cursor="hand2",
            command=self._pick_custom_color
        )
        custom_btn.pack(side="left", padx=(4, 0))

    def _toggle_power(self):
        new_state = not self.dev.is_on
        self.manager.set_power(self.dev.node_id, new_state)
        self.update_state_ui()
        self.status_callback(f"ESP32-C3 FastLED {'ON' if new_state else 'OFF'}")

    def _on_slider_move(self, val):
        v = int(float(val))
        self.bright_val_label.configure(text=f"{v}%")

    def _on_slider_release(self, event=None):
        v = int(self.brightness_var.get())
        self.manager.set_brightness(self.dev.node_id, v)
        self.status_callback(f"ESP32-C3 brightness: {v}%")
        self.update_state_ui()

    def _on_pattern_selected(self, event=None):
        idx = self.pattern_combo.current()
        if idx >= 0:
            self.manager.set_pattern(self.dev.node_id, idx)
            self.status_callback(f"ESP32-C3 Pattern: {ESP32_PATTERNS[idx]}")
            self.dev.is_on = True
            self.update_state_ui()

    def _set_color(self, r, g, b, name):
        self.manager.set_color(self.dev.node_id, r, g, b)
        self.status_callback(f"ESP32-C3 Color: {name}")
        self.pattern_combo.current(0)
        self.dev.is_on = True
        self.update_state_ui()

    def _pick_custom_color(self):
        curr = (self.dev.r, self.dev.g, self.dev.b)
        color = colorchooser.askcolor(
            color=f"#{curr[0]:02x}{curr[1]:02x}{curr[2]:02x}",
            title="Choose Color for ESP32-C3"
        )
        if color and color[0]:
            r, g, b = [int(c) for c in color[0]]
            self._set_color(r, g, b, f"#{r:02x}{g:02x}{b:02x}")

    def update_state_ui(self):
        self.brightness_var.set(self.dev.brightness)
        self.bright_val_label.configure(text=f"{self.dev.brightness}%")
        if self.dev.is_on:
            self.power_btn.configure(text="ON", bg=ACCENT_GREEN, fg="#11111b")
        else:
            self.power_btn.configure(text="OFF", bg=BORDER_COLOR, fg=TEXT_SECONDARY)


# ==============================================================================
# Main Application Controller
# ==============================================================================
class GoveeTrayApp:
    def __init__(self):
        # Enable DPI awareness on Windows for crisp high-res UI
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass

        self.manager = GoveeManager()
        self.pixelblaze_mgr = PixelblazeManager(on_devices_changed=self._on_pixelblaze_changed)
        self.wled_mgr = WLEDManager(on_devices_changed=self._on_wled_changed)
        self.esp32_mgr = ESP32NowManager()

        self.root = tk.Tk()
        self.root.title("Light Controls")
        self.root.configure(bg=BORDER_COLOR)
        self.root.resizable(False, False)

        # Make window completely borderless
        self.root.overrideredirect(True)

        ico_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bulb.ico")
        if os.path.exists(ico_path):
            try:
                self.root.iconbitmap(ico_path)
            except Exception:
                pass

        # Style ttk
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TScale", background=BG_CARD, troughcolor=BORDER_COLOR, sliderrelief="flat")
        style.configure(
            "Dark.TCombobox", 
            fieldbackground=BG_CARD, 
            background=BORDER_COLOR, 
            foreground=TEXT_PRIMARY, 
            arrowcolor=TEXT_PRIMARY,
            darkcolor=BORDER_COLOR,
            lightcolor=BORDER_COLOR,
            bordercolor=BORDER_COLOR
        )
        style.map(
            "Dark.TCombobox", 
            fieldbackground=[("readonly", BG_CARD)], 
            background=[("readonly", BG_CARD), ("active", BG_CARD_HOVER)],
            selectbackground=[("readonly", BG_CARD_HOVER)], 
            selectforeground=[("readonly", TEXT_PRIMARY)]
        )
        for sname in ("TScrollbar", "Vertical.TScrollbar"):
            style.configure(
                sname,
                gripcount=0,
                background=BG_CARD,
                darkcolor=BG_DARK,
                lightcolor=BG_DARK,
                troughcolor=BG_DARK,
                bordercolor=BORDER_COLOR,
                arrowcolor=TEXT_MUTED
            )
            style.map(sname, background=[("active", BG_CARD_HOVER), ("pressed", ACCENT_BLUE)])

        # Popdown listbox styling for all Comboboxes in modern dark palette
        self.root.option_add("*TCombobox*Listbox.background", BG_CARD)
        self.root.option_add("*TCombobox*Listbox.foreground", TEXT_PRIMARY)
        self.root.option_add("*TCombobox*Listbox.selectBackground", ACCENT_BLUE)
        self.root.option_add("*TCombobox*Listbox.selectForeground", "#11111b")
        self.root.option_add("*TCombobox*Listbox.font", ("Segoe UI", 9))
        self.root.option_add("*TCombobox*Listbox.relief", "flat")
        self.root.option_add("*TCombobox*Listbox.borderWidth", 1)
        self.root.option_add("*TCombobox*Listbox.highlightThickness", 1)
        self.root.option_add("*TCombobox*Listbox.highlightColor", BORDER_COLOR)
        self.root.option_add("*TCombobox*Listbox.highlightBackground", BORDER_COLOR)

        self.govee_cards: Dict[str, DeviceCard] = {}
        self.pixelblaze_cards: Dict[str, PixelblazeCard] = {}
        self.wled_cards: Dict[str, WLEDCard] = {}
        self.esp32_card = None
        self.tray_icon = None

        # Drag coordinates for custom title bar
        self._drag_start_x = 0
        self._drag_start_y = 0

        # Build GUI
        self._build_ui()

        # Position window docked above system tray
        self._position_window_near_tray()

        # Ensure autostart with Windows is registered by default
        if not is_autostart_enabled():
            set_autostart(True)

        # If launched on Windows boot (--minimized), start hidden
        if "--minimized" in sys.argv:
            self.root.withdraw()

        # Initial render of cached/known devices immediately so UI shows instantly
        self._render_all_sections()

        # Start background discovery & fetch
        self.status_label.configure(text="Discovering devices on LAN...")
        threading.Thread(target=self._init_data, daemon=True).start()

        # Start Pixelblaze and WLED discovery
        self.pixelblaze_mgr.start_discovery()
        self.wled_mgr.start_discovery()

        # Initialize Tray
        self._setup_tray()

    def _position_window_near_tray(self):
        w = 460
        try:
            import ctypes, ctypes.wintypes
            rect = ctypes.wintypes.RECT()
            # SPI_GETWORKAREA = 0x0030 (desktop rect excluding taskbar)
            ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)
            work_w = rect.right - rect.left
            work_h = rect.bottom - rect.top
            max_h = min(740, work_h - 20)
            x = max(rect.left + 12, rect.right - w - 16)
            y = max(rect.top + 12, rect.bottom - max_h - 10)
            h = max_h
        except Exception:
            screen_w = self.root.winfo_screenwidth()
            screen_h = self.root.winfo_screenheight()
            h = min(740, screen_h - 80)
            x = max(0, screen_w - w - 16)
            y = max(0, screen_h - h - 56)
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def _start_drag(self, event):
        self._drag_start_x = event.x_root - self.root.winfo_x()
        self._drag_start_y = event.y_root - self.root.winfo_y()

    def _do_drag(self, event):
        new_x = event.x_root - self._drag_start_x
        new_y = event.y_root - self._drag_start_y
        self.root.geometry(f"+{new_x}+{new_y}")

    def _build_ui(self):
        self.main_border = tk.Frame(self.root, bg=BORDER_COLOR)
        self.main_border.pack(fill="both", expand=True)

        self.main_frame = tk.Frame(self.main_border, bg=BG_DARK)
        self.main_frame.pack(fill="both", expand=True, padx=1, pady=1)

        # --- Sleek Custom Dark Title Bar ---
        title_bar = tk.Frame(self.main_frame, bg="#1e1e2e", height=36)
        title_bar.pack(fill="x", side="top")
        title_bar.pack_propagate(False)

        title_lbl = tk.Label(
            title_bar,
            text=" 💡  Universal Light Controls",
            font=("Segoe UI", 9, "bold"),
            fg=TEXT_PRIMARY,
            bg="#1e1e2e",
            cursor="fleur"
        )
        title_lbl.pack(side="left", padx=(10, 0))

        # Close Button (X)
        self.close_btn = tk.Label(
            title_bar,
            text=" ✕ ",
            font=("Segoe UI", 11),
            fg=TEXT_SECONDARY,
            bg="#1e1e2e",
            cursor="hand2"
        )
        self.close_btn.pack(side="right", padx=(0, 2), fill="y")
        self.close_btn.bind("<Button-1>", lambda e: self.hide_window())
        self.close_btn.bind("<Enter>", lambda e: self.close_btn.configure(bg="#e06c75", fg="#ffffff"))
        self.close_btn.bind("<Leave>", lambda e: self.close_btn.configure(bg="#1e1e2e", fg=TEXT_SECONDARY))

        # Minimize Button (─)
        min_btn = tk.Label(
            title_bar,
            text=" ─ ",
            font=("Segoe UI", 10),
            fg=TEXT_SECONDARY,
            bg="#1e1e2e",
            cursor="hand2"
        )
        min_btn.pack(side="right", fill="y")
        min_btn.bind("<Button-1>", lambda e: self.hide_window())
        min_btn.bind("<Enter>", lambda e: min_btn.configure(bg="#313244", fg="#ffffff"))
        min_btn.bind("<Leave>", lambda e: min_btn.configure(bg="#1e1e2e", fg=TEXT_SECONDARY))

        title_bar.bind("<ButtonPress-1>", self._start_drag)
        title_bar.bind("<B1-Motion>", self._do_drag)
        title_lbl.bind("<ButtonPress-1>", self._start_drag)
        title_lbl.bind("<B1-Motion>", self._do_drag)

        # Sub-header: App Info + Refresh
        header = tk.Frame(self.main_frame, bg=BG_DARK, padx=14, pady=8)
        header.pack(fill="x")

        title_frame = tk.Frame(header, bg=BG_DARK)
        title_frame.pack(side="left")

        tk.Label(
            title_frame, 
            text="Lighting Station", 
            font=("Segoe UI", 12, "bold"), 
            fg=TEXT_PRIMARY, 
            bg=BG_DARK
        ).pack(anchor="w")

        self.subtitle_label = tk.Label(
            title_frame, 
            text="Govee • Pixelblaze • WLED • ESP32", 
            font=("Segoe UI", 8), 
            fg=TEXT_MUTED, 
            bg=BG_DARK
        )
        self.subtitle_label.pack(anchor="w")

        self.refresh_btn = tk.Button(
            header,
            text="🔄 Refresh",
            font=("Segoe UI", 8),
            bg=BG_CARD,
            fg=TEXT_PRIMARY,
            activebackground=BORDER_COLOR,
            bd=0,
            padx=10,
            pady=3,
            cursor="hand2",
            command=self._trigger_refresh
        )
        self.refresh_btn.pack(side="right")

        # Master Controls Section
        master_frame = tk.Frame(
            self.main_frame, 
            bg=BG_CARD, 
            bd=1, 
            relief="solid", 
            highlightbackground=BORDER_COLOR, 
            highlightthickness=1,
            padx=12,
            pady=8
        )
        master_frame.pack(fill="x", padx=14, pady=(0, 6))

        master_header = tk.Frame(master_frame, bg=BG_CARD)
        master_header.pack(fill="x", pady=(0, 4))

        tk.Label(
            master_header, 
            text="⚡ ALL LIGHTS", 
            font=("Segoe UI", 9, "bold"), 
            fg=ACCENT_PURPLE, 
            bg=BG_CARD
        ).pack(side="left")

        all_off_btn = tk.Button(
            master_header,
            text="ALL OFF",
            font=("Segoe UI", 8, "bold"),
            bg=BORDER_COLOR,
            fg=ACCENT_RED,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=10,
            pady=2,
            cursor="hand2",
            command=self._all_off
        )
        all_off_btn.pack(side="right", padx=(4, 0))

        all_on_btn = tk.Button(
            master_header,
            text="ALL ON",
            font=("Segoe UI", 8, "bold"),
            bg=BORDER_COLOR,
            fg=ACCENT_GREEN,
            activebackground=BG_CARD_HOVER,
            bd=0,
            padx=10,
            pady=2,
            cursor="hand2",
            command=self._all_on
        )
        all_on_btn.pack(side="right")

        # Master Brightness Presets
        bright_presets_row = tk.Frame(master_frame, bg=BG_CARD)
        bright_presets_row.pack(fill="x", pady=(3, 4))

        tk.Label(
            bright_presets_row, 
            text="Master Brightness:", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left", padx=(0, 6))

        for pct in [100, 75, 50, 25, 10]:
            btn = tk.Button(
                bright_presets_row,
                text=f"{pct}%",
                font=("Segoe UI", 8),
                bg=BORDER_COLOR,
                fg=TEXT_PRIMARY,
                activebackground=BG_CARD_HOVER,
                bd=0,
                padx=6,
                pady=1,
                cursor="hand2",
                command=lambda p=pct: self._set_all_brightness(p)
            )
            btn.pack(side="left", padx=(0, 4))

        # Master True White
        white_presets_row = tk.Frame(master_frame, bg=BG_CARD)
        white_presets_row.pack(fill="x")

        tk.Label(
            white_presets_row, 
            text="True White (Max):", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        ).pack(side="left", padx=(0, 6))

        for label, kelvin in [("Daylight", 6500), ("Neutral", 4000), ("Warm", 2700)]:
            btn = tk.Button(
                white_presets_row,
                text=label,
                font=("Segoe UI", 8),
                bg=BORDER_COLOR,
                fg=ACCENT_YELLOW,
                activebackground=BG_CARD_HOVER,
                bd=0,
                padx=6,
                pady=1,
                cursor="hand2",
                command=lambda k=kelvin: self._set_all_color_temp(k)
            )
            btn.pack(side="left", padx=(0, 4))

        # --- Status Bar (Packed at bottom first, guaranteed visible) ---
        status_bar = tk.Frame(self.main_frame, bg=BG_CARD, padx=12, pady=5)
        status_bar.pack(fill="x", side="bottom")

        self.status_label = tk.Label(
            status_bar, 
            text="Ready", 
            font=("Segoe UI", 8), 
            fg=TEXT_SECONDARY, 
            bg=BG_CARD
        )
        self.status_label.pack(side="left")

        self.autostart_var = tk.BooleanVar(value=is_autostart_enabled())
        autostart_cb = tk.Checkbutton(
            status_bar,
            text="Start with Windows",
            variable=self.autostart_var,
            command=self._toggle_autostart,
            font=("Segoe UI", 8),
            bg=BG_CARD,
            fg=TEXT_SECONDARY,
            selectcolor=BG_DARK,
            activebackground=BG_CARD,
            activeforeground=TEXT_PRIMARY,
            bd=0,
            cursor="hand2"
        )
        autostart_cb.pack(side="right", padx=(4, 0))

        # --- Devices Container with Smooth Scrolling ---
        self.scroll_container = tk.Frame(self.main_frame, bg=BG_DARK)
        self.scroll_container.pack(fill="both", expand=True, padx=8, pady=(0, 4))

        self.canvas = tk.Canvas(self.scroll_container, bg=BG_DARK, bd=0, highlightthickness=0, yscrollincrement=15)
        self.scrollbar = ttk.Scrollbar(self.scroll_container, orient="vertical", command=self.canvas.yview, style="Vertical.TScrollbar")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.scrollbar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

        self.devices_frame = tk.Frame(self.canvas, bg=BG_DARK)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.devices_frame, anchor="nw")

        self.devices_frame.bind(
            "<Configure>", 
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas.bind(
            "<Configure>", 
            lambda e: self.canvas.itemconfig(self.canvas_window, width=e.width)
        )
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)
        self.root.bind("<Escape>", lambda e: self.hide_window())

    def _on_mousewheel(self, event):
        w_str = str(event.widget).lower()

        # 1. If cursor is over any part of the opened dropdown popdown (items list, scrollbar, or frame):
        if "popdown" in w_str:
            raw_w = str(event.widget)
            if raw_w.endswith(".l"):
                lb = raw_w
            elif raw_w.endswith(".sb"):
                lb = raw_w[:-3] + ".l"
            else:
                lb = raw_w + ".f.l" if ".f." not in raw_w else raw_w.split(".f.")[0] + ".f.l"

            try:
                units = int(-1 * (event.delta / 30))
                self.root.tk.eval(f"{lb} yview scroll {units} units")
            except Exception:
                pass
            return "break"

        # 2. If cursor is over a Combobox widget (closed dropdown):
        if "combobox" in w_str or "combo" in w_str:
            return "break"

        # 3. Otherwise cursor is over main window canvas:
        bbox = self.canvas.bbox("all")
        if bbox and bbox[3] > self.canvas.winfo_height():
            self.canvas.yview_scroll(int(-1 * (event.delta / 40)), "units")

    def _toggle_autostart(self):
        enabled = self.autostart_var.get()
        set_autostart(enabled)
        self.set_status("Start with Windows: " + ("Enabled" if enabled else "Disabled"))
        self._update_tray_menu()

    def _toggle_autostart_tray(self, icon=None, item=None):
        new_state = not is_autostart_enabled()
        set_autostart(new_state)
        self.autostart_var.set(new_state)
        self.set_status("Start with Windows: " + ("Enabled" if new_state else "Disabled"))
        self._update_tray_menu()

    def _init_data(self):
        self.manager.scan_lan(timeout=1.5)
        self.manager.refresh_devices()
        self.pixelblaze_mgr.refresh_all_devices()
        self.wled_mgr.refresh_all_devices()
        def _update():
            govee_keys = set(self.manager.devices.keys())
            pb_keys = set(self.pixelblaze_mgr.devices.keys())
            wled_keys = set(self.wled_mgr.devices.keys())
            if (govee_keys == set(self.govee_cards.keys()) and 
                pb_keys == set(self.pixelblaze_cards.keys()) and 
                wled_keys == set(self.wled_cards.keys())):
                for card in self.govee_cards.values(): card.update_state_ui()
                for card in self.pixelblaze_cards.values(): card.update_state_ui()
                for card in self.wled_cards.values(): card.update_state_ui()
                return
            self._render_all_sections()
        try:
            self.root.after(0, _update)
        except Exception:
            pass

    def _on_pixelblaze_changed(self):
        def _update():
            current_ips = set(self.pixelblaze_mgr.devices.keys())
            existing_ips = set(self.pixelblaze_cards.keys())
            if current_ips == existing_ips and existing_ips:
                for card in self.pixelblaze_cards.values():
                    card.update_state_ui()
                return
            self._render_all_sections()
        try:
            self.root.after(0, _update)
        except Exception:
            pass

    def _on_wled_changed(self):
        def _update():
            current_ips = set(self.wled_mgr.devices.keys())
            existing_ips = set(self.wled_cards.keys())
            if current_ips == existing_ips and existing_ips:
                for card in self.wled_cards.values():
                    card.update_state_ui()
                return
            self._render_all_sections()
        try:
            self.root.after(0, _update)
        except Exception:
            pass

    def _trigger_refresh(self):
        self.set_status("Scanning for Govee, Pixelblaze, WLED...")
        def _task():
            self.manager.scan_lan(timeout=1.0)
            self.manager.refresh_devices()
            self.pixelblaze_mgr.refresh_all_devices()
            self.wled_mgr.refresh_all_devices()
            self.root.after(0, self._render_all_sections)
            self.root.after(0, lambda: self.set_status("Discovery & refresh complete!"))
        threading.Thread(target=_task, daemon=True).start()

    def _create_section_header(self, parent, title: str, on_add_ip=None):
        hdr = tk.Frame(parent, bg=BG_DARK)
        hdr.pack(fill="x", pady=(6, 4))

        tk.Label(
            hdr, 
            text=title, 
            font=("Segoe UI", 9, "bold"), 
            fg=ACCENT_BLUE, 
            bg=BG_DARK
        ).pack(side="left")

        if on_add_ip:
            add_btn = tk.Button(
                hdr,
                text="+ Add IP",
                font=("Segoe UI", 7),
                bg=BORDER_COLOR,
                fg=TEXT_SECONDARY,
                activebackground=BG_CARD_HOVER,
                bd=0,
                padx=6,
                pady=1,
                cursor="hand2",
                command=on_add_ip
            )
            add_btn.pack(side="right")

    def _render_all_sections(self):
        saved_y = 0.0
        try:
            saved_y = self.canvas.yview()[0]
        except Exception:
            pass

        for child in self.devices_frame.winfo_children():
            child.destroy()
        self.govee_cards.clear()
        self.pixelblaze_cards.clear()
        self.wled_cards.clear()

        # 1. Govee Lights Section
        self._create_section_header(self.devices_frame, "💡 GOVEE LIGHTS", self._prompt_add_govee_ip)
        govee_devs = list(self.manager.devices.values())
        if govee_devs:
            for dev in govee_devs:
                card = DeviceCard(self.devices_frame, dev, self.manager, self.set_status)
                card.pack(fill="x", pady=(0, 6))
                self.govee_cards[dev.mac] = card
        else:
            tk.Label(self.devices_frame, text="No Govee devices found (check API key)", font=("Segoe UI", 8), fg=TEXT_MUTED, bg=BG_DARK).pack(pady=4)

        # 2. Pixelblaze Section
        self._create_section_header(self.devices_frame, "✨ PIXELBLAZE CONTROLLERS", self._prompt_add_pixelblaze)
        pb_devs = list(self.pixelblaze_mgr.devices.values())
        if pb_devs:
            for dev in pb_devs:
                card = PixelblazeCard(self.devices_frame, dev, self.pixelblaze_mgr, self.set_status)
                card.pack(fill="x", pady=(0, 6))
                self.pixelblaze_cards[dev.ip] = card
        else:
            ph = tk.Frame(self.devices_frame, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1, padx=10, pady=8)
            ph.pack(fill="x", pady=(0, 6))
            tk.Label(ph, text="No Pixelblaze detected yet (listening UDP 1889)", font=("Segoe UI", 8), fg=TEXT_MUTED, bg=BG_CARD).pack(side="left")
            tk.Button(ph, text="+ Connect IP", font=("Segoe UI", 8), bg=BORDER_COLOR, fg=ACCENT_WARM, bd=0, padx=8, pady=2, cursor="hand2", command=self._prompt_add_pixelblaze).pack(side="right")

        # 3. WLED Devices Section
        self._create_section_header(self.devices_frame, "🌈 WLED DEVICES", self._prompt_add_wled)
        wled_devs = list(self.wled_mgr.devices.values())
        if wled_devs:
            for dev in wled_devs:
                card = WLEDCard(self.devices_frame, dev, self.wled_mgr, self.set_status)
                card.pack(fill="x", pady=(0, 6))
                self.wled_cards[dev.ip] = card
        else:
            ph = tk.Frame(self.devices_frame, bg=BG_CARD, bd=1, relief="solid", highlightbackground=BORDER_COLOR, highlightthickness=1, padx=10, pady=8)
            ph.pack(fill="x", pady=(0, 6))
            tk.Label(ph, text="No WLED detected yet (mDNS / UDP sync)", font=("Segoe UI", 8), fg=TEXT_MUTED, bg=BG_CARD).pack(side="left")
            tk.Button(ph, text="+ Connect IP", font=("Segoe UI", 8), bg=BORDER_COLOR, fg=ACCENT_GREEN, bd=0, padx=8, pady=2, cursor="hand2", command=self._prompt_add_wled).pack(side="right")

        # 4. Custom ESP32s (FastLED / ESP-NOW) Section
        self._create_section_header(self.devices_frame, "⚡ CUSTOM ESP32-C3 (ESP-NOW)")
        esp_dev = self.esp32_mgr.devices[0]
        self.esp32_card = ESP32NowCard(self.devices_frame, esp_dev, self.esp32_mgr, self.set_status)
        self.esp32_card.pack(fill="x", pady=(0, 6))

        # Update Subtitle count
        total = len(govee_devs) + len(pb_devs) + len(wled_devs) + 1
        self.subtitle_label.configure(
            text=f"{total} Total • {len(govee_devs)} Govee • {len(pb_devs)} Pixelblaze • {len(wled_devs)} WLED • 1 ESP32"
        )
        self.devices_frame.update_idletasks()
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        if saved_y > 0.0:
            try:
                self.canvas.yview_moveto(saved_y)
            except Exception:
                pass
        self.set_status("All devices updated")
        self._update_tray_menu()

    def _prompt_add_govee_ip(self):
        devs = list(self.manager.devices.values())
        if not devs:
            messagebox.showinfo("Govee Lights", "No Govee devices found to assign an IP to.", parent=self.root)
            return

        unassigned = [d for d in devs if not d.lan_ip]
        if len(unassigned) == 1:
            target_dev = unassigned[0]
        elif len(devs) == 1:
            target_dev = devs[0]
        else:
            names = [f"{i+1}. {d.name} ({'LAN: ' + d.lan_ip if d.lan_ip else 'Cloud'})" for i, d in enumerate(devs)]
            choice = simpledialog.askstring(
                "Select Govee Light",
                "Which light would you like to assign a LAN IP to?\n\n" + "\n".join(names) + "\n\nEnter number (1-" + str(len(devs)) + "):",
                parent=self.root
            )
            if not choice or not choice.strip().isdigit():
                return
            idx = int(choice.strip()) - 1
            if 0 <= idx < len(devs):
                target_dev = devs[idx]
            else:
                return

        curr_val = target_dev.lan_ip or "192.168.1."
        ip = simpledialog.askstring(
            f"Connect {target_dev.name} to LAN",
            f"Enter local Wi-Fi IP for {target_dev.name}:\n\n"
            f"(Found in Govee mobile app: ⚙️ Device Settings ➔ Device Info ➔ IP Address)\n\n"
            f"Leave blank to revert to Cloud mode.",
            initialvalue=curr_val,
            parent=self.root
        )
        if ip is not None:
            ip = ip.strip()
            if ip:
                self.manager.set_device_ip(target_dev.mac, ip)
                self.set_status(f"Connected {target_dev.name} to LAN ({ip}) ⚡")
            else:
                self.manager.set_device_ip(target_dev.mac, "")
                self.set_status(f"Reverted {target_dev.name} to Cloud mode ☁️")
            card = self.govee_cards.get(target_dev.mac)
            if card:
                card.update_state_ui()

    def _prompt_add_pixelblaze(self):
        ip = simpledialog.askstring("Add Pixelblaze", "Enter Pixelblaze Controller IP:\n(e.g. 192.168.1.50)", parent=self.root)
        if ip:
            self.set_status(f"Connecting to Pixelblaze at {ip}...")
            def _add():
                success = self.pixelblaze_mgr.add_manual_ip(ip)
                msg = f"Pixelblaze {ip}: {'Connected!' if success else 'Failed to reach'}"
                self.root.after(0, lambda: self.set_status(msg))
            threading.Thread(target=_add, daemon=True).start()

    def _prompt_add_wled(self):
        ip = simpledialog.askstring("Add WLED", "Enter WLED Device IP:\n(e.g. 192.168.1.65)", parent=self.root)
        if ip:
            self.set_status(f"Connecting to WLED at {ip}...")
            def _add():
                success = self.wled_mgr.add_manual_ip(ip)
                msg = f"WLED {ip}: {'Connected!' if success else 'Failed to reach'}"
                self.root.after(0, lambda: self.set_status(msg))
            threading.Thread(target=_add, daemon=True).start()

    def set_status(self, msg: str):
        self.root.after(0, lambda: self.status_label.configure(text=msg))

    def _all_on(self):
        self.manager.set_all_power(True)
        for ip in self.pixelblaze_mgr.devices:
            self.pixelblaze_mgr.set_power(ip, True)
        for ip in self.wled_mgr.devices:
            self.wled_mgr.set_power(ip, True)
        self.esp32_mgr.set_power(0, True)

        for card in list(self.govee_cards.values()) + list(self.pixelblaze_cards.values()) + list(self.wled_cards.values()):
            card.dev.is_on = True
            card.update_state_ui()
        if self.esp32_card:
            self.esp32_card.dev.is_on = True
            self.esp32_card.update_state_ui()
        self.set_status("All lights turned ON")
        self._update_tray_icon()

    def _all_off(self):
        self.manager.set_all_power(False)
        for ip in self.pixelblaze_mgr.devices:
            self.pixelblaze_mgr.set_power(ip, False)
        for ip in self.wled_mgr.devices:
            self.wled_mgr.set_power(ip, False)
        self.esp32_mgr.set_power(0, False)

        for card in list(self.govee_cards.values()) + list(self.pixelblaze_cards.values()) + list(self.wled_cards.values()):
            card.dev.is_on = False
            card.update_state_ui()
        if self.esp32_card:
            self.esp32_card.dev.is_on = False
            self.esp32_card.update_state_ui()
        self.set_status("All lights turned OFF")
        self._update_tray_icon()

    def _set_all_brightness(self, pct: int):
        self.manager.set_all_brightness(pct)
        for ip in self.pixelblaze_mgr.devices:
            self.pixelblaze_mgr.set_brightness(ip, pct)
        for ip in self.wled_mgr.devices:
            self.wled_mgr.set_brightness(ip, pct)
        self.esp32_mgr.set_brightness(0, pct)

        for card in list(self.govee_cards.values()) + list(self.pixelblaze_cards.values()) + list(self.wled_cards.values()):
            card.dev.brightness = pct
            card.dev.is_on = True
            card.update_state_ui()
        if self.esp32_card:
            self.esp32_card.dev.brightness = pct
            self.esp32_card.dev.is_on = True
            self.esp32_card.update_state_ui()
        self.set_status(f"All lights brightness set to {pct}%")
        self._update_tray_icon()

    def _set_all_color_temp(self, kelvin: int):
        self.manager.set_all_color_temp(kelvin)
        for card in self.govee_cards.values():
            card.dev.color_temp_k = kelvin
            card.dev.is_on = True
            card.update_state_ui()
        self.set_status(f"Govee lights set to True White ({kelvin}K)")
        self._update_tray_icon()

    def _do_show_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.attributes("-topmost", False)
        self.root.focus_force()

    def hide_window(self):
        self.root.withdraw()

    def toggle_window(self, icon=None, item=None):
        if self.root.winfo_viewable():
            self.root.after(0, self.hide_window)
        else:
            self.root.after(0, self._do_show_window)

    def _setup_tray(self):
        icon_img = create_bulb_icon(True)
        menu = self._build_tray_menu()
        self.tray_icon = pystray.Icon(
            "govee_tray",
            icon_img,
            "Light Controls",
            menu=menu
        )
        self.tray_icon.run_detached()

    def _update_tray_icon(self):
        if not self.tray_icon:
            return
        any_on = any(d.is_on for d in self.manager.devices.values()) or any(d.is_on for d in self.pixelblaze_mgr.devices.values()) or any(d.is_on for d in self.wled_mgr.devices.values())
        self.tray_icon.icon = create_bulb_icon(any_on)

    def _update_tray_menu(self):
        if self.tray_icon:
            self.tray_icon.menu = self._build_tray_menu()
            self._update_tray_icon()

    def _build_tray_menu(self) -> pystray.Menu:
        items = []

        # Master Controls
        items.append(pystray.MenuItem("🎛️ Toggle Controls", self.toggle_window, default=True))
        items.append(pystray.Menu.SEPARATOR)

        def make_all_bright(pct):
            return lambda icon, item: self._set_all_brightness(pct)

        def make_all_temp(k):
            return lambda icon, item: self._set_all_color_temp(k)

        all_brightness_items = [
            pystray.MenuItem(f"{p}%", make_all_bright(p))
            for p in [100, 75, 50, 25, 10]
        ]
        all_white_items = [
            pystray.MenuItem("☀️ Daylight (6500K)", make_all_temp(6500)),
            pystray.MenuItem("💡 Neutral White (4000K)", make_all_temp(4000)),
            pystray.MenuItem("🕯️ Warm White (2700K)", make_all_temp(2700)),
        ]

        all_menu = pystray.Menu(
            pystray.MenuItem("Turn All ON", lambda icon, item: self._all_on()),
            pystray.MenuItem("Turn All OFF", lambda icon, item: self._all_off()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Brightness", pystray.Menu(*all_brightness_items)),
            pystray.MenuItem("True White (Max)", pystray.Menu(*all_white_items)),
        )
        items.append(pystray.MenuItem("⚡ All Lights", all_menu))
        items.append(pystray.Menu.SEPARATOR)

        # Govee Submenus
        for mac, dev in self.manager.devices.items():
            def make_dev_power(m, st): return lambda icon, item: self.manager.set_power(m, st)
            def make_dev_bright(m, p): return lambda icon, item: self.manager.set_brightness(m, p)
            dev_items = [
                pystray.MenuItem("Turn ON" if not dev.is_on else "Turn OFF", make_dev_power(mac, not dev.is_on)),
                pystray.MenuItem("Brightness", pystray.Menu(*[pystray.MenuItem(f"{p}%", make_dev_bright(mac, p)) for p in [100, 75, 50, 25, 10]]))
            ]
            items.append(pystray.MenuItem(f"💡 {dev.name}", pystray.Menu(*dev_items)))

        # Pixelblaze Submenus
        for ip, dev in self.pixelblaze_mgr.devices.items():
            def make_pb_power(i, st): return lambda icon, item: self.pixelblaze_mgr.set_power(i, st)
            def make_pb_bright(i, p): return lambda icon, item: self.pixelblaze_mgr.set_brightness(i, p)
            def make_pb_pat(i, pid): return lambda icon, item: self.pixelblaze_mgr.set_pattern(i, pid)

            pb_pattern_items = [
                pystray.MenuItem(pname, make_pb_pat(ip, pid))
                for pid, pname in list(dev.patterns.items())[:15] # Top 15 patterns
            ]
            pb_items = [
                pystray.MenuItem("Turn ON" if not dev.is_on else "Turn OFF", make_pb_power(ip, not dev.is_on)),
                pystray.MenuItem("Brightness", pystray.Menu(*[pystray.MenuItem(f"{p}%", make_pb_bright(ip, p)) for p in [100, 75, 50, 25, 10]]))
            ]
            if pb_pattern_items:
                pb_items.append(pystray.MenuItem("Patterns", pystray.Menu(*pb_pattern_items)))
            items.append(pystray.MenuItem(f"✨ {dev.name}", pystray.Menu(*pb_items)))

        # WLED Submenus
        for ip, dev in self.wled_mgr.devices.items():
            def make_wled_power(i, st): return lambda icon, item: self.wled_mgr.set_power(i, st)
            def make_wled_bright(i, p): return lambda icon, item: self.wled_mgr.set_brightness(i, p)
            def make_wled_fx(i, fx): return lambda icon, item: self.wled_mgr.set_effect(i, fx)

            wled_fx_items = [
                pystray.MenuItem(fx, make_wled_fx(ip, fx))
                for fx in dev.effects[:15]
            ]
            w_items = [
                pystray.MenuItem("Turn ON" if not dev.is_on else "Turn OFF", make_wled_power(ip, not dev.is_on)),
                pystray.MenuItem("Brightness", pystray.Menu(*[pystray.MenuItem(f"{p}%", make_wled_bright(ip, p)) for p in [100, 75, 50, 25, 10]])),
                pystray.MenuItem("Effects", pystray.Menu(*wled_fx_items))
            ]
            items.append(pystray.MenuItem(f"🌈 {dev.name}", pystray.Menu(*w_items)))

        # ESP32-C3 FastLED Submenu
        def make_esp_pat(idx): return lambda icon, item: self.esp32_mgr.set_pattern(0, idx)
        def make_esp_bright(p): return lambda icon, item: self.esp32_mgr.set_brightness(0, p)
        esp_items = [
            pystray.MenuItem("Turn ON" if not self.esp32_mgr.devices[0].is_on else "Turn OFF", lambda icon, item: self.esp32_mgr.set_power(0, not self.esp32_mgr.devices[0].is_on)),
            pystray.MenuItem("Brightness", pystray.Menu(*[pystray.MenuItem(f"{p}%", make_esp_bright(p)) for p in [100, 75, 50, 25, 10]])),
            pystray.MenuItem("Patterns", pystray.Menu(*[pystray.MenuItem(pname, make_esp_pat(i)) for i, pname in enumerate(ESP32_PATTERNS)]))
        ]
        items.append(pystray.MenuItem("⚡ ESP32-C3 FastLED", pystray.Menu(*esp_items)))

        items.append(pystray.Menu.SEPARATOR)
        items.append(pystray.MenuItem("🔄 Refresh Devices", lambda icon, item: self._trigger_refresh()))
        items.append(pystray.MenuItem("Start with Windows", self._toggle_autostart_tray, checked=lambda item: is_autostart_enabled()))
        items.append(pystray.MenuItem("❌ Exit", self.quit_app))

        return pystray.Menu(*items)

    def quit_app(self, icon=None, item=None):
        self.pixelblaze_mgr.close()
        self.wled_mgr.stop_discovery()
        if self.tray_icon:
            self.tray_icon.stop()
        self.root.after(0, self.root.destroy)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = GoveeTrayApp()
    app.run()
