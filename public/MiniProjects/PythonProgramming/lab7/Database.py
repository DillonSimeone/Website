# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 7
# Date:          11/08/2026
# Description:   Database layer for Onion records.
# Inputs:        species, min_age
# Output:        List of onion dictionaries
# Sources:       Lab 7 instructions
# *****************************************************************************
import os
import sqlite3


class Database:
    __connection = None

    @classmethod
    def connect(cls):
        if cls.__connection is None:
            db_path = os.path.join(os.path.dirname(__file__), "onions.db")
            cls.__connection = sqlite3.connect(db_path)

    @classmethod
    def readOnions(cls, species, min_age):
        cls.connect()
        cursor = cls.__connection.cursor()
        sql = "SELECT id, species, age, weight FROM onions WHERE LOWER(species) = LOWER(?) AND age >= ?"
        cursor.execute(sql, (species, min_age))
        rows = cursor.fetchall()

        results = []
        for row in rows:
            results.append({
                "id": row[0],
                "species": row[1],
                "age": row[2],
                "weight": row[3]
            })
        return results
