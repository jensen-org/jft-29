import { describe, expect, it } from "vitest";
import { coalesce } from "../../src/core/coalesce";

describe("coalesce", () => {
  it("cancels a create followed by a delete", () => {
    expect(
      coalesce([
        { type: "add", path: "/a", kind: "file" },
        { type: "delete", path: "/a" },
      ]),
    ).toEqual([]);
  });

  it("turns a delete followed by a create into a change", () => {
    expect(
      coalesce([
        { type: "delete", path: "/a" },
        { type: "add", path: "/a", kind: "file" },
      ]),
    ).toEqual([{ type: "change", path: "/a" }]);
  });

  it("keeps a create followed by a change as the create", () => {
    expect(
      coalesce([
        { type: "add", path: "/a", kind: "file" },
        { type: "change", path: "/a" },
      ]),
    ).toEqual([{ type: "add", path: "/a", kind: "file" }]);
  });

  it("drops deletes under a deleted parent", () => {
    expect(
      coalesce([
        { type: "delete", path: "/d/x" },
        { type: "delete", path: "/d" },
        { type: "delete", path: "/d/y" },
      ]),
    ).toEqual([{ type: "delete", path: "/d" }]);
  });

  it("lets a rescan supersede earlier events under it", () => {
    expect(
      coalesce([
        { type: "add", path: "/d/x", kind: "file" },
        { type: "rescan", path: "/d" },
      ]),
    ).toEqual([{ type: "rescan", path: "/d" }]);
  });
});
