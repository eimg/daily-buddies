-- CreateTable
CREATE TABLE "NudgeSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NudgeSetting_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NudgeSetting_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NudgeSetting_childId_type_key" ON "NudgeSetting"("childId", "type");
