import { describe, expect, test } from "vitest";

import { parseCsv } from "./csv.ts";

describe("parseCsv", () => {
  test("reads records keyed by the header", () => {
    expect(parseCsv("id,name\n1,bulbasaur\n2,ivysaur\n")).toEqual([
      { id: "1", name: "bulbasaur" },
      { id: "2", name: "ivysaur" },
    ]);
  });

  test("handles quotes, embedded commas and newlines, and CRLF", () => {
    expect(parseCsv('id,text\r\n1,"a, ""b""\nc"\r\n2,\r\n')).toEqual([
      { id: "1", text: 'a, "b"\nc' },
      { id: "2", text: "" },
    ]);
  });

  test("rejects a record with the wrong number of fields", () => {
    expect(() => parseCsv("a,b\n1\n")).toThrow(
      "record 1 has 1 fields, expected 2",
    );
  });

  test("rejects an unterminated quote", () => {
    expect(() => parseCsv('a\n"open\n')).toThrow("quoted field");
  });
});
