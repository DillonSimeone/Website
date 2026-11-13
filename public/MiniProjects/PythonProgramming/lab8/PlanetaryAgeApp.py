# *****************************************************************************
# Author:        Rusty Jennings (Driver)
# Partner:       Dillon Simeone (Navigator)
# Assignment:    Lab 8 - Calculator
# Date:          11/10/2026
# Description:   App B: An app to calculate what your age would be if you were
#                born on and lived your whole life on Venus or Mars.
# Inputs:        Age in Earth years
# Outputs:       Equivalent age in Venus years and Mars years
# Sources:       Lab 8 Assignment Instructions
#                NASA planetary orbital period data, approximate sidereal years
# *****************************************************************************

import math
import os
import tkinter as tk
import tkinter.messagebox as mb

import pygubu

PROJECT_PATH = os.path.dirname(__file__)
PROJECT_UI = os.path.join(PROJECT_PATH, "planetary_age.ui")


class PlanetaryAgeApp:
    """Calculates equivalent ages in Venus and Mars orbital years."""

    # Approximate sidereal orbital periods in Earth days.
    EARTH_YEAR_DAYS = 365.256
    VENUS_YEAR_DAYS = 224.701
    MARS_YEAR_DAYS = 686.980

    def __init__(self, master):
        self.__builder = builder = pygubu.Builder()
        builder.add_resource_path(PROJECT_PATH)
        builder.add_from_file(PROJECT_UI)
        self.__mainwindow = builder.get_object("top_frame", master)
        builder.connect_callbacks(self)

        # UI elements
        self.__age_entry = builder.get_object("age_entry", master)
        self.__venus_entry_variable = builder.get_variable(
            "venus_entry_variable"
        )
        self.__mars_entry_variable = builder.get_variable(
            "mars_entry_variable"
        )

    def calculate(self):
        """Converts Earth age in years to Venus and Mars years."""
        try:
            age = float(self.__age_entry.get().strip())
            if not math.isfinite(age) or age < 0:
                mb.showerror(
                    title="Invalid Input",
                    message="Age must be a non-negative, finite number."
                )
                return

            venus = age * self.EARTH_YEAR_DAYS / self.VENUS_YEAR_DAYS
            mars = age * self.EARTH_YEAR_DAYS / self.MARS_YEAR_DAYS

            self.__venus_entry_variable.set(f"{venus:.2f} years")
            self.__mars_entry_variable.set(f"{mars:.2f} years")
        except ValueError:
            mb.showerror(
                title="Invalid Input",
                message="Please enter a valid numeric age in Earth years."
            )

    def get_top_frame(self):
        """Returns the top frame so it can be added to a notebook tab."""
        return self.__mainwindow

    def run(self):
        self.__mainwindow.mainloop()


if __name__ == "__main__":
    root = tk.Tk()
    root.title("Planetary Age Calculator")
    app = PlanetaryAgeApp(root)
    app.run()
