import sql from './lib/sql'

export const ms_sql = ((...args: any[]) => {
  const query = (sql as any)(...args);
  return {
    sql: query.text.replace(/\?\?/g, "?"),
    values: query.values,
  };
}) as any as typeof sql;
Object.assign(ms_sql, sql);

export default ms_sql;
