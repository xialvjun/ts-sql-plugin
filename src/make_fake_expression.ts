import ts from 'typescript'; // used as value, passed in by tsserver at runtime
// import tss from 'typescript/lib/tsserverlibrary'; // used as type only

import sql from './sql';
import { is_array, deep_flatten } from './utils';

export interface Tags {
  sql: string;
  and: string;
  or: string;
  ins: string;
  upd: string;
  raw: string;
  cond: string;
  mock: string;
}

export const make_fake_expression = (
  type_checker: ts.TypeChecker,
  tags: Tags,
) => {
  const fns = {
    [tags.and]: sql.and,
    [tags.ins]: sql.ins,
    [tags.upd]: sql.upd,
    [tags.or]: sql.or,
    [tags.mock]: sql.mock,
  };
  const tag_regex = new RegExp(
    '^' + tags.sql + '$|' + tags.raw + '$|' + tags.cond + '\\(',
  );
  return fake_expression;

  function fake_expression_from_tagged_template(n: ts.TaggedTemplateExpression) {
    const fn = sql.raw;
    if (n.template.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
      return [fn(([n.template.text] as unknown) as TemplateStringsArray)];
    }
    if (n.template.kind === ts.SyntaxKind.TemplateExpression) {
      const texts = ([
        n.template.head.text,
        ...n.template.templateSpans.map(span => span.literal.text),
      ] as unknown) as TemplateStringsArray;
      let values: any[][] = n.template.templateSpans
        .map(span => fake_expression(span.expression))
        .map(v => (is_array(v) ? deep_flatten(v) : [v]));

      // * 要想编译期校验 sql, 则 sql 模板字符串内的所有有 sql.symbol 的对象都需要直接在模板字符串内定义(其实 and,ins,upd 可以不用, 只要给它们分配泛型类型就足够, 但是 raw 必须如此,
      // * 而且就算匹配类型, 也得寻找类型原始出处, 也容易出错, 所以干脆统一要求在模板字符串内定义)...
      // * 然后要做分支 raw, 则需要每个分支单独 explain 校验(不然肯定出错, 例如 asc desc 同时出现)...
      // * 做分支检测最好是出现分支时, 把 texts,values 复制一份, 分支各自进行下去, 进行到最终点的时候, 自行检测, 不需要统一检测所有分支
      // var arr = [[1],[21,22,23], [31,32], [4]];
      // // debugger;
      // var rs = arr.reduce((acc, cv) => {
      //   return cv.map(v => {
      //     return acc.map(ac => {
      //       return ac.concat(v);
      //     })
      //   }).reduce((acc, cv) => acc.concat(cv), []);
      // }, [[]]);
      // console.table(rs);
      // // rs should be [[1,21,31,4],[1,22,31,4],[1,23,31,4],[1,21,32,4],[1,22,32,4],[1,23,32,4]];

      let all_values = values.reduce(
        (acc, cv) => {
          return cv
            .map(v => acc.map(ac => ac.concat(v)))
            .reduce((acc, cv) => acc.concat(cv), []);
        },
        [[]],
      );
      return all_values.map(_values => sql.raw(texts, ..._values));
    }
  }

  function fake_expression_from_tagged_value_declaration(valueDeclaration: ts.Declaration) {
    const childCount = valueDeclaration.getChildCount();
    const template = valueDeclaration.getChildAt(childCount - 1);
    if (ts.isTaggedTemplateExpression(template) && tag_regex.test(template.tag.getText())) {
      return fake_expression_from_tagged_template(template);
    }
  }

  function fake_expression_from_function_value_declaration(valueDeclaration: ts.Declaration) {
    const fnBody = <ts.Block>(
      (<any>valueDeclaration).body ||
      (<any>valueDeclaration).initializer && (<any>valueDeclaration).initializer.body);
    const returnStatement = (fnBody && fnBody.statements || (<Array<ts.Statement>>[])).find(s => ts.isReturnStatement(s));
    if (returnStatement) {
      const template = returnStatement.getChildren().find(c => ts.isTaggedTemplateExpression(c)) as ts.TaggedTemplateExpression;
      if (template && tag_regex.test(template.tag.getText())) {
        return fake_expression_from_tagged_template(template);
      }
    }
  }

  // ! fake raw``,and(),ins(),upd(),?: and other expression. sql`` is just a special kind of raw``.
  function fake_expression(n: ts.Expression) {
    if (ts.isIdentifier(n)) {
      const symbol = type_checker.getSymbolAtLocation(n);
      if (symbol && symbol.valueDeclaration) {
        const fromDirectVariable = fake_expression_from_tagged_value_declaration(symbol.valueDeclaration);
        if (fromDirectVariable) {
          return fromDirectVariable;
        }
      }
      if (symbol && symbol.declarations && symbol.declarations.length && (<any>ts).isAliasSymbolDeclaration(symbol.declarations[0])) {
        const aliasedSymbol = type_checker.getAliasedSymbol(symbol);
        if (aliasedSymbol.valueDeclaration) {
          return fake_expression_from_tagged_value_declaration(aliasedSymbol.valueDeclaration);
        }
      }
    }
    if (ts.isCallExpression(n)) {
      const fn = fns[(n.expression.getLastToken() || n.expression).getText()];
      if (!!fn) {
        const t = type_checker.getTypeAtLocation(n.arguments[0]);
        let fake: any = null;
        if (fn == sql.mock) {
          const argument = n.arguments && n.arguments[0] as ts.ObjectLiteralExpression;
          if (argument) {
            const property = argument.properties.find(p => p.name.getText() === 'mock');
            const text: string = (<any>property)?.initializer?.text;
            if (text) {
              return { [sql.symbol]: true, text, values: [] };
            }
          }
        }
        if (fn == sql.and || fn == sql.upd || fn == sql.ins) {
          const ut = t.getNumberIndexType() as ts.UnionType;
          if (fn == sql.ins && !!ut) {
            if (!!ut.types) {
              fake = ut.types.map(t => object_type_to_fake(t));
            } else {
              fake = object_type_to_fake(ut);
            }
          } else {
            fake = object_type_to_fake(t);
          }
        }
        if (fn == sql.or) {
          const ut = t.getNumberIndexType() as ts.UnionType;
          if (!!ut.types) {
            fake = ut.types.map(t => object_type_to_fake(t));
          } else {
            fake = [object_type_to_fake(ut)];
          }
        }
        return fn(fake);
      }
      const symbol = type_checker.getSymbolAtLocation(n.expression);
      if (symbol && symbol.valueDeclaration) {
        const resp = fake_expression_from_function_value_declaration(symbol.valueDeclaration);
        if (resp) {
          return resp;
        }
      }
      if (symbol && symbol.declarations && symbol.declarations.length && (<any>ts).isAliasSymbolDeclaration(symbol.declarations[0])) {
        const aliasedSymbol = type_checker.getAliasedSymbol(symbol);
        if (aliasedSymbol.valueDeclaration) {
          const resp = fake_expression_from_function_value_declaration(aliasedSymbol.valueDeclaration);
          if (resp) {
            return resp;
          }
        }
      }
    }
    if (ts.isTaggedTemplateExpression(n)) {
      // 因为又 sql.cond(boolean)`` 所以不能直接 n.tag.getText() === tags.xxx
      if (tag_regex.test(n.tag.getText())) {
        return fake_expression_from_tagged_template(n);
      }
    }
    if (ts.isConditionalExpression(n)) {
      return [fake_expression(n.whenTrue), fake_expression(n.whenFalse)];
    }
    return null;
  }
};

// function isTypeReference(type: ts.Type): type is ts.TypeReference {
//   return !!(
//     type.getFlags() & ts.TypeFlags.Object &&
//     (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
//   );
// }

// function isArrayType(type: ts.Type): boolean {
//   return isTypeReference(type) && (
//     type.target.symbol.name === "Array" ||
//     type.target.symbol.name === "ReadonlyArray"
//   );
// }

const object_type_to_fake = (t: ts.Type) => {
  return t
    .getProperties()
    .reduce((acc, cv) => Object.assign(acc, { [cv.getName()]: null }), {});
};
