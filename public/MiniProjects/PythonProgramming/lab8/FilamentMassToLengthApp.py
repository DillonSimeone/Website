# *****************************************************************************
# Author:        Dillon Simeone (Navigator)
# Partner:       Rusty (Driver)
# Assignment:    Lab 8 - Calculator
# Date:          11/10/2026
# Description:   App A: Filament Mass to Extruded Length Calculator for standard
#                1.75 mm PLA filament.
# Inputs:        Filament mass in grams
# Output:        Calculated length in meters and feet
# Sources:       - Lab 8 Assignment Instructions
#                - PLA Material Density & Formulas (1.24 g/cm³):
#                  https://kg-m3.com/material/pla-polylactide
# *****************************************************************************

import math
import os
import tkinter as tk
import tkinter.messagebox as mb
import pygubu

PROJECT_PATH = os.path.dirname(__file__)
PROJECT_UI = os.path.join(PROJECT_PATH, "filament_mass_to_length.ui")


class FilamentMassToLengthApp:
    """Calculates extruded length from filament mass for 1.75 mm PLA."""

    # 1.75 mm PLA physical constants
    # Source (Density = 1.24 g/cm³): https://kg-m3.com/material/pla-polylactide
    FILAMENT_RADIUS_CM = 0.175 / 2.0  # 0.0875 cm (from 1.75 mm diameter)
    DENSITY_G_PER_CM3 = 1.24          # 1.24 g/cm³ standard PLA density
    FEET_PER_METER = 3.28084

    # Cross-sectional area: pi * r^2 (cm^2)
    CROSS_SECTION_CM2 = math.pi * (FILAMENT_RADIUS_CM ** 2)

    # Mass per 1 meter of filament: Area (cm^2) * Density (g/cm^3) * 100 cm/m
    # Area (0.02405 cm^2) * 1.24 g/cm^3 * 100 = ~2.983 grams per meter
    GRAMS_PER_METER = CROSS_SECTION_CM2 * DENSITY_G_PER_CM3 * 100.0

    # Extruded length per 1 gram: 1 / GRAMS_PER_METER = ~0.335 meters per gram
    METERS_PER_GRAM = 1.0 / GRAMS_PER_METER

    def __init__(self, master):
        self.__builder = builder = pygubu.Builder()
        builder.add_resource_path(PROJECT_PATH)
        builder.add_from_file(PROJECT_UI)
        self.__mainwindow = builder.get_object("top_frame", master)
        builder.connect_callbacks(self)

        # UI elements
        self.__mass_entry = builder.get_object("mass_entry", master)
        self.__meters_entry_variable = builder.get_variable("meters_entry_variable")
        self.__feet_entry_variable = builder.get_variable("feet_entry_variable")

    def calculate(self):
        """Converts mass in grams to extruded length in meters and feet."""
        try:
            mass = float(self.__mass_entry.get().strip())
            if mass < 0:
                mb.showerror(
                    title="Invalid Input",
                    message="Filament mass cannot be negative."
                )
                return

            meters = mass * self.METERS_PER_GRAM
            feet = meters * self.FEET_PER_METER

            self.__meters_entry_variable.set(f"{meters:.2f} m")
            self.__feet_entry_variable.set(f"{feet:.2f} ft")
        except ValueError:
            mb.showerror(
                title="Invalid Input",
                message="Please enter a valid numeric mass in grams."
            )

    def get_top_frame(self):
        """Returns the top frame so it can be added to a notebook tab."""
        return self.__mainwindow

    def run(self):
        self.__mainwindow.mainloop()


if __name__ == "__main__":
    root = tk.Tk()
    root.title("Filament Mass to Length")
    app = FilamentMassToLengthApp(root)
    app.run()
