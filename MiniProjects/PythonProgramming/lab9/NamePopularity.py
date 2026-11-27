# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 9
# Date:          11/20/2026
# Description:   Logic layer representing yearly popularity for a name.
# Inputs:        name, year, gender, name_count, total
# Output:        NamePopularity objects and database query delegation
# Sources:       Lab 9 instructions, imdb_browser
# *****************************************************************************
from Database import Database


class NamePopularity:
    """Application logic layer for a single year of name popularity data."""

    def __init__(self, name, year, gender, name_count, total):
        """Initialize a NamePopularity record."""
        self.__name = name
        self.__year = year
        self.__gender = gender
        self.__name_count = name_count
        self.__total = total

    def get_name(self):
        return self.__name

    def get_year(self):
        return self.__year

    def get_gender(self):
        return self.__gender

    def get_name_count(self):
        return self.__name_count

    def get_total(self):
        return self.__total

    @staticmethod
    def fetch_name_popularity(name, gender):
        """Delegate fetching name popularity records to the data layer."""
        return Database.fetch_name_popularity(name, gender)
