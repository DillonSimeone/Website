# *****************************************************************************
# Authors:        Bill Jennings (Driver/Navigator),
#                 Dillon Simeone (Driver/Navigator)
# Assignment:     Lab 4
# Date:           10/15/2026
# Description:    Menu-driven hardware store checkout application.
# Inputs:         Menu choices, product IDs, and quantities.
# Output:         Product catalog, shopping cart, and checkout receipt.
# Sources:        Lab 4 Assignment Instructions, Module 4 course materials.
# *****************************************************************************
import calculator as c
import supplies as s


# Bill cooked up below, with Dillon helping
def printWelcome():
    # Display a short introduction.
    print()
    print(s.getStoreTitle())
    print("-" * 51)
    print("Shop for maker hardware, fasteners, and shop consumables.\n")


def printMenu():
    # Display the main menu.
    print()
    print("=" * 51)
    print("MAIN MENU")
    print("=" * 51)
    print("1. View Products")
    print("2. Purchase a Product")
    print("3. View Shopping Cart")
    print("4. Checkout")
    print("5. Quit")
    print("=" * 51)


def readInteger(prompt, minimum, maximum=None):
    # Prompt until a whole number within the allowed range is entered.
    while True:
        response = input(prompt).strip()
        try:
            number = int(response)
        except ValueError:
            print("Please enter a whole number.")
            continue
        if number < minimum or (maximum is not None and number > maximum):
            if maximum is None:
                print(f"Please enter a number of at least {minimum}.")
            else:
                print(f"Please enter a number from {minimum} to {maximum}.")
            continue
        return number


def getMenuChoice():
    # Return a valid main menu choice.
    return readInteger("Choose a menu item: ", 1, 5)


def viewSupplies(items):
    # Display the available catalog.
    print("-" * 51)
    s.printCatalog() # Dillon added this, prints all items in a foreach loop.
    print("-" * 51)


def purchaseItem(items, cart):
    # Prompt for a product and quantity, then update the cart.
    viewSupplies(items)
    while True:
        itemId = readInteger(
            "Enter a product ID to choose a product (0 to cancel): ", 0
        )
        if itemId == 0:
            print("Purchase canceled.")
            return
        item = s.findItemById(itemId)
        if item is not None:
            break
        print("That product ID is not in the catalog. Try again!")

    quantity = readInteger("Enter a quantity (1 or more): ", 1)
    cart[itemId] = cart.get(itemId, 0) + quantity
    print(f"Added {quantity} x {item[1]} to your cart.")


def printCart(cart, items):
    # Display cart lines and subtotal.
    print()
    print("SHOPPING CART")
    print("-" * 51)
    if not cart:
        print("Your cart is empty.")
        return
    print(f"{'Name':<33} {'Qty':>5} {'Total':>12}")
    print("-" * 52)
    for itemId, quantity in cart.items():
        item = s.findItemById(itemId)
        if item is not None:
            _, name, price = item
            amount = c.itemTotal(price, quantity)
            print(f"{name:<33} {quantity:>5} {f'${amount:.2f}':>12}")
    subtotal = c.cartSubtotal(cart, items)

    print("-" * 52)
    print(f"{'Subtotal:':>39} {f'${subtotal:.2f}':>12}")


def checkout(cart, items, taxRate):
    # Print the final receipt and empty the cart.
    if not cart:
        print()
        print("Your cart is empty. Add items before checking out.")
        return
    printCart(cart, items)
    subtotal = c.cartSubtotal(cart, items)
    tax = c.salesTax(subtotal, taxRate)
    total = c.grandTotal(subtotal, tax)
    tax_label = (
        f"Sales tax ({taxRate * 100:.1f}%):" if taxRate > 0 else "Sales tax:"
    )
    print(f"{tax_label:>39} {f'${tax:.2f}':>12}")
    print(f"{'TOTAL:':>39} {f'${total:.2f}':>12}")
    print("Thank you for shopping with us!")
    cart.clear()


def main():
    # Main loop, run the menu until the customer quits.
    items = (
        s.getCatalogItems()
    )  # working now, this returns tuplas: int, string, double.
    cart = {}
    taxRate = 0.0  # App assumes state is Oregon (no sales tax).
    printWelcome()
    while True:
        printMenu()
        choice = getMenuChoice()
        if choice == 1:
            print("\nPRODUCTS")
            viewSupplies(items)
        elif choice == 2:
            print("\nSELECT A PRODUCT")
            purchaseItem(items, cart)
        elif choice == 3:
            printCart(cart, items)
        elif choice == 4:
            checkout(cart, items, taxRate)
        else:
            print("Thank you for your business. Goodbye!")
            print()
            break


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nSession ended. Goodbye!")
