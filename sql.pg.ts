import sql from "./lib/sql";

export const pg_sql = (((...args: any[]) => {
  const query = (sql as any)(...args);
  delete query[sql.symbol];
  query.text = query.text.split("??").reduce((acc: string, cv: string, ci: number) => acc + "$" + ci + cv);
  return query;
}) as any) as typeof sql;
Object.assign(pg_sql, sql);

export default pg_sql;
