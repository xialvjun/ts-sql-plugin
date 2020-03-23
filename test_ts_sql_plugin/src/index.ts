import sql from 'ts-sql-plugin/lib/sql';

const either = () => Math.random() < 0.5;

sql`select * from persoiins where id=${1234}`;

sql`select * from books where ${sql.and({
  author_id: 1234,
  publisher: 'abcd',
  'title like': either() ? `%${'abc'}%` : undefined,
})}`;

(() => {
  const conditions = {
    author_id: 1234,
    publisher: 'abcd',
    'title like': undefined,
  };
  sql`select * from books${sql.cond(
    Object.entries(conditions).filter(([k, v]) => v).length > 0,
  )` where ${sql.and(conditions)}`} order by published_at ${
    either() ? sql.raw`desc` : sql.raw`asc`
  }`;
})();

(() => {
  const name_like = 'xial';
  sql`select * from persons${sql.cond(
    !!name_like,
  )` where name like ${`%${name_like}%`}`}`;
})();

sql`insert into personns ${sql.ins({ first_name: 'xialvjun' })} returning *`;

sql`insert into books ${sql.ins({ book_name: 'harry potter' })} returning *`;

sql`insert into books ${sql.ins([
  { title: 'xia', publisher: 28 },
  { title: 'lv', meta: 90 },
])}`;

sql`select * from books where ${sql.or([
  { title: 'xia' },
  { publisher: 28 },
  { 'title like': 'xialvjun%', meta: 30 },
])}`;

sql`select * from books where ${sql.or([
  { 'title like': 'xxx%' },
  { title: 'yyy' },
])}`;

sql`select * from books where title like 'xxx%'`;

sql`select * from books where title = any(${['a', 'b', 'c']})`;

(() => {
  const a = sql`select * from books where id=${123}`;
  sql`select * from (${a}) a where a.id=${123}`;
})();
