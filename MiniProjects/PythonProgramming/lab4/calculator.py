# *****************************************************************************
# Authors:        Bill Jennings (Driver/Navigator),
#                 Dillon Simeone (Driver/Navigator)
# Assignment:     Lab 4
# Date:           10/15/2026
# Description:    Does the magical math for the entire store
# Inputs:         Numbers, int, float, double
# Output:         More numbers, int, float, double
# Sources:        Lab 4 Assignment Instructions, Module 4 course materials.
# *****************************************************************************

# Bill worked on below solo
# Reusable math functions.


def add(a, b):
    return a + b


def subtract(a, b):
    return a - b


def multiply(a, b):
    return a * b


def divide(a, b):
    if b == 0:
        raise ValueError("Denominator cannot be zero")
    return a / b


def itemTotal(price, quantity):
    # Return the extended price of a cart line.
    return round(multiply(price, quantity), 2)


def cartSubtotal(cart, items):
    # Return the total of all cart lines.
    total = 0.0
    for itemId, quantity in cart.items():
        for catalogId, _, price in items:
            if itemId == catalogId:
                total = add(total, itemTotal(price, quantity))
                break
    return round(total, 2)


def salesTax(subtotal, taxRate):
    # Calculate sales tax using a decimal rate (e.g., 0.07).
    return round(multiply(subtotal, taxRate), 2)


def grandTotal(subtotal, tax):
    # Return the total of subtotal and tax.
    return round(add(subtotal, tax), 2)
