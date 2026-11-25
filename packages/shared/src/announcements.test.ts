import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { announcementWriteSchema } from "./index.ts";

describe("announcements", () => {
  it("requires a title and content", () => {
    assert.equal(announcementWriteSchema.safeParse({ title: "  ", content: "Training is off" }).success, false);
    assert.equal(announcementWriteSchema.safeParse({ title: "Pitch closed", content: "  " }).success, false);
    const parsed = announcementWriteSchema.safeParse({ title: " Pitch closed ", content: " Sunday instead " });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.title, "Pitch closed");
      assert.equal(parsed.data.content, "Sunday instead");
    }
  });

  it("rejects a title or content that is too long", () => {
    assert.equal(announcementWriteSchema.safeParse({ title: "a".repeat(121), content: "Ok" }).success, false);
    assert.equal(announcementWriteSchema.safeParse({ title: "Ok", content: "a".repeat(2001) }).success, false);
  });
});
