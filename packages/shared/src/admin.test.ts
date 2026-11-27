import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareClubName, formatDateTime } from "./dates.ts";
import { managesClub, pickClubId, roleForClub, roleLabel, type AuthUser } from "./index.ts";

function user(partial: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "admin@myclub.app",
    name: "Administrator",
    avatarUrl: "",
    contact: "",
    isAdmin: false,
    clubs: [],
    memberships: [],
    ...partial,
  };
}

describe("super admin role", () => {
  it("labels the admin role as Super Admin", () => {
    assert.equal(roleLabel("admin"), "Super Admin");
    assert.equal(roleLabel(" manager "), "Manager");
  });

  it("treats a super admin as someone who can manage a club", () => {
    assert.equal(managesClub("admin"), true);
    assert.equal(managesClub("manager"), true);
    assert.equal(managesClub("player"), false);
    assert.equal(managesClub(null), false);
  });

  it("lets a super admin open any club and keep the admin role", () => {
    const admin = user({
      isAdmin: true,
      clubs: [
        { id: "club-admin", name: "Administrator", logoUrl: "" },
        { id: "club-fc", name: "FC Baseline", logoUrl: "" },
      ],
      memberships: [
        {
          clubId: "club-admin",
          role: "admin",
          club: { id: "club-admin", name: "Administrator", logoUrl: "" },
        },
      ],
    });
    assert.equal(pickClubId(admin, "club-fc"), "club-fc");
    assert.equal(pickClubId(admin, "missing"), "club-admin");
    assert.equal(pickClubId(admin), "club-admin");
    assert.equal(roleForClub(admin, "club-fc"), "admin");
    assert.equal(roleForClub(admin, "club-admin"), "admin");
  });

  it("keeps a player inside their own memberships", () => {
    const player = user({
      memberships: [
        {
          clubId: "club-beta",
          role: "player",
          club: { id: "club-beta", name: "Beta", logoUrl: "" },
        },
      ],
    });
    assert.equal(pickClubId(player, "club-fc"), "club-beta");
    assert.equal(roleForClub(player, "club-beta"), "player");
    assert.equal(roleForClub(player, "club-fc"), null);
  });
});

describe("admin panel formatting", () => {
  it("formats a datetime as YYYY-MM-DD HH:mm AM/PM", () => {
    assert.equal(formatDateTime(new Date(2026, 10, 27, 17, 23)), "2026-11-27 05:23 PM");
    assert.equal(formatDateTime(new Date(2026, 0, 1, 0, 5)), "2026-01-01 12:05 AM");
    assert.equal(formatDateTime(new Date(2026, 0, 1, 12, 0)), "2026-01-01 12:00 PM");
    assert.equal(formatDateTime(null), "");
    assert.equal(formatDateTime("not-a-date"), "");
  });

  it("sorts named clubs ahead of a blank club name", () => {
    const names = ["FC Baseline", "", "Administrator", "alpha"];
    names.sort(compareClubName);
    assert.deepEqual(names, ["Administrator", "alpha", "FC Baseline", ""]);
  });
});
