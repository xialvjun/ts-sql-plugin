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

export function create(info: tss.server.PluginCreateInfo): tss.LanguageService {
  const logger = (msg: string) => info.project.projectService.logger.info(`[ts-sql-plugin] ${msg}`);
  logger('config: ' + JSON.stringify(info.config));

  const config: TsSqlPluginConfig = { command: default_command, ...info.config, tags: { ...default_tags, ...(info.config || {}).tags } };

  const fns = {
    [config.tags.and]: sql.and,
    [config.tags.ins]: sql.ins,
    [config.tags.upd]: sql.upd,
    // [config.tags.cond]: sql.cond,
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

          const explain_rss = nodes.map(n => {
            const texts: string[] = [''];
            const values = [];

            function make(n: tss.TaggedTemplateExpression) {
              logger(n.getFullText());
              if (n.template.kind === tss.SyntaxKind.TemplateExpression) {
                // texts.push(n.template.head.text);
                texts[texts.length - 1] += n.template.head.text;
                logger('texts.push(n.template.head.text);' + texts.join('----'));
  
                n.template.templateSpans.forEach(span => {
                  values.push(null);
                  let pushed = true;
                  logger('values:null---' + values.length);
                  if (tss.isCallLikeExpression(span.expression)) {
                    // CallExpression | NewExpression | TaggedTemplateExpression | Decorator | JsxOpeningLikeElement
                    // const kind_name = {
                    //   [tss.SyntaxKind.CallExpression]: 'CallExpression',
                    //   [tss.SyntaxKind.NewExpression]: 'NewExpression',
                    //   [tss.SyntaxKind.TaggedTemplateExpression]: 'TaggedTemplateExpression',
                    //   [tss.SyntaxKind.Decorator]: 'Decorator',
                    // };
                    // logger(`${kind_name[span.expression.kind]}: ${span.expression.getFullText()}`);
                    if (tss.isCallExpression(span.expression)) {
                      const fn = fns[span.expression.expression.getLastToken().getText()];
                      if (!!fn) {
                        const t = type_checker.getTypeAtLocation(span.expression.arguments[0]);
                        const fake: object = t.getProperties().reduce((acc, cv) => Object.assign(acc, { [cv.getName()]: null }), {});
                        values.pop();
                        logger('values:pop---' + values.length);
                        values.push(fn(fake));
                        logger('values:fake---' + values.length);
                      }
                    } else if (tss.isTaggedTemplateExpression(span.expression)) {
                      logger('---------------' + span.expression.tag.getText());
                      if (span.expression.tag.getText().match(new RegExp(config.tags.cond+'$|'+config.tags.cond+'\\(|'+config.tags.raw+'$'))) {
                        logger('---------------match' + span.expression.tag.getText());
                        values.pop();
                        pushed = false;
                        logger('values:pop---' + values.length);
                        // sql.cond(true)(span.expression.template)
                        // const m = make(span.expression);
                        // texts[texts.length-1] += m.texts[0];
                        // texts = [...texts, ...m.texts.slice(1)];
                        // values = [...values, ...m.values];
                        make(span.expression);
                      }
                    }
                  }
                  if (pushed) {
                    texts.push(span.literal.text);
                  } else {
                    texts[texts.length - 1] += span.literal.text;
                  }
                  
                  logger('texts:literal---' + texts.length);
                  logger(texts.join('----'));
                });
              } else if (n.template.kind === tss.SyntaxKind.NoSubstitutionTemplateLiteral) {
                // texts.push(n.template.text);
                texts[texts.length - 1] += n.template.text;
                logger('texts:notemplate---' + texts.length);
                logger(texts.join('----'));
              }
              return { texts, values };
            }
            // const { texts, values } = make(n);
            make(n);
            logger(texts.length + ':::' + values.length);

            // if (n.template.kind === tss.SyntaxKind.TemplateExpression) {
            //   texts.push(n.template.head.text);

            //   n.template.templateSpans.forEach(span => {
            //     values.push(null);
            //     if (tss.isCallLikeExpression(span.expression)) {
            //       // CallExpression | NewExpression | TaggedTemplateExpression | Decorator | JsxOpeningLikeElement
            //       const kind_name = {
            //         [tss.SyntaxKind.CallExpression]: 'CallExpression',
            //         [tss.SyntaxKind.NewExpression]: 'NewExpression',
            //         [tss.SyntaxKind.TaggedTemplateExpression]: 'TaggedTemplateExpression',
            //         [tss.SyntaxKind.Decorator]: 'Decorator',
            //       };
            //       logger(`${kind_name[span.expression.kind]}: ${span.expression.getFullText()}`);
            //       if (tss.isCallExpression(span.expression)) {
            //         const fn = fns[span.expression.expression.getLastToken().getText()];
            //         if (!!fn) {
            //           const t = type_checker.getTypeAtLocation(span.expression.arguments[0]);
            //           const fake = t.getProperties().reduce((acc, cv) => Object.assign(acc, { [cv.getName()]: null }), {});
            //           values.pop();
            //           values.push(fn(fake));
            //         }
            //       } else if (tss.isTaggedTemplateExpression(span.expression)) {
            //         logger('asdfsdasg'+span.expression.tag.kind+'');
            //       }
            //     }

            //     texts.push(span.literal.text);
            //   });
            // } else if (n.template.kind === tss.SyntaxKind.NoSubstitutionTemplateLiteral) {
            //   texts.push(n.template.text);
            // }

            const diagnostic = {
              file: source_file,
              start: n.getStart(),
              length: n.getEnd() - n.getStart(),
              source: 'pgsql',
              messageText: '',
              category: tss.DiagnosticCategory.Message,
              code: 0,
            };
            try {
              logger(texts.join('---') + ':::::' + JSON.stringify(values));
              let query_config = sql((texts as unknown) as TemplateStringsArray, ...values);
              let s = query_config.text.replace(/\$\d+/g, 'null').replace(/'/g, "'");
              let buffer_rs = child_process.execSync(`${config.command} 'EXPLAIN ${s}'`);
              // let messageText = buffer_rs.toString('utf8');
              return null;
            } catch (error) {
              diagnostic.messageText = error.message;
              diagnostic.category = tss.DiagnosticCategory.Error;
              diagnostic.code = 1;
              return diagnostic;
            }
          });
          return [...origin_diagnostics, ...explain_rss.filter(v => !!v)];
        };
      }
      return target[p];
    },
  });
}
