"use client";

import type { LineupPlayer, MatchLineup } from "@myclub/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Draggable from "react-draggable";

const PITCH_SRC = "/soccer-field.jpg";
const PITCH_NATURAL_WIDTH = 689;
const PITCH_NATURAL_HEIGHT = 1024;
const TOKEN_SIZE = 60;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

export function LineupPitch({
  players,
  jerseyUrl,
  interactive = false,
  onPlayerMove,
}: {
  players: LineupPlayer[];
  jerseyUrl: string | null;
  interactive?: boolean;
  onPlayerMove?: (playerId: string, x: number, y: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBoardSize((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boardRef}
      className={`lineup-pitch${interactive ? " lineup-pitch-interactive" : ""}`}
      data-testid="lineup-pitch"
    >
      <img alt="Soccer pitch" className="lineup-pitch-img" draggable={false} src={PITCH_SRC} />
      {interactive && boardSize.width > 0 && boardSize.height > 0
        ? players.map((player) => (
            <DraggablePlayerToken
              key={player.playerId}
              boardHeight={boardSize.height}
              boardWidth={boardSize.width}
              jerseyUrl={jerseyUrl}
              player={player}
              onMove={onPlayerMove}
            />
          ))
        : players.map((player) => (
            <div
              key={player.playerId}
              className="lineup-player-token lineup-player-static"
              data-player-id={player.playerId}
              data-position={player.position}
              data-testid={`pitch-player-${player.playerId}`}
              style={{
                left: `${clamp(player.x, 5, 95)}%`,
                top: `${clamp(player.y, 5, 95)}%`,
              }}
            >
              <PlayerTokenContent jerseyUrl={jerseyUrl} player={player} />
            </div>
          ))}
    </div>
  );
}

function DraggablePlayerToken({
  player,
  jerseyUrl,
  boardWidth,
  boardHeight,
  onMove,
}: {
  player: LineupPlayer;
  jerseyUrl: string | null;
  boardWidth: number;
  boardHeight: number;
  onMove?: (playerId: string, x: number, y: number) => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const maxX = Math.max(0, boardWidth - TOKEN_SIZE);
  const maxY = Math.max(0, boardHeight - TOKEN_SIZE);
  const targetX = clamp((player.x / 100) * boardWidth - TOKEN_SIZE / 2, 0, maxX);
  const targetY = clamp((player.y / 100) * boardHeight - TOKEN_SIZE / 2, 0, maxY);

  useEffect(() => {
    setDragOffset(null);
  }, [player.x, player.y, boardWidth, boardHeight]);

  const position = dragOffset ?? { x: targetX, y: targetY };

  return (
    <Draggable
      bounds="parent"
      nodeRef={nodeRef}
      position={position}
      onDrag={(_, data) => {
        setDragOffset({ x: data.x, y: data.y });
      }}
      onStop={(_, data) => {
        setDragOffset(null);
        if (!onMove || boardWidth <= 0 || boardHeight <= 0) return;
        const nextX = clamp(((data.x + TOKEN_SIZE / 2) / boardWidth) * 100, 0, 100);
        const nextY = clamp(((data.y + TOKEN_SIZE / 2) / boardHeight) * 100, 0, 100);
        onMove(player.playerId, Math.round(nextX * 100) / 100, Math.round(nextY * 100) / 100);
      }}
    >
      <div
        ref={nodeRef}
        aria-label={`${player.name} (${player.position})`}
        className="lineup-player-token lineup-player-draggable"
        data-player-id={player.playerId}
        data-position={player.position}
        data-testid={`pitch-player-${player.playerId}`}
      >
        <PlayerTokenContent jerseyUrl={jerseyUrl} player={player} />
      </div>
    </Draggable>
  );
}

function PlayerTokenContent({
  player,
  jerseyUrl,
}: {
  player: LineupPlayer;
  jerseyUrl: string | null;
}) {
  return (
    <>
      <div className="lineup-player-visual">
        {jerseyUrl ? (
          <>
            <img
              alt={`${player.name} jersey`}
              className="lineup-player-jersey"
              draggable={false}
              src={jerseyUrl}
            />
            {player.shirtNumber != null ? (
              <span className="lineup-player-number-chip">{player.shirtNumber}</span>
            ) : null}
          </>
        ) : (
          <span className="lineup-player-badge">{player.shirtNumber ?? initials(player.name)}</span>
        )}
      </div>
      <span className="lineup-player-name">{player.name}</span>
    </>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load lineup image."));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function downloadLineupAsImage(lineup: MatchLineup, filename = "squad-lineup.png") {
  const pitchImg = await loadImage(PITCH_SRC);
  const jerseyImg = lineup.jerseyUrl ? await loadImage(lineup.jerseyUrl).catch(() => null) : null;

  const width = pitchImg.naturalWidth || PITCH_NATURAL_WIDTH;
  const height = pitchImg.naturalHeight || PITCH_NATURAL_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  ctx.drawImage(pitchImg, 0, 0, width, height);

  for (const player of lineup.players) {
    const cx = clamp((player.x / 100) * width, 40, width - 40);
    const cy = clamp((player.y / 100) * height, 40, height - 40);

    if (jerseyImg) {
      const size = 56;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 8;
      ctx.drawImage(jerseyImg, cx - size / 2, cy - size / 2 - 8, size, size);
      ctx.restore();

      if (player.shirtNumber != null) {
        ctx.save();
        ctx.fillStyle = "#0075de";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + 20, cy - 26, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(player.shirtNumber), cx + 20, cy - 25);
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#0075de";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "600 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const badgeLabel = player.shirtNumber != null ? String(player.shirtNumber) : initials(player.name);
      ctx.fillText(badgeLabel, cx, cy - 7);
      ctx.restore();
    }

    ctx.save();
    ctx.font = "600 14px sans-serif";
    const label = player.name;
    const textWidth = Math.min(136, ctx.measureText(label).width);
    const pillW = textWidth + 16;
    const pillH = 22;
    const pillX = clamp(cx - pillW / 2, 6, width - pillW - 6);
    const pillY = cy + 20;

    ctx.fillStyle = "rgba(24, 24, 24, 0.85)";
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5, 136);
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  const href = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");

  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (blob) {
    setTimeout(() => URL.revokeObjectURL(href), 5_000);
  }
}
