import { expect } from "chai";
import { addToSqlCache, existsInSqlCache } from "../lib/cache";

describe("Cache", () => {
  it("cache", () => {
    const set = addToSqlCache("command", ["a", "b"]);
    expect(set.size).equal(1);

    const exists = existsInSqlCache("command", ["a", "b"])
    expect(exists).equal(true);

    const exists2 = existsInSqlCache("command", ["a", "b", "c"])
    expect(exists2).equal(false);
  });
});
