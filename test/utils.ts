import { expect } from "chai";
import { trim_middle_comments } from "../lib/utils";

describe("Utils", () => {
  describe("trim_middle_comments", () => {
    it("SQL without comments as is", () => {
      const sql = `
select * from users
where id = 1`;
      expect(trim_middle_comments(sql)).equal(sql.trim());
    });

    it("comments on head should be preserved", () => {
      const sql = `

-- stay here
/* ts-sql-plugin:ignore-cost */
select * from users
where id = 1`;
      expect(trim_middle_comments(sql)).equal(sql.trim());
    });

    it("drop comments from middle side", () => {
      const sql = `
-- stay here
/* ts-sql-plugin:ignore-cost */
select * from (
  -- remove from here
  /* @name Users */
  /* ts-sql-plugin:ignore-cost */
  select * from users
) x
where id = 1`;
      expect(trim_middle_comments(sql)).equal(
        `
-- stay here
/* ts-sql-plugin:ignore-cost */
select * from (
  select * from users
) x
where id = 1`.trim(),
      );
    });
  });
});
