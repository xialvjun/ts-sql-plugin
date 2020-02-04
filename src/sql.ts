const raw = (texts: TemplateStringsArray, ...vs: any[]) => {
  let text = texts[0];
  let values = [];
  vs.forEach((v, idx) => {
    if (!!v && v[symbol]) {
      text += v.text.replace(/\$\d+/g, '??');
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

sql.cond = (condition: boolean) => condition ? raw : (...anything: any[]) => raw``;

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

sql.or = <T extends any[]>(objs: T) => {
  return objs.map(obj => sql.and(obj)).reduce((acc, cv, idx) => {
    acc.text += `${idx === 0 ? '' : ' OR'} (${cv.text})`;
    acc.values = acc.values.concat(cv.values);
    return acc;
  }, { [symbol]: true, text: '', values: [] });
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

sql.mock = (obj: {mock: string, placeholder: string}) => {
  return { [symbol]: true, text: obj.placeholder, values: [] };
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



// ? 有想过把所有数据都放在类型系统上, 这样 sql.raw`` 得到的结果就可以作为变量到处传递了, 不需要限制死在 sql`` 内部使用, 与运行时等同...但问题是 TemplateStringsArray 把字符串模板的 const 字符串信息丢失了, 这里只能 typescript 上游去解决, 这样在类型上根本无法得到 raw 里面的字符串, 至于从变量传递作用域上, 那结果就是完全不确定的
// interface AAA<TSA, VS> {
//   __texts: TSA;
//   __values: VS;
// }

// function abc<TSA extends TemplateStringsArray, VS extends any[]>(texts: TSA, ...vs: VS): AAA<TSA, VS> {
//   return {__texts: texts, __values: vs}
// }

// var a = abc`select * from ${123} and good ${new Date()} ${window}`;
// // var a: AAA<['select * from ', ' and good ', ' ', ''], [number, Date, Window]>

// enum ExpressionKind {
//   RAW,
//   SQL,
//   AND,
//   INS,
//   UPD,
// };

// interface Expression {
//   __kind__: ExpressionKind;
//   text: string;
//   values: any[];
// }

// interface RawExpression extends Expression {
//   __kind__: ExpressionKind.RAW;
// }

// interface SqlExpression extends Expression {
//   __kind__: ExpressionKind.SQL;
// }

// interface AndExpression extends Expression {
//   __kind__: ExpressionKind.AND;
// }

// interface InsExpression extends Expression {
//   __kind__: ExpressionKind.INS;
// }

// interface UpdExpression extends Expression {
//   __kind__: ExpressionKind.UPD;
// }

// // raw: raw
// // and: and<T>
// // ins: ins<T>
// // upd: upd<T>
