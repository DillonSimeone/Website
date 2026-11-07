Lab 6 - Classes and Objects

Lab 6 is an individual programming assignment - you must complete it on your own.
Purpose

For Lab 6, you will write a simple Object Oriented program that includes a class for fetching a list of objects and a class to hold the data fetched. Then, write a simple main function that fetches the data, loops through the objects, and displays the data to the console. In Lab 7, you will add a connection to a database to retrieve the data.

After completing this assignment, you will be able to:

    Write simple programs that use N-tier Architecture with separate modules for a data layer, a business logic layer, and a presentation or UI layer
    Create a data class to hold records of information
    Use name mangling to implement data hiding encapsulation
    Provide setters and getters for private properties
    Implement static methods and class methods

Task

The below instructions cover creating a program that uses Name data from the US Census Bureau. Next week, we'll be reading this data out of a live database for Lab 7. You are free to use a different type of data if you wish, as long as there are at least four properties for each object, and at least five objects. However, be aware that this might cause difficulties next week unless the data is available in a database that I can access to test your program.

Your program must include the following requirements:

    Your program should consist of three files: main.py, Name.py (or whatever is appropriate to hold the data you're using if you decide not to use Name data), and Database.py.
    Name.py should include a class definition for a Name class. Each Name object should include properties for the name (a piece of text such as "John"), the year (a number such as 1915), a gender (the text "M" or "F"), and the count (a number such as 47577 which represents the number of babies that were born in 1915 who were given the name John and registered with the Census Bureau as Male). Disclaimer: I do not endorse the Census Bureau's decision to restrict the values in the gender column to "M" or "F", but that's all the data they have released to the public.
    The Name class should use name mangling (see Module 6 Lesson 3) to protect the values of the properties. Include a constructor that takes values for name, year, gender, and count and setters and getters for each property.
    The Database.py file should just be "stubbed" in this lab since you will learn how to fetch data from a database next week. For this lab, you only need to define a class named Database with a single class method (see Module 6 Lesson 6) named readNames(). When readNames() is called, it should return a list containing at least 4 dictionary objects with name data. Any values are fine at this point.

    Example Dictionary Object:
    {“name”: ”bob”, ”gender”: ”M”, ”year”: 1907, ”count”: 38737}

    If you're not sure what values to return, you can use this data:

    	

    Name
    	

    Year
    	

    Gender
    	

    Count

    1
    	

    John
    	

    1915
    	

    M
    	

    47577

    2
    	

    John
    	

    1916
    	

    M
    	

    50046

    3
    	

    John
    	

    1917
    	

    M
    	

    51851

    4
    	

    John
    	

    1918
    	

    M
    	

    56559

    5
    	

    John
    	

    1919
    	

    M
    	

    53532
    The Name class should have a static method (see Module 6 Lesson 6) called readNames() which calls Database.readNames() and returns its results.
    main.py should include a main function which calls Name.readNames(). The readNames() method should return a list of Name objects. Your main function should loop through each Name object in the list of Name objects and write a line to the console that includes all of the data for that Name object. Your output should look something like this (fancier is fine, but not required, and you are free to use different data):

    1915 John M 47577
    1916 John M 50046
    1917 John M 51851
    1918 John M 56559
    1919 John M 53532

    In the comments box of your submission, answer the following question: How would you explain Object-Oriented Programming to someone with no programming experience?

Criteria for Success

    Run your program and test with different user input. Do your prompts explain what the user should enter?
    Take a look at your user interface (UI) and user experience (UX). Did you provide a welcome message letting the user know what to expect? Is the UI nicely spaced with no typos? 
    Please open and compare your work with the Lab 6 Rubric before submitting.
    Remember to follow all Python Style Guide rules for CIS 133Y.
    Include the required comment header with both student names and add comments throughout the code identifying which parts of the program each partner worked on.
    Programs without comments will not be graded - you will be asked to resubmit them with comments before being graded.
    When you have completed the project and verified that it works correctly, zip up your project folder, including main.py, Name.py, and Database.py, upload it to the Lab 6 assignment folder, and answer the submission question posted on the assignment in D2L.
