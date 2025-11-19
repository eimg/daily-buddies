-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dailyStreakReward" INTEGER NOT NULL DEFAULT 3,
    "weeklyStreakReward" INTEGER NOT NULL DEFAULT 5,
    "monthlyStreakReward" INTEGER NOT NULL DEFAULT 15,
    "yearlyStreakReward" INTEGER NOT NULL DEFAULT 100
);
INSERT INTO "new_Family" ("createdAt", "id", "monthlyStreakReward", "name", "updatedAt", "weeklyStreakReward", "yearlyStreakReward") SELECT "createdAt", "id", "monthlyStreakReward", "name", "updatedAt", "weeklyStreakReward", "yearlyStreakReward" FROM "Family";
DROP TABLE "Family";
ALTER TABLE "new_Family" RENAME TO "Family";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
