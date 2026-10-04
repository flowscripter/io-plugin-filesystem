import { describe, expect, test } from "bun:test";
import { parseFileLocationString } from "../../src/location/parseFileLocationString.ts";

describe("parseFileLocationString", () => {
  test("file:///foo and file:/foo both give /foo", () => {
    if (process.platform === "win32") {
      return;
    }
    expect(parseFileLocationString("file:///foo")).toEqual({ path: "/foo" });
    expect(parseFileLocationString("file:/foo")).toEqual({ path: "/foo" });
  });

  test("bare paths pass through unchanged", () => {
    expect(parseFileLocationString("relative/dir")).toEqual({ path: "relative/dir" });
    expect(parseFileLocationString("/abs/dir")).toEqual({ path: "/abs/dir" });
  });

  test("a file URL with a host is rejected", () => {
    if (process.platform === "win32") {
      return;
    }
    expect(() => parseFileLocationString("file://host/foo")).toThrow();
  });
});
