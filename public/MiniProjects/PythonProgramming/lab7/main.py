# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 7
# Date:          11/08/2026
# Description:   UI layer for searching the Onion database.
# Inputs:        species, min_age
# Output:        Matching onions printed to console
# Sources:       Lab 7 instructions
# *****************************************************************************
from Onion import Onion

VALID_SPECIES = ["yellow", "red", "white", "sweet", "shallot"]

def get_species():
    while True:
        species = input("Enter onion species (Yellow, Red, White, Sweet, Shallot): ").strip()
        if species.lower() in VALID_SPECIES:
            return species
        print("Please enter Yellow, Red, White, Sweet, or Shallot!")

def get_min_age():
    while True:
        val = input("Enter minimum age in days (1 to 200): ").strip()
        try:
            age = int(val)
            if 1 <= age <= 200:
                return age
            print("Age must be between 1 and 200!")
        except ValueError:
            print("Please enter a whole number!")

def main():
    print("Welcome to the Onion Database!\n")

    species = get_species()
    min_age = get_min_age()

    onions = Onion.readOnions(species, min_age)

    print(f"\nMatching {species.title()} onions (age >= {min_age} days):\n")
    print(f"{'ID':<6}{'Species':<12}{'Age':<10}{'Weight (g)':<10}")
    for item in onions:
        print(f"{item.getId():<6}{item.getSpecies():<12}{item.getAge():<10}{item.getWeight():<10.1f}")


if __name__ == "__main__":
    main()
