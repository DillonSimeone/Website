# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 6
# Date:          10/31/2026
# Description:   UI / Presentation layer for Lab 6.
# Inputs:        None
# Output:        List of names, genders, years, and counts printed to console.
# Sources:       Lab 6 Assignment Instructions & Professor Clarification Post.
# *****************************************************************************
from Name import Name


def main():
    names = Name.getNames()
    
    for item in names:
        print(f"{item.getName()} {item.getGender()} {item.getYear()} {item.getCount()}")


if __name__ == "__main__":
    main()
