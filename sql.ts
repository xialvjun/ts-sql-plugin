const parseValue = (v: any) => {
    return !!v && v[symbol]
        ? { text: v.text, values: v.values}
        : { text: '??', values: [v] };
}

const raw = (texts: TemplateStringsArray | string[], ...vs: any[]) => {
  let text = texts[0] || '';
  let values: any[] = [];
  let parseResult = null;
  vs.forEach((v, idx) => {
    parseResult = parseValue(v);
    text += parseResult.text;
    values.push(...parseResult.values)
    text += texts[idx + 1] || "";
  });
  return { [symbol]: true, text, values };
};

export const sql = (texts: TemplateStringsArray, ...vs: any[]) => raw(texts, ...vs);

export default sql;

const symbol = (sql.symbol = Symbol("sql"));

sql.raw = raw;

sql.cond = (condition: boolean) => (condition ? raw : (..._: any[]) => raw``);

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
  let values: any[] = [];
  if (kvs.length === 0) {
    return { [symbol]: true, text: "", values };
  }
  let text = kvs
    .map(([k, v]) => {
      values.push(v);
      return validate_identifier(k) + " ??";
    })
    .join(" AND ");
  return { [symbol]: true, text, values };
};

sql.or = <T extends any[]>(objs: T) => {
  return objs
    .map(obj => sql.and(obj))
    .reduce(
      (acc, cv, idx) => {
        acc.text += `${idx === 0 ? "" : " OR"} (${cv.text})`;
        acc.values = acc.values.concat(cv.values);
        return acc;
      },
      { [symbol]: true, text: "", values: [] },
    );
};

sql.ins = (obj_or_objs: object | object[]) => {
  let objs: any[] = [].concat(obj_or_objs as any);
  let keys = Object.keys(Object.assign({}, ...objs)).sort();
  let values: any[] = [];
  let parseResult = null;
  let text = `(${keys.map(k => validate_identifier(k).split(" ")[0]).join(", ")}) VALUES ${objs
    .map(
      obj =>
        `(${keys
          .map(k => {
            parseResult = parseValue(obj[k])
            values.push(...parseResult.values);
            return parseResult.text;
          })
          .join(", ")})`,
    )
    .join(", ")}`;
  return { [symbol]: true, text, values };
};

sql.upd = (obj: object) => {
  let kvs = Object.entries(obj)
    .filter(([k, v]) => v !== undefined)
    .sort(([ka, va], [kb, vb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
  let values: any[] = [];
  let parseResult = null
  let text = kvs
    .map(([k, v]) => {
      parseResult = parseValue(v);
      values.push(...parseResult.values);
      return validate_identifier(k) + `${parseResult.text}`;
    })
    .join(", ");
  return { [symbol]: true, text, values };
};

sql.mock = <M extends string>(value: any) => value;

function validate_identifier(identifier: string) {
  // we can believe a functionnal sql (ignore it's good or bad) has to include more than one space, so forbid it
  const match_space = identifier.match(/\s/g);
  if (!match_space) {
    return identifier + ' =';
  }
  if (match_space.length === 1) {
    return identifier;
  }
  throw Error("ts-sql-plugin sql param object key can not have more than one space");
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
