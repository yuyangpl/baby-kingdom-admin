#!/bin/bash
# Baby Kingdom Admin - Clean operational data
# Clears feeds, trends, google-trends, and queue jobs from MongoDB

DB="baby-kingdom-dev"

echo "Will drop the following collections from '$DB':"
echo "  - feeds"
echo "  - trends"
echo "  - googletrends"
echo "  - queuejobs"
echo ""
read -p "Confirm? (y/N) " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Cancelled."
  exit 0
fi

mongosh --quiet "$DB" --eval '
  const collections = ["feeds", "trends", "googletrends", "queuejobs"];
  for (const name of collections) {
    const result = db.getCollection(name).deleteMany({});
    print(`  ${name}: deleted ${result.deletedCount} documents`);
  }
  print("\nDone.");
'
