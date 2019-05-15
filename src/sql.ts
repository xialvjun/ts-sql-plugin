const raw = (texts: TemplateStringsArray, ...vs: any[]) => {
  let text = texts[0];
  let values = [];
  vs.forEach((v, idx) => {
    if (!!v && v[symbol]) {
      text += v.text;
      values = [...values, ...v.values];
    } else {
      text += '??';
      values.push(v);
    }
    text += texts[idx+1] || '';
  });
  return { [symbol]: true, text, values };
};

export const sql = (texts: TemplateStringsArray, ...vs: any[]) => {
  let query = raw(texts, ...vs);
  query.text = query.text.split('??').reduce((acc, cv, ci) => acc + '$' + ci + cv);
  return query;
};

export default sql;

const symbol = (sql.symbol = Symbol('sql'));

sql.raw = raw;

// const to_and = {m: undefined, n: undefined};
// no first and
// sql`select * from a where ${sql.and(to_and)}`
// with first and
// sql`select * from a where (1=1 ${sql.and(to_and)}) or (${sql.and(another_to_and)})`
// sql`select * from a where 1=1 and ${sql.and(to_and)}`
// 东西加多了是硬伤, 加少了可以有 sql.raw, 所以尽量少加
sql.and = (obj: object) => {
  let kvs = Object.entries(obj)
    .filter(([k, v]) => v !== undefined)
    .sort(([ka, va], [kb, vb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
  let values = [];
  if (kvs.length === 0) {
    return { [symbol]: true, text: '', values };
  }
  let text = kvs
    .map(([k, v]) => {
      values.push(v);
      return escape_identifier(k) + ' ??';
    })
    .join(' AND ');
  return { [symbol]: true, text, values };
};

sql.ins = (obj_or_objs: object | object[]) => {
  let objs = [].concat(obj_or_objs);
  let keys = Object.keys(Object.assign({}, ...objs)).sort();
  let values = [];
  let text = `(${keys.map(k => escape_identifier(k).split(' ')[0]).join(', ')}) VALUES ${(objs as object[])
    .map(
      obj =>
        `(${keys
          .map(k => {
            values.push(obj[k]);
            return '??';
          })
          .join(', ')})`,
    )
    .join(', ')}`;
  return { [symbol]: true, text, values };
};

sql.upd = (obj: object) => {
  let kvs = Object.entries(obj)
    .filter(([k, v]) => v !== undefined)
    .sort(([ka, va], [kb, vb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
  let values = [];
  let text = kvs
    .map(([k, v]) => {
      values.push(v);
      return escape_identifier(k) + ' ??';
    })
    .join(', ');
  return { [symbol]: true, text, values };
};

function escape_identifier(identifier: string) {
  let [schema, table, column, operator]: string[] = ['', '', '', ''];
  [column = '', operator = '='] = identifier.replace(/"/g, '').split(' ');
  let idents = column.split('.');
  if (idents.length === 1) {
    column = idents[0];
  }
  if (idents.length === 2) {
    [table, column] = idents;
  }
  if (idents.length === 3) {
    [schema, table, column] = idents;
  }
  return `"${schema}"."${table}"."${column}" ${operator}`.replace(/""\./g, '');
}
