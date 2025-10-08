-- RedefineTables
BEGIN TRANSACTION;
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cue_lists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "loop" BOOLEAN NOT NULL DEFAULT false,
    "project_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "cue_lists_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cue_lists" ("created_at", "description", "id", "name", "project_id", "updated_at") SELECT "created_at", "description", "id", "name", "project_id", "updated_at" FROM "cue_lists";
DROP TABLE "cue_lists";
ALTER TABLE "new_cue_lists" RENAME TO "cue_lists";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
COMMIT;
