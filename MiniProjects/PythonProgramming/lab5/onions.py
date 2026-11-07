# *****************************************************************************
# Authors:        Bill 'Rusty' Jennings (Driver/Navigator),
#                 Dillon Simeone (Driver/Navigator)
# Assignment:     Lab 5
# Date:           10/20/2026
# Description:    Menu-driven onion breeding and stock management application.
# Inputs:         Menu choices, variety IDs, names, pungency, layer ratings.
# Output:         Onion catalog, breeding summaries, quality classifications,
#                 and stats.
# Sources:        Lab 5 Assignment Instructions, Module 5 course materials.
# *****************************************************************************

# Partner A module (Dillon wriggled on this part solo)
# Onion registry and CRUD operations.


def getInitialStock():
    # Return a new dictionary containing the initial onion varieties.
    return {
        1: {"name": "Red Swamp", "pungency": 8, "layers": 7},
        2: {"name": "Sweet Vidalia", "pungency": 2, "layers": 5},
        3: {"name": "Bog Ogre Pearl", "pungency": 10, "layers": 9},
    }


def addOnion(stock, onionId, name, pungency, layers):
    # Accept a registry and onion traits; insert the record.
    stock[onionId] = {
        "name": name,
        "pungency": pungency,
        "layers": layers,
    }


def editOnion(stock, onionId, pungency, layers):
    # Accept a registry, ID, and traits; return whether edit succeeded.
    if onionId in stock:
        stock[onionId]["pungency"] = pungency
        stock[onionId]["layers"] = layers
        return True
    return False


def deleteOnion(stock, onionId):
    # Accept a registry and ID; return removed record or None.
    if onionId in stock:
        return stock.pop(onionId)
    return None


def formatOnion(onionId, data):
    # Accept an ID and onion record; return a formatted row.
    name = data.get("name", "Unknown")
    pungency = data.get("pungency", 0)
    layers = data.get("layers", 0)
    return f"{onionId:<4} {name:<22} {pungency:>8}/10 {layers:>8}"
