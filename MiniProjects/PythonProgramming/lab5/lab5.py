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
import breeder as b
import onions as o


# Bill and Dillon collaborated on UI, driver loop, and input validation.
def main():
    # Run the menu loop; accepts no arguments and returns nothing.
    stock = o.getInitialStock()
    printWelcome()

    while True:
        printMenu()
        choice = getMenuChoice()

        if choice == 1:
            displayStock(stock)
        elif choice == 2:
            addVariety(stock)
        elif choice == 3:
            editVariety(stock)
        elif choice == 4:
            deleteVariety(stock)
        elif choice == 5:
            breedVarieties(stock)
        elif choice == 6:
            displayStats(stock)
        elif choice == 7:
            print("\nExiting Shrek's Onion Breeding Registry.")
            print("Keep on layering!\n")
            break


def printWelcome():
    # Print the welcome message; accepts no arguments.
    print()
    print("=" * 60)
    print("      SHREK'S ONION BREEDING & GENETICS REGISTRY      ")
    print("=" * 60)
    print("Welcome to the swamp breeding station! Manage your prize")
    print("onion varieties, cross-breed new cultivars, and analyze")
    print("layer counts and pungency ratings.")
    print("=" * 60)


def printMenu():
    # Print menu choices; accepts no arguments.
    print()
    print("-" * 35)
    print("             MAIN MENU             ")
    print("-" * 35)
    print("1. View Onion Varieties")
    print("2. Add a New Onion Variety")
    print("3. Edit Onion Traits")
    print("4. Cull (Delete) an Onion Variety")
    print("5. Cross-Breed Two Varieties")
    print("6. View Registry Statistics")
    print("7. Quit Program")
    print("-" * 35)


def readInteger(prompt, minimum, maximum=None):
    # Repeatedly prompt for an integer within the supplied bounds.
    while True:
        response = input(prompt).strip()
        try:
            number = int(response)
        except ValueError:
            print("Invalid input. Please enter a whole number.")
            continue
        if number < minimum or (maximum is not None and number > maximum):
            if maximum is None:
                print(f"Number must be at least {minimum}. Try again.")
            else:
                print(f"Number must be between {minimum} and {maximum}. Try again.")
            continue
        return number


def readString(prompt):
    # Repeatedly prompt until a nonempty name is entered.
    while True:
        text = input(prompt).strip()
        if text:
            return text
        print("Input cannot be blank. Please enter a valid name.")


def getMenuChoice():
    # Prompt for and return a validated menu number.
    return readInteger("Choose an option (1-7): ", 1, 7)


def displayStock(stock):
    # Accept a registry and print all onion records and quality tiers.
    print()
    print(f"{'ID':<4} {'Name':<22} {'Pungency':>10} {'Layers':>8} {'Quality Tier':<16}")
    print("-" * 64)
    if not stock:
        print("The onion registry is currently empty.")
        return
    for onionId, data in stock.items():
        row = o.formatOnion(onionId, data)
        quality = b.classifyQuality(data["pungency"], data["layers"])
        print(f"{row}  {quality:<16}")


def addVariety(stock):
    # Accept a registry, collect traits, and insert a new variety.
    print("\n--- ADD NEW ONION VARIETY ---")
    newId = max(stock.keys(), default=0) + 1
    name = readString("Enter variety name: ")
    pungency = readInteger("Enter pungency level (1-10): ", 1, 10)
    layers = readInteger("Enter layer count (1-20): ", 1, 20)

    o.addOnion(stock, newId, name, pungency, layers)
    print(f"\nSuccess! Added #{newId} '{name}' to the registry.")


def editVariety(stock):
    # Accept a registry and update a selected variety.
    print("\n--- EDIT ONION TRAITS ---")
    if not stock:
        print("No onions available to edit.")
        return
    displayStock(stock)
    while True:
        onionId = readInteger("\nEnter the ID of the onion to edit (0 to cancel): ", 0)
        if onionId == 0:
            print("Edit canceled.")
            return
        if onionId in stock:
            break
        print(f"Onion #{onionId} does not exist in registry. Try again.")
    current = stock[onionId]
    print(
        f"Editing '{current['name']}' "
        f"(Current: Pungency={current['pungency']}, "
        f"Layers={current['layers']})"
    )
    newPungency = readInteger("Enter new pungency (1-10): ", 1, 10)
    newLayers = readInteger("Enter new layer count (1-20): ", 1, 20)
    o.editOnion(stock, onionId, newPungency, newLayers)
    print(f"\nSuccess! Updated #{onionId} '{current['name']}'.")


def deleteVariety(stock):
    # Accept a registry and remove a selected variety.
    print("\n--- CULL (DELETE) ONION VARIETY ---")
    if not stock:
        print("No onions available to delete.")
        return
    displayStock(stock)
    while True:
        onionId = readInteger("\nEnter the ID of the onion to cull (0 to cancel): ", 0)
        if onionId == 0:
            print("Cull canceled.")
            return
        if onionId in stock:
            break
        print(f"Onion #{onionId} does not exist in registry. Try again.")
    removed = o.deleteOnion(stock, onionId)
    print(f"\nSuccess! Culled #{onionId} '{removed['name']}' from the registry.")

def breedVarieties(stock):
    # Accept a registry and add a hybrid from two distinct parents.
    # Cross-breed two selected varieties to produce a child hybrid
    print("\n--- CROSS-BREED TWO ONIONS ---")
    if len(stock) < 2:
        print("You need at least 2 onion varieties to cross-breed.")
        return

    displayStock(stock)
    parent1Id = readInteger("\nChoose parent #1 ID: ", 1)
    while parent1Id not in stock:
        print(f"Onion #{parent1Id} not found in registry.")
        parent1Id = readInteger("Choose parent #1 ID: ", 1)

    parent2Id = readInteger("Choose parent #2 ID: ", 1)
    while parent2Id not in stock or parent2Id == parent1Id:
        if parent2Id == parent1Id:
            print("Cannot self-pollinate! Choose a different second parent.")
        else:
            print(f"Onion #{parent2Id} not found in registry.")
        parent2Id = readInteger("Choose parent #2 ID: ", 1)

    defaultChildName = (
        f"{stock[parent1Id]['name'][:4]}-{stock[parent2Id]['name'][:4]} Hybrid"
    )
    print(f"Suggested name: {defaultChildName}")
    childName = readString("Enter name for the new hybrid variety: ")

    child = b.breedOnions(stock[parent1Id], stock[parent2Id], childName)
    newId = max(stock.keys(), default=0) + 1
    o.addOnion(stock, newId, child["name"], child["pungency"], child["layers"])

    quality = b.classifyQuality(child["pungency"], child["layers"])
    print(f"\n*** HYBRID CREATED: #{newId} '{child['name']}' ***")
    print(
        f"Pungency: {child['pungency']}/10 | "
        f"Layers: {child['layers']} | Quality: {quality}"
    )


def displayStats(stock):
    # Accept a registry and print its count and trait averages.
    # Display overall collection statistics with zero-division safeguard
    print("\n--- REGISTRY STATISTICS ---")
    count = len(stock)
    print(f"Total Varieties Registered: {count}")
    if count == 0:
        print("No variety data available for averages.")
        return

    avgPungency = b.calculateAveragePungency(stock)
    avgLayers = b.calculateAverageLayers(stock)
    print(f"Average Pungency Rating:    {avgPungency} / 10")
    print(f"Average Layer Count:        {avgLayers} layers")


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nSession ended. Goodbye!")
