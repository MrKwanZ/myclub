ALTER TABLE "Player" ADD COLUMN "injuryArea" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Player" ADD COLUMN "expectedReturnDate" DATE;

UPDATE "Player"
SET "position" = 'Midfielder'
WHERE lower(btrim("position")) IN ('mid', 'midfield', 'midfielder');

UPDATE "Player"
SET "position" = 'Defender'
WHERE lower(btrim("position")) IN ('def', 'defender', 'defence', 'defense');

UPDATE "Player"
SET "position" = 'Forward'
WHERE lower(btrim("position")) IN ('fwd', 'forward', 'striker');

UPDATE "Player"
SET "position" = 'Goalkeeper'
WHERE lower(btrim("position")) IN ('gk', 'goalkeeper', 'goalie', 'keeper');
