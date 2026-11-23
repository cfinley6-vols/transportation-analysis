#!/bin/bash

# Database filename matching the transit project
DB="transit.db"

echo "Recreating database..."
# Remove the old database file, if it exists.
rm -f "$DB"

# Create a fresh database using schema.sql and load the sample data
sqlite3 "$DB" < schema.sql
sqlite3 "$DB" < insert_data.sql

echo
echo "Running queries..."
# Run queries.sql and display the query results with headers and columns formatted
sqlite3 -header -column "$DB" < queries.sql

echo
echo "Running transaction..."
# Run transaction.sql
sqlite3 -bail -header -column "$DB" < transaction.sql
status=$?

if [ "$status" -eq 0 ]; then
    echo "Transaction completed successfully (Note: Changes were rolled back intentionally as per script)."
else
    echo "Transaction failed."
    echo "Uncommitted changes were rolled back."
fi

echo
echo "Done."
