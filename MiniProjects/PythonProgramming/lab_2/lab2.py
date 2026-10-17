#*****************************************************************************
# Authors:        Bill Jennings (Diver/Navigator),
#                 Dillon Simeone (Diver/Navigator)
# Assignment:    Lab 2    
# Date:          10/1/2026
# Description:   A program that calculates estimated fuel needs and total
#                travel costs for a road trip based on inputs.
# Inputs:        Integar/floats for prices, strings for names  
# Output:        string summary of total costs estimated
# Sources:       Lab2 Assignment Instructions, Module 2 Lessons 1-8, Python
#                programming textbook chapters 2, 9, 10, and 11
#*****************************************************************************

#Dillon Wriggling

#Sanity test - Seems that pyTogether can't import libraries. Vanilla only.
# CORRECTION: SEE BILL WORK BELOW!
try:
    from datetime import date
    DillonToday = date.today() 
    # (Post session note)
    # Thinking on this... Type error? I've programmed in javascript for far 
    # too long! DillonToday IS saving something, but it's an object, not a 
    # string, and print can't print an object that doesn't have a print function!
    print("The date is... " + DillonToday)
except:
    #print("No imports allowed for you online! Date manually set to 10/1/2026!")
    DillonToday = "10/1/2026"

#Bill Wriggling
# when I run this code it works for me
# Dillon: Huh. This works! Witchery! We can cook with this.
from datetime import date 
todaysDate = date.today().strftime("%A, %B %-d, %Y")
print(f"Date: {todaysDate}")

#Dillon wriggling
# Requirement: Accept string and numeric values using input()
# Requirement: Function chaining: float(input(...))
# chains input() into float()
print("Welcome to road trip Calculator!")
print(
    "Plan your grand journey! \n"
    "We will calculate the estimated fuel volume and cost based on your "
    "trip details.\n"
)
destination = input("Enter the name of your destination: ").strip()
distanceMiles = float(
    input("Enter the distance in miles to your destination: ")
)
mpg = float(input("Enter your vehicle's mpg: "))
gasPrice = float(input("Enter the current price of a gallon of gas: "))

#Bill wriggling - Calculations
# Requirement: Use at least one compound operator (*=)
gallonsNeeded = round(distanceMiles / mpg, 2)
totalCost = round(gallonsNeeded * gasPrice, 2)

# Add a 10% fuel allowance.
gallonsNeededAdjusted = gallonsNeeded
gallonsNeededAdjusted *= 1.10
gallonsNeededAdjusted = round(gallonsNeededAdjusted, 2)
totalCostAdjusted = round(gallonsNeededAdjusted * gasPrice, 2)

#Dillon wriggling
print("\n" + "-" * 50)
print ("Trip summary generated on: " + todaysDate)
print("Destination: " + destination)
print("Distance to destination: " + str(round(distanceMiles, 1)) + " miles")
print("Vehicle MPG: " + str(round(mpg, 1)) + " mpg")
print("\n" + "-" * 50)

SummaryUnAdjusted = (
    "Base Fuel estimate:\n"
    " - Gallons needed: {:0.2f} gallons Needed\n"
    " - Estimated fuel cost: ${:0.2f}".format(gallonsNeeded, totalCost)
)

SummaryAdjusted = (
    "Adjusted Fuel estimate:\n"
    " - Gallons needed: {:0.2f} gallons deeded\n"
    " - Estimated fuel cost: ${:0.2f}".format(
        gallonsNeededAdjusted,
        totalCostAdjusted
    )
)

print("\n" + "-" * 50)
print("In real life, things often goes wrong! Always safe to add 10% on top.")
print(SummaryAdjusted) #var autofill got Dillon here

print("\nHowever, if you're not doing this in real life...")
print(SummaryUnAdjusted)
print("=" * 50)
print("Safeish trip to your final destination, " + destination + "!")
print("=" * 50)


# Test cases:
# 1. Entered postive numbers, outputs seemed correct. 
# 2. Entered negative numbers, output seemed to be postive numbers. 