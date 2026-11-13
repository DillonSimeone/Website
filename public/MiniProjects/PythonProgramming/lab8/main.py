# *****************************************************************************
# Authors:       Rusty Jennings, Dillon Simeone
# Assignment:    Lab 8 - Calculator
# Date:          11/10/2026
# Description:   A main app with a Graphical User Interface (GUI) that includes
#                an About screen and 2 discrete calculators apps.
# Inputs:        See individual calculator apps for specific inputs.
# Outputs:       See individual calculator apps for specific outputs.
# Sources:       Lab 8 Assignment Instructions
#                See individual calculator apps for specific sources.
# *****************************************************************************

import tkinter as tk
from tkinter import ttk

from AboutApp import AboutApp
from FilamentMassToLengthApp import FilamentMassToLengthApp
from PlanetaryAgeApp import PlanetaryAgeApp

# Main Window

class MainApp:
    def __init__(self, master):
        master.columnconfigure(0, weight=1)
        master.rowconfigure(0, weight=1)

        # build ui
        self.__main_notebook = ttk.Notebook(master)
        self.__main_notebook.grid(column=0, row=0, sticky='nsew')
        self.__main_notebook.rowconfigure(0, weight=1)
        self.__main_notebook.columnconfigure(0, weight=1)

        # Main widget
        self.__mainwindow = self.__main_notebook

        # Add About app
        about_app = AboutApp(self.__mainwindow)
        self.__main_notebook.add(about_app.get_top_frame(), text="About")

        # Add FilamentMassToLengthApp calculator
        filament_mass_to_length_app = FilamentMassToLengthApp(
            self.__mainwindow
        )
        self.__main_notebook.add(
            filament_mass_to_length_app.get_top_frame(),
            text="Filament Mass to Length",
        )

        # Add PlanetaryAgeApp calculator
        planetary_age_app = PlanetaryAgeApp(self.__mainwindow)
        self.__main_notebook.add(
            planetary_age_app.get_top_frame(), text="Planetary Age"
        )

    def run(self):
        self.__mainwindow.mainloop()

if __name__ == '__main__':
    root = tk.Tk()
    root.title("Dillon & Rusty Calculators")
    app = MainApp(root)
    app.run()
