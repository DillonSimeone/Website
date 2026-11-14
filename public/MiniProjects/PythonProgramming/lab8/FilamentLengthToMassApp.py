# *****************************************************************************
# Author:        Rusty Jennings (Driver)
# Partner:       Dillon Simeone (Navigator)
# Assignment:    Lab 8 - Calculator
# Date:          11/10/2026
# Description:   App B: Filament Length to Mass Calculator for
#                standard 1.75 mm PLA filament.
# Inputs:        Filament length in meters
# Output:        Calculated mass in grams and ounces
# Sources:       Lab 8 Assignment Instructions
#                PLA Material Density & Formulas (1.24 g/cm³):
#                https://kg-m3.com/material/pla-polylactide
# *****************************************************************************

import math
import os
import tkinter as tk
import tkinter.messagebox as mb

import pygubu

PROJECT_PATH = os.path.dirname(__file__)
PROJECT_UI = os.path.join(PROJECT_PATH, "filament_length_to_mass.ui")


class FilamentLengthToMassApp:
    """Calculates filament mass from length for 1.75 mm PLA."""

    # 1.75 mm PLA physical constants
    # Source (Density = 1.24 g/cm³): https://kg-m3.com/material/pla-polylactide
    FILAMENT_RADIUS_CM = 0.175 / 2.0  # 0.0875 cm (from 1.75 mm diameter)
    DENSITY_G_PER_CM3 = 1.24          # 1.24 g/cm³ standard PLA density
    OUNCES_PER_GRAM = 1.0 / 28.349523125

    # Cross-sectional area: pi * r^2 (cm^2)
    CROSS_SECTION_CM2 = math.pi * (FILAMENT_RADIUS_CM ** 2)

    # Mass per 1 meter of filament: Area (cm^2) * Density (g/cm^3) * 100 cm/m
    # Area (0.02405 cm^2) * 1.24 g/cm^3 * 100 = ~2.983 grams per meter
    GRAMS_PER_METER = CROSS_SECTION_CM2 * DENSITY_G_PER_CM3 * 100.0


    def __init__(self, master):
        self.__builder = builder = pygubu.Builder()
        builder.add_resource_path(PROJECT_PATH)
        builder.add_from_file(PROJECT_UI)
        self.__mainwindow = builder.get_object("top_frame", master)
        builder.connect_callbacks(self)

        # UI elements
        self.__length_entry = builder.get_object("length_entry", master)
        self.__grams_entry_variable = builder.get_variable(
            "grams_entry_variable"
        )
        self.__ounces_entry_variable = builder.get_variable(
            "ounces_entry_variable"
        )

    def calculate(self):
        """Converts filament length in meters to mass in grams and ounces."""
        try:
            length = float(self.__length_entry.get().strip())
            if not math.isfinite(length) or length < 0:
                mb.showerror(
                    title="Invalid Input",
                    message="Filament length must be a finite, "
                            "non-negative number."
                )
                return

            grams = length * self.GRAMS_PER_METER
            ounces = grams * self.OUNCES_PER_GRAM

            self.__grams_entry_variable.set(f"{grams:.2f} g")
            self.__ounces_entry_variable.set(f"{ounces:.2f} oz")
        except ValueError:
            mb.showerror(
                title="Invalid Input",
                message="Please enter a valid numeric length in meters."
            )

    def get_top_frame(self):
        """Returns the top frame so it can be added to a notebook tab."""
        return self.__mainwindow

    def run(self):
        self.__mainwindow.mainloop()


if __name__ == "__main__":
    root = tk.Tk()
    root.title("Filament Length to Mass")
    app = FilamentLengthToMassApp(root)
    app.run()
