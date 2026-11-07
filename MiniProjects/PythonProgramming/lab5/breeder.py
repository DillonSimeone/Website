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

# Partner B module (Bill AKA 'Rusty'): Breeding calculations modules.


def breedOnions(parent1, parent2, childName):
    # Accept two onion dictionaries and a name; return their hybrid record.
    # Rounded averages keep the hybrid traits within the original ranges.
    pungency = (parent1["pungency"] + parent2["pungency"] + 1) // 2
    layers = (parent1["layers"] + parent2["layers"] + 1) // 2
    return {"name": childName, "pungency": pungency, "layers": layers}


def classifyQuality(pungency, layers):
    # Accept two trait ratings and return a descriptive quality tier.
    if pungency >= 8 and layers >= 8:
        return "Ogre Supreme"
    if pungency >= 5 and layers >= 5:
        return "Swamp Select"
    return "Garden Variety"


def calculateAveragePungency(stock):
    # Accept the registry and return its mean pungency, or zero if empty.
    if not stock:
        return 0.0
    total = 0
    for onion in stock.values():
        total += onion["pungency"]
    return round(total / len(stock), 2)


def calculateAverageLayers(stock):
    # Accept the registry and return its mean layers, or zero if empty.
    if not stock:
        return 0.0
    total = 0
    for onion in stock.values():
        total += onion["layers"]
    return round(total / len(stock), 2)
