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
};

export function create(info: tss.server.PluginCreateInfo): tss.LanguageService {
  const logger = (msg: string) => info.project.projectService.logger.info(`[ts-sql-plugin] ${msg}`);
  logger('config: ' + JSON.stringify(info.config));

  const config: TsSqlPluginConfig = { command: default_command, ...info.config, tags: { ...default_tags, ...(info.config || {}).tags } };

  const fns = {
    [config.tags.and]: sql.and,
    [config.tags.ins]: sql.ins,
    [config.tags.upd]: sql.upd,
    [config.tags.raw]: sql.raw,
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
            const texts: string[] = [];
            const values = [];

            if (n.template.kind === tss.SyntaxKind.TemplateExpression) {
              texts.push(n.template.head.text);

              n.template.templateSpans.forEach(span => {
                values.push(null);
                if (tss.isCallExpression(span.expression)) {
                  const fn = fns[span.expression.expression.getLastToken().getText()];
                  if (!!fn) {
                    const t = type_checker.getTypeAtLocation(span.expression.arguments[0]);
                    logger(t.getProperty(sql.symbol));
                    const fake = t.getProperties().reduce((acc, cv) => Object.assign(acc, { [cv.getName()]: null }), {});
                    values.pop();
                    values.push(fn(fake));
                  }
                }

                texts.push(span.literal.text);
              });
            } else if (n.template.kind === tss.SyntaxKind.NoSubstitutionTemplateLiteral) {
              texts.push(n.template.text);
            }

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
