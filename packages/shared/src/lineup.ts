import { z } from "zod";

export const lineupPositions = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;
export type LineupPosition = (typeof lineupPositions)[number];

export const LINEUP_MAX_PLAYERS = 11;

export const LINEUP_POSITION_LIMITS: Record<LineupPosition, number> = {
  Goalkeeper: 1,
  Defender: 5,
  Midfielder: 5,
  Forward: 3,
};

/**
 * Vertical row percentages from the top of the pitch image:
 * - Forward: 1/4 upper of the image (25%)
 * - Midfielder: middle of the image (50%)
 * - Defender: 1/4 lower of the image (75%)
 * - Goalkeeper: lower middle of the image (88%)
 */
export const LINEUP_POSITION_Y: Record<LineupPosition, number> = {
  Forward: 25,
  Midfielder: 50,
  Defender: 75,
  Goalkeeper: 88,
};

const PITCH_HORIZONTAL_MARGIN = 6;
const PITCH_HORIZONTAL_SPAN = 100 - PITCH_HORIZONTAL_MARGIN * 2;

const lineupPositionAliases: Record<string, LineupPosition> = {
  gk: "Goalkeeper",
  goalkeeper: "Goalkeeper",
  goalie: "Goalkeeper",
  keeper: "Goalkeeper",
  def: "Defender",
  defender: "Defender",
  defence: "Defender",
  defense: "Defender",
  mid: "Midfielder",
  midfield: "Midfielder",
  midfielder: "Midfielder",
  fwd: "Forward",
  forward: "Forward",
  forwarder: "Forward",
  striker: "Forward",
};

/** Maps a player's stored position onto one of the four pitch rows, defaulting blank positions to Midfielder. */
export function normalizeLineupPosition(position: string): LineupPosition {
  const key = position.trim().toLowerCase();
  return lineupPositionAliases[key] ?? "Midfielder";
}

export interface LineupPlayer {
  playerId: string;
  name: string;
  shirtNumber: number | null;
  position: LineupPosition;
  /** Horizontal center percentage (0..100) from the left edge of the pitch image. */
  x: number;
  /** Vertical center percentage (0..100) from the top edge of the pitch image. */
  y: number;
}

export interface PositionedLineupPlayer extends LineupPlayer {
  /** Preserves custom coordinates once dragged by the manager. */
  dragged?: boolean;
}

export interface MatchLineup {
  jerseyUrl: string | null;
  players: LineupPlayer[];
}

export function maxLineupMessage() {
  return `Only ${LINEUP_MAX_PLAYERS} players allowed in the lineup`;
}

export function maxPositionMessage(position: LineupPosition) {
  const limit = LINEUP_POSITION_LIMITS[position];
  return `Only ${limit} player(s) allowed in ${position} position`;
}

/**
 * Checks whether another player can be added to the active lineup.
 * Returns null if valid, or the exact error message required for the ListBox ErrorMessage.
 */
export function validateLineupAddition(
  current: Pick<LineupPlayer, "playerId" | "position">[],
  candidate: { id: string; position: string },
): string | null {
  if (current.some((item) => item.playerId === candidate.id)) return null;
  if (current.length >= LINEUP_MAX_PLAYERS) {
    return maxLineupMessage();
  }
  const pos = normalizeLineupPosition(candidate.position);
  const countInPos = current.filter((item) => item.position === pos).length;
  if (countInPos >= LINEUP_POSITION_LIMITS[pos]) {
    return maxPositionMessage(pos);
  }
  return null;
}

/**
 * Evenly distributes non-dragged players in each position row from left to right across the pitch.
 * Goalkeeper sits at the lower middle (50%, 88%); multi-player rows divide the width into N equal slots
 * starting from the left side of the pitch.
 */
export function layoutLineupPlayers(items: PositionedLineupPlayer[]): PositionedLineupPlayer[] {
  const byPosition = new Map<LineupPosition, PositionedLineupPlayer[]>();
  for (const pos of lineupPositions) byPosition.set(pos, []);
  for (const item of items) {
    const list = byPosition.get(item.position) ?? [];
    list.push(item);
    byPosition.set(item.position, list);
  }

  const coordinates = new Map<string, { x: number; y: number }>();
  for (const pos of lineupPositions) {
    const group = byPosition.get(pos) ?? [];
    const count = group.length;
    if (count === 0) continue;
    const defaultY = LINEUP_POSITION_Y[pos];
    group.forEach((item, index) => {
      if (item.dragged) {
        coordinates.set(item.playerId, { x: clampPct(item.x), y: clampPct(item.y) });
        return;
      }
      const x =
        pos === "Goalkeeper"
          ? 50
          : roundCoord(PITCH_HORIZONTAL_MARGIN + ((index + 0.5) / count) * PITCH_HORIZONTAL_SPAN);
      coordinates.set(item.playerId, { x, y: defaultY });
    });
  }

  return items.map((item) => {
    const next = coordinates.get(item.playerId);
    return next ? { ...item, x: next.x, y: next.y } : item;
  });
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, roundCoord(value)));
}

function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

export const jerseyDataUrlSchema = z
  .string()
  .max(2_100_000, "Image is too large.")
  .refine(
    (value) => value.startsWith("data:image/jpeg;base64,") || value.startsWith("data:image/png;base64,"),
    "Unsupported format, please upload a valid image",
  );

export const lineupPlayerSchema = z.object({
  playerId: z.string().min(1, "Player is required."),
  name: z.string().trim().min(1, "Player name is required.").max(80),
  shirtNumber: z.number().int().min(0).max(99).nullable(),
  position: z.enum(lineupPositions),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const lineupWriteSchema = z
  .object({
    jerseyUrl: jerseyDataUrlSchema.nullable().optional().default(null),
    players: z
      .array(lineupPlayerSchema)
      .min(1, "Select at least one player for the lineup.")
      .max(LINEUP_MAX_PLAYERS, maxLineupMessage()),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    const counts: Record<LineupPosition, number> = {
      Goalkeeper: 0,
      Defender: 0,
      Midfielder: 0,
      Forward: 0,
    };
    for (const player of value.players) {
      if (seen.has(player.playerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate players are not allowed in the lineup.",
          path: ["players"],
        });
        return;
      }
      seen.add(player.playerId);
      counts[player.position] += 1;
      if (counts[player.position] > LINEUP_POSITION_LIMITS[player.position]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: maxPositionMessage(player.position),
          path: ["players"],
        });
        return;
      }
    }
  });

export type LineupWrite = z.infer<typeof lineupWriteSchema>;
