-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PrivilegeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "privilegeId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cost" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "PrivilegeRequest_privilegeId_fkey" FOREIGN KEY ("privilegeId") REFERENCES "PrivilegeDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivilegeRequest_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivilegeRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PrivilegeRequest" ("childId", "createdAt", "familyId", "id", "note", "privilegeId", "resolvedAt", "status") SELECT "childId", "createdAt", "familyId", "id", "note", "privilegeId", "resolvedAt", "status" FROM "PrivilegeRequest";
DROP TABLE "PrivilegeRequest";
ALTER TABLE "new_PrivilegeRequest" RENAME TO "PrivilegeRequest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
