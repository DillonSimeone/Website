# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 9
# Date:          11/20/2026
# Description:   GUI browser for yearly name popularity in the NAMES database.
# Inputs:        name, gender via tkinter/pygubu UI
# Output:        Yearly name popularity rows displayed in a Treeview table
# Sources:       Lab 9 instructions, imdb_browser
# *****************************************************************************
import os
import tkinter as tk
from tkinter import ttk
import pygubu

from NamePopularity import NamePopularity


class NameBrowserApp:
    """GUI application for browsing yearly name popularity."""

    PROJECT_PATH = os.path.dirname(__file__)
    PROJECT_UI = os.path.join(PROJECT_PATH, "name_browser.ui")

    def __init__(self, master=None):
        """Build the UI, configure widgets, and load initial data."""
        self.__builder = None
        self.__main_window = None
        self.__name_entry = None
        self.__gender_var = None
        self.__treeview = None

        self.load_ui(master)
        self.setup_treeview()
        self.__name_entry.insert(0, "Marc")
        self.__gender_var.set("M")
        self.fetch_data()

    def load_ui(self, master):
        """Load the pygubu UI file and bind widget references and callbacks."""
        self.__builder = builder = pygubu.Builder()
        builder.add_resource_path(NameBrowserApp.PROJECT_PATH)
        builder.add_from_file(NameBrowserApp.PROJECT_UI)
        self.__main_window = builder.get_object("mainwindow", master)
        builder.connect_callbacks(self)

        self.__name_entry = builder.get_object("name_entry", master)
        self.__gender_var = builder.get_variable("gender")
        self.__treeview = builder.get_object("name_treeview", master)

    def setup_treeview(self):
        """Configure Treeview columns, headings, and alternating row styling."""
        tree = self.__treeview
        self.create_treeview_style()
        columns = ("name", "year", "gender", "name_count", "total")
        tree.configure(columns=columns, displaycolumns=columns, style="Custom.Treeview")

        tree.heading("name", text="Name", anchor=tk.W)
        tree.heading("year", text="Year")
        tree.heading("gender", text="Gender")
        tree.heading("name_count", text="NameCount")
        tree.heading("total", text="Total")

        tree.column("name", width=160, anchor=tk.W)
        tree.column("year", width=100, anchor=tk.CENTER)
        tree.column("gender", width=90, anchor=tk.CENTER)
        tree.column("name_count", width=120, anchor=tk.CENTER)
        tree.column("total", width=120, anchor=tk.CENTER)

        tree.tag_configure("odd", background="#ccffff")

    @staticmethod
    def fixed_map(option, style):
        """Workaround for Treeview alternating row colors in modern Tk."""
        return [
            elm
            for elm in style.map("Treeview", query_opt=option)
            if elm[:2] != ("!disabled", "!selected")
        ]

    @staticmethod
    def create_treeview_style():
        """Configure custom heading and row style for the Treeview."""
        style = ttk.Style()
        style.map(
            "Treeview",
            foreground=NameBrowserApp.fixed_map("foreground", style),
            background=NameBrowserApp.fixed_map("background", style),
        )
        style.configure(
            "Custom.Treeview.Heading",
            background="dark blue",
            foreground="white",
            font=("Arial", 10, "bold"),
        )
        return style

    @staticmethod
    def record_to_tuple(record):
        """Convert a NamePopularity object to a tuple for Treeview insertion."""
        return (
            record.get_name(),
            record.get_year(),
            record.get_gender(),
            record.get_name_count(),
            record.get_total(),
        )

    def fetch_data(self):
        """Query the database for the current name and gender and populate the table."""
        for item in self.__treeview.get_children():
            self.__treeview.delete(item)

        name = self.__name_entry.get().strip()
        gender = self.__gender_var.get()
        if not name or gender not in ("M", "F"):
            return

        records = NamePopularity.fetch_name_popularity(name, gender)
        for index, record in enumerate(records):
            tag = "odd" if index % 2 else "even"
            self.__treeview.insert(
                "",
                "end",
                values=NameBrowserApp.record_to_tuple(record),
                tag=tag,
            )

    def on_name_changed(self, event=None):
        """Refresh table when the user types in the name entry."""
        self.fetch_data()

    def on_gender_changed(self):
        """Refresh table when the user selects a gender radio button."""
        self.fetch_data()

    def on_search(self, event=None):
        """Refresh table when the Search button is clicked or Enter is pressed."""
        self.fetch_data()

    def run(self):
        """Start the tkinter main event loop."""
        self.__main_window.mainloop()


if __name__ == "__main__":
    app = NameBrowserApp()
    app.run()
