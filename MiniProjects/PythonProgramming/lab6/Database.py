# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 6
# Date:          10/31/2026
# Description:   Data Access Layer (DAL) stub for US Census baby name records.
# Inputs:        None
# Output:        List of dictionary records
# Sources:       Lab 6 Assignment Instructions & Professor Clarification Post.
# *****************************************************************************


class Database:
    """
    Data tier stub simulating a database connection and query response.
    In Lab 7, this stub will be replaced with live SQL database connectivity.
    """

    def readNames(self=None):
        """
        Return hard-coded list of dictionary objects for name data.
        """
        lstReturn = [
            {"name": "bob", "gender": "M", "year": 1907, "count": 38737},
            {"name": "Jill", "gender": "F", "year": 1907, "count": 21000},
            {"name": "Sue", "gender": "F", "year": 1907, "count": 97033},
            {"name": "Tom", "gender": "M", "year": 1907, "count": 14885},
        ]
        return lstReturn
