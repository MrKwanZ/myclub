import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attendanceAlertMessage,
  attendancePercentage,
  passwordChangeFieldErrors,
  roleLabel,
  shouldWarnAttendance,
  userInitials,
} from "./index.ts";

describe("role label", () => {
  it("capitalizes the membership role shown on the account button", () => {
    assert.equal(roleLabel("manager"), "Manager");
    assert.equal(roleLabel("player"), "Player");
    assert.equal(roleLabel("  manager  "), "Manager");
    assert.equal(roleLabel(""), "");
  });
});

describe("user initials", () => {
  it("uses the first two letters of a single name", () => {
    assert.equal(userInitials("Neil"), "NE");
    assert.equal(userInitials("  neil  "), "NE");
    assert.equal(userInitials("A"), "A");
  });

  it("uses the first and last initials when the name has more than one word", () => {
    assert.equal(userInitials("Neil Cheng"), "NC");
    assert.equal(userInitials("Mary Ann Smith"), "MS");
  });

  it("returns nothing for a blank name", () => {
    assert.equal(userInitials("   "), "");
  });
});

describe("attendance alert", () => {
  it("matches the player profile rate", () => {
    assert.equal(attendancePercentage(1, 3), 33.3);
    assert.equal(attendancePercentage(0, 0), 0);
  });

  it("warns only when events exist and the rate is under the threshold", () => {
    assert.equal(shouldWarnAttendance(0, 80, 0), false);
    assert.equal(shouldWarnAttendance(80, 80, 4), false);
    assert.equal(shouldWarnAttendance(79.9, 80, 4), true);
  });

  it("describes the rate and the club threshold", () => {
    assert.equal(
      attendanceAlertMessage(0, 80),
      "Your attendance is 0%, which is below the 80% set by your club.",
    );
  });
});

describe("password change fields", () => {
  it("stays quiet until a field is filled", () => {
    assert.deepEqual(
      passwordChangeFieldErrors({ currentPassword: "", newPassword: "", confirmPassword: "" }),
      {},
    );
  });

  it("requires the other fields once one is filled", () => {
    assert.deepEqual(passwordChangeFieldErrors({ currentPassword: "", newPassword: "new", confirmPassword: "" }), {
      currentPassword: "Current password is required.",
      newPassword: "Password must be at least 8 characters.",
      confirmPassword: "Confirm password is required.",
    });
  });

  it("requires the new password and confirmation to match", () => {
    assert.deepEqual(
      passwordChangeFieldErrors({
        currentPassword: "Password123!",
        newPassword: "Password1234!",
        confirmPassword: "Password9999!",
      }),
      { confirmPassword: "New and confirm passwords must match." },
    );
  });

  it("accepts a complete matching change", () => {
    assert.deepEqual(
      passwordChangeFieldErrors({
        currentPassword: "Password123!",
        newPassword: "Password1234!",
        confirmPassword: "Password1234!",
      }),
      {},
    );
  });
});
