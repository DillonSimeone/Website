# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 6
# Date:          10/31/2026
# Description:   Business logic / domain model layer for Census Name records.
#                that instantiates Database to retrieve and map records.
# Inputs:        Name string, gender string, year integer, count integer.
# Output:        Name objects and formatted data representations.
# Sources:       Lab 6 Assignment Instructions
# *****************************************************************************
from Database import Database

class Name:

    def __init__(self, name="", gender="", year=0, count=0):
        self.__name = ""
        self.__gender = ""
        self.__year = 0
        self.__count = 0

        self.setName(name)
        self.setGender(gender)
        self.setYear(year)
        self.setCount(count)

    def getName(self):
        return self.__name

    def setName(self, name):
        self.__name = str(name).strip()

    def getGender(self):
        return self.__gender

    def setGender(self, gender):
        self.__gender = str(gender).strip().upper()

    def getYear(self):
        return self.__year

    def setYear(self, year):
        try:
            self.__year = int(year)
        except (ValueError, TypeError):
            self.__year = 0

    def getCount(self):
        return self.__count

    def setCount(self, count):
        try:
            self.__count = int(count)
        except (ValueError, TypeError):
            self.__count = 0

    def __str__(self):
        return f"{self.__name} {self.__gender} {self.__year} {self.__count}"

    @classmethod
    def getNames(cls):
        """
        Instantiates the Database class, calls its readNames()
        method to retrieve raw dictionary records, and build objects.
        """
        db = Database()
        records = db.readNames()
        lstNames = []
        for item in records:
            name_obj = cls(
                name=item.get("name", ""),
                gender=item.get("gender", ""),
                year=item.get("year", 0),
                count=item.get("count", 0),
            )
            lstNames.append(name_obj)
        return lstNames
