export const playerStatuses = ["active", "injured", "left"] as const;
export const playerPositions = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;
export const eventTypes = ["training", "match", "leisure", "friendly"] as const;

const positionAliases: Record<string, (typeof playerPositions)[number]> = {
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
  striker: "Forward",
};

/** Map a stored position onto the roster dropdown. Unknown text is left unchanged. */
export function canonicalPosition(value: string) {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  return positionAliases[key] ?? value.trim();
}

export function eventTypeLabel(type: string) {
  switch (type) {
    case "match":
      return "Match";
    case "friendly":
      return "Friendly";
    case "leisure":
      return "Leisure";
    case "training":
      return "Training";
    default:
      return type;
  }
}
