# *****************************************************************************
# Author:        Dillon Simeone
# Assignment:    Lab 9
# Date:          11/20/2026
# Description:   Data layer for querying the NAMES database.
# Inputs:        name, gender
# Output:        List of NamePopularity objects
# Sources:       Lab 9 instructions, imdb_browser
# *****************************************************************************
import pymssql


class Database:
    """Data layer for connecting to and querying the NAMES database."""

    __connection = None

    @classmethod
    def connect(cls):
        """Open a reusable connection to the NAMES database."""
        if cls.__connection is None:
            cls.__connection = pymssql.connect(
                server="cisdbss.pcc.edu",
                database="NAMES",
                user="275student",
                password="275student",
            )

    @classmethod
    def fetch_name_popularity(cls, name, gender):
        """Fetch yearly popularity records for a given name and gender."""
        from NamePopularity import NamePopularity

        sql = """
        SELECT Name, Year, Gender, NameCount, Total
        FROM all_data
        WHERE Name = %s
        AND Gender = %s
        ORDER BY Year;
        """
        cls.connect()
        cursor = cls.__connection.cursor()
        cursor.execute(sql, (name, gender))

        records = []
        row = cursor.fetchone()
        while row:
            records.append(
                NamePopularity(
                    row[0],
                    int(row[1]),
                    row[2],
                    int(row[3]),
                    int(row[4]),
                )
            )
            row = cursor.fetchone()
        return records
