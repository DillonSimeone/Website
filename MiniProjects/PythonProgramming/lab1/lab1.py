
# **********************************************************************
# Author: Dillon Simeone
# Assignment: Lab1
# Date: 9/25/2026
# Description: A shopping program to calucate the 
# cost of items, taxes and shipping.
#
# Input: float, char
# Output: NAH (printed string)
# Sources: https://github.com/PCC-CIS-133Y/lab_1.git
# **********************************************************************

# Shopping program
# Inputs: float cost, float taxRate, float shipping
# Outputs: float totalPrice

def main():
    taxRate = 0.0
    shipping = 0.0
    totalCost = 0.0

    totalCost = getItemCosts()
    taxRate, shipping = getOtherCosts()
    printReceipt(totalCost, taxRate, shipping)

    print("Thank you!")

# getItemCosts() prompts a user for a list of item
# costs and returns the sum
def getItemCosts():
    itemCost = 0.0
    totalCost = 0.0
    more = 'y'

    while more == 'y':
        itemCost = float(input("Enter item cost $ "))
        totalCost = totalCost + itemCost
        more = input("Do you have more items (y/n): ")
    #print("shrek debugging prints, shrek says to beware of python cases")
    #print("itemcost: ", itemcost)
    #print("itemCost: ", itemCost)
    return totalCost
 
# getOtherCosts() prompts a user for the tax rate
# and shipping costs and returns both inputs
def getOtherCosts():
    taxRate = 0.0
    shipping = 0.0

    taxRate = float(input("\nEnter tax rate (i.e. .075 for 7.5%): "))
    shipping = float(input("Enter shipping costs $ "))

    return taxRate, shipping  

# printReceipt() accepts total cost, tax rate, and 
# shipping costs and calculates and prints the tax 
# amount, and total cost
def printReceipt(totalCost, taxRate, shipping):
    tax = totalCost * taxRate
    print("\nSubtotal: $ ", format(totalCost, ".2f"))
    print("Tax: $", format((tax), ".2f"))
    print("Shipping: $", format(shipping,".2f"))
    print("------------------------")
    print("Please pay: $", format(totalCost + tax + shipping, ".2f"))

main()