# *****************************************************************************
# Authors:        Bill Jennings (Driver/Navigator),
#                 Dillon Simeone (Driver/Navigator)
# Assignment:     Lab 4
# Date:           10/15/2026
# Description:    The store's infomation, inventory and name.
# Inputs:         None
# Output:         Product catalog
# Sources:        Lab 4 Assignment Instructions, Module 4 course materials.
# *****************************************************************************

# Supplies.py
# Partner A module (Dillon worked on this part solo)
# Provide hardware catalog data/lookup
def getStoreTitle():
    return "Shrek's Maker Supplies"


def getCatalogItems():
    return [
        (1, "Onion Bolts", 4.50),
        (2, "Slug-potato batteries", 6.75),
        (3, "Humming bird beak", 10.00),
        (4, "Lead-free soldering mud", 12.50),
        (5, "Leaded soldering mud", 6.25),
    ]


def printCatalog():
    items = getCatalogItems()
    for item in items:
        print(f"Item ID: {item[0]} Name: {item[1]} Price: ${item[2]:.2f}")


def findItemById(itemID):
    for item in getCatalogItems():
        if item[0] == itemID:
            return item
    return None  # oopies, be careful where you put none returns
