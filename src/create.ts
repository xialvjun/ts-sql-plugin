import * as ts from 'typescript'; // used as value, passed in by tsserver at runtime
import * as tss from 'typescript/lib/tsserverlibrary'; // used as type only

import * as child_process from 'child_process';
import sql from './sql';

export interface TsSqlPluginConfig {
  command: string;
  tags: {
    sql: string;
    and: string;
    ins: string;
    upd: string;
    raw: string;
    cond: string;
  };
}

function findAllNodes(sourceFile: tss.SourceFile, cond: (n: tss.Node) => boolean): tss.Node[] {
  const result: tss.Node[] = [];
  function find(node: tss.Node) {
    if (cond(node)) {
      result.push(node);
      return;
    } else {
      tss.forEachChild(node, find);
    }
  }
  find(sourceFile);
  return result;
}

const default_command = 'psql -U postgres -c';
const default_tags = {
  sql: 'sql',
  and: 'and',
  ins: 'ins',
  upd: 'upd',
  raw: 'raw',
  cond: 'cond',
};

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

const is_array = obj => Object.prototype.toString.call(obj) === '[object Array]';
const deep_flatten = arr => {
  let new_arr = [];
  new_arr = arr.reduce((acc, cv) => acc.concat(cv), []);
  while (new_arr.length !== arr.length) {
    arr = new_arr;
    new_arr = arr.reduce((acc, cv) => acc.concat(cv), []);
  }
  return new_arr;
}

export function create(info: tss.server.PluginCreateInfo): tss.LanguageService {
  const logger = (msg: string) => info.project.projectService.logger.info(`[ts-sql-plugin] ${msg}`);
  logger('config: ' + JSON.stringify(info.config));

  const config: TsSqlPluginConfig = { command: default_command, ...info.config, tags: { ...default_tags, ...(info.config || {}).tags } };

  const fns = {
    [config.tags.and]: sql.and,
    [config.tags.ins]: sql.ins,
    [config.tags.upd]: sql.upd,
  };

  return new Proxy(info.languageService, {
    get(target, p, receiver) {
      if (p === 'getSemanticDiagnostics') {
        return function getSemanticDiagnostics(fileName: string): tss.Diagnostic[] {
          let origin_diagnostics = target.getSemanticDiagnostics(fileName);

          const type_checker = info.languageService.getProgram().getTypeChecker();
          const source_file = info.languageService.getProgram().getSourceFile(fileName);
          const nodes: tss.TaggedTemplateExpression[] = findAllNodes(
            source_file,
            n => n.kind === tss.SyntaxKind.TaggedTemplateExpression && (n as tss.TaggedTemplateExpression).tag.getText() === config.tags.sql,
          ) as any;

          // ! fake raw``,and(),ins(),upd(),?: and other expression. sql`` is just a special kind raw``.
          function fake_expression(n: tss.Expression, is_sql_tag?: boolean) {
            if (tss.isCallExpression(n)) {
              const fn = fns[n.expression.getLastToken().getText()];
              if (!!fn) {
                const t = type_checker.getTypeAtLocation(n.arguments[0]);
                const fake: object = t.getProperties().reduce((acc, cv) => Object.assign(acc, { [cv.getName()]: null }), {});
                return fn(fake);
              }
            }
            if (tss.isTaggedTemplateExpression(n)) {
              if (is_sql_tag || n.tag.getText().match(new RegExp(config.tags.cond+'$|'+config.tags.cond+'\\(|'+config.tags.raw+'$'))) {
                const fn = sql.raw;
                // ! here should be a typescript bug
                // if (tss.isNoSubstitutionTemplateLiteral(n)) {
                //   // can not get n.template.text
                //   return fn([n.template.text] as unknown as TemplateStringsArray, [])
                // }
                // if (tss.isTemplateExpression(n)) {
                // }
                if (n.template.kind === tss.SyntaxKind.NoSubstitutionTemplateLiteral) {
                  return fn([n.template.text] as unknown as TemplateStringsArray)
                }
                if (n.template.kind === tss.SyntaxKind.TemplateExpression) {
                  const texts = [n.template.head.text, ...n.template.templateSpans.map(span => span.literal.text)] as unknown as TemplateStringsArray;
                  logger(JSON.stringify(texts));
                  let values = n.template.templateSpans.map(span => fake_expression(span.expression)).map(v => is_array(v) ? deep_flatten(v) : [v]);
                  let all_values = values.reduce((acc, cv) => {
                    return cv.map(v => acc.map(ac => ac.concat(v))).reduce((acc, cv) => acc.concat(cv), []);
                  }, [[]]);
                  return all_values.map(_values => fn(texts, ..._values));
                }
              }
            }
            if (tss.isConditionalExpression(n)) {
              return [fake_expression(n.whenTrue), fake_expression(n.whenFalse)];
            }
            return null;
          }

          // * 要想编译期校验 sql, 则 sql 模板字符串内的所有有 sql.symbol 的对象都需要直接在模板字符串内定义(其实 and,ins,upd 可以不用, 只要给它们分配泛型类型就足够, 但是 raw 必须如此, 
          // * 而且就算匹配类型, 也得寻找类型原始出处, 也容易出错, 所以干脆统一要求在模板字符串内定义)...
          // * 然后要做分支 raw, 则需要每个分支单独 explain 校验(不然肯定出错, 例如 asc desc 同时出现)...
          // * 做分支检测最好是出现分支时, 把 texts,values 复制一份, 分支各自进行下去, 进行到最终点的时候, 自行检测, 不需要统一检测所有分支
          const explain_rss = nodes.map(n => {
            const make_diagnostic = (code, category, messageText) => ({
              file: source_file,
              start: n.getStart(),
              length: n.getEnd() - n.getStart(),
              source: 'pgsql',code, category, messageText
            });
            try {
              let query_configs = fake_expression(n, true);
              
              query_configs.map(qc => {
                logger(qc.text);
                let s = qc.text.replace(/\?\?/gm, 'null').replace(/'/g, "\'");
                let buffer_rs = child_process.execSync(`${config.command} 'EXPLAIN ${s}'`);
                // let messageText = buffer_rs.toString('utf8');
                return null;
              });
              return null;
            } catch (error) {
              return make_diagnostic(1, tss.DiagnosticCategory.Error, error.message);
            }
          });
          return [...origin_diagnostics, ...explain_rss.filter(v => !!v)];
        };
      }
      return target[p];
    },
  });
}
