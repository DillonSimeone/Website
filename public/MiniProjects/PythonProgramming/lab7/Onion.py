# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 7
# Date:          11/08/2026
# Description:   Business logic layer for Onion objects.
# Inputs:        species, min_age
# Output:        List of Onion objects
# Sources:       Lab 7 instructions
# *****************************************************************************
from Database import Database


class Onion:

    # Initialize an Onion with 4 properties
    def __init__(self, onion_id=0, species="", age=0, weight=0.0):
        self.__id = int(onion_id)
        self.__species = str(species)
        self.__age = int(age)
        self.__weight = float(weight)

    def getId(self):
        return self.__id

    def getSpecies(self):
        return self.__species

    def getAge(self):
        return self.__age

    def getWeight(self):
        return self.__weight

    # Convert dictionary rows from Database into Onion objects
    @staticmethod
    def readOnions(species, min_age):
        records = Database.readOnions(species, min_age)
        onions = []
        for item in records:
            onions.append(Onion(item["id"], item["species"], item["age"], item["weight"]))
        return onions
