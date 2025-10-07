#!/bin/bash

# Update enum imports from @prisma/client to ../types/enums
# This script updates all TypeScript files to use our custom enum types
# instead of the old Prisma-generated enum types

set -e

echo "Updating enum imports throughout the codebase..."

# Find all TypeScript files that import from @prisma/client
find src -name "*.ts" -type f | while read file; do
    # Check if file imports any enums from @prisma/client
    if grep -q "UserRole\|ProjectRole\|FixtureType\|ChannelType\|EasingType" "$file" && grep -q "@prisma/client" "$file"; then
        echo "Processing: $file"

        # Create a backup
        cp "$file" "$file.bak"

        # Check which enums are used in this file
        USES_USER_ROLE=$(grep -c "UserRole" "$file" || echo "0")
        USES_PROJECT_ROLE=$(grep -c "ProjectRole" "$file" || echo "0")
        USES_FIXTURE_TYPE=$(grep -c "FixtureType" "$file" || echo "0")
        USES_CHANNEL_TYPE=$(grep -c "ChannelType" "$file" || echo "0")
        USES_EASING_TYPE=$(grep -c "EasingType" "$file" || echo "0")

        # Build the import list
        ENUM_IMPORTS=""
        [ "$USES_USER_ROLE" != "0" ] && ENUM_IMPORTS="$ENUM_IMPORTS UserRole,"
        [ "$USES_PROJECT_ROLE" != "0" ] && ENUM_IMPORTS="$ENUM_IMPORTS ProjectRole,"
        [ "$USES_FIXTURE_TYPE" != "0" ] && ENUM_IMPORTS="$ENUM_IMPORTS FixtureType,"
        [ "$USES_CHANNEL_TYPE" != "0" ] && ENUM_IMPORTS="$ENUM_IMPORTS ChannelType,"
        [ "$USES_EASING_TYPE" != "0" ] && ENUM_IMPORTS="$ENUM_IMPORTS EasingType,"

        # Remove trailing comma
        ENUM_IMPORTS=${ENUM_IMPORTS%,}

        if [ -n "$ENUM_IMPORTS" ]; then
            # Calculate relative path to types/enums
            DIR_DEPTH=$(echo "$file" | tr -cd '/' | wc -c)
            RELATIVE_PATH=""
            for i in $(seq 1 $((DIR_DEPTH - 1))); do
                RELATIVE_PATH="../$RELATIVE_PATH"
            done
            RELATIVE_PATH="${RELATIVE_PATH}types/enums"

            # Add new import at the top (after existing imports)
            # First, check if the enum import already exists
            if ! grep -q "from.*types/enums" "$file"; then
                # Find the last import statement
                LAST_IMPORT_LINE=$(grep -n "^import " "$file" | tail -1 | cut -d: -f1)

                if [ -n "$LAST_IMPORT_LINE" ]; then
                    # Insert after last import
                    sed -i.tmp "${LAST_IMPORT_LINE}a\\
import { $ENUM_IMPORTS } from '$RELATIVE_PATH';
" "$file"
                else
                    # No imports found, add at top
                    sed -i.tmp "1i\\
import { $ENUM_IMPORTS } from '$RELATIVE_PATH';
" "$file"
                fi

                rm "$file.tmp"
            fi
        fi

        # Remove enum imports from @prisma/client import statement
        # This is complex, so let's use a simpler approach: just document what needs to be done
        echo "  Please manually remove enum imports from @prisma/client in: $file"
    fi
done

echo ""
echo "Done! Please review the changes and manually clean up @prisma/client imports."
echo "Backups created with .bak extension"
