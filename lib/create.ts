import * as child_process from "child_process";

import tss from "typescript/lib/tsserverlibrary";
import { decorateWithTemplateLanguageService } from "typescript-template-language-service-decorator";
import shq from "shell-quote";

import { find_all_nodes, merge_defaults } from "./utils";
import { make_fake_expression } from "./make_fake_expression";
import { SqlTemplateAutocomplete } from "./autocomplete";
import lunr from "lunr";
import { parseDirectives } from "./directiveParser";

export function makeCreate(mod: { typescript: typeof tss }) {
  return function create(info: tss.server.PluginCreateInfo): tss.LanguageService {
    const logger = (msg: string) => info.project.projectService.logger.info(`[ts-sql-plugin] ${msg}`);

    const config = merge_defaults(info.config);
    const cost_pattern = new RegExp(config.cost_pattern!);

    const proxy = new Proxy(info.languageService, {
      get(target, p, receiver) {
        if (p === "getSemanticDiagnostics") {
          return function getSemanticDiagnostics(fileName: string): tss.Diagnostic[] {
            let origin_diagnostics = target.getSemanticDiagnostics(fileName);

            const program = info.languageService.getProgram()!;
            const fake_expression = make_fake_expression(program.getTypeChecker(), config.tags);

            const source_file = program.getSourceFile(fileName)!;
            const nodes: tss.TaggedTemplateExpression[] = find_all_nodes(
              source_file,
              n =>
                n.kind === tss.SyntaxKind.TaggedTemplateExpression &&
                (n as tss.TaggedTemplateExpression).tag.getText() === config.tags.sql,
            ) as any;

            const explain_rss = nodes.map(n => {
              const make_diagnostic = (code: any, category: any, messageText: any) =>
                ({
                  file: source_file,
                  start: n.getStart(),
                  length: n.getEnd() - n.getStart(),
                  source: "ts-sql-plugin",
                  code,
                  category,
                  messageText,
                } as tss.Diagnostic);
              // one sql`select * from person ${xxx ? sql.raw`aaa` : sql.raw`bbb`}` may generate two sqls, need to be explained one by one
              let query_configs = fake_expression(n);
              for (const qc of query_configs) {
                let s: string = qc.text.replace(/\?\?/gm, "null");

                // ! Never pass unsanitized user input to child_process.execSync.
                // let stdout = "";
                // try {
                //   stdout = child_process.execSync(`${config.command} 'EXPLAIN ${s}'`, { encoding: 'utf8' });
                // } catch (error) {
                //   return make_diagnostic(1, tss.DiagnosticCategory.Error, error.stderr + "\n" + s);
                // }

                const [_command, ..._command_args] = (shq.parse(config.command).concat("EXPLAIN " + s) as any) as string[];
                const p = child_process.spawnSync(_command, _command_args, { encoding: "utf8" });
                if (p.status) {
                  return make_diagnostic(1, tss.DiagnosticCategory.Error, p.stderr);
                }

                const directives = parseDirectives(s);

                if (
                  [config.error_cost, config.warn_cost, config.info_cost].some(it => it != void 0) &&
                  !directives.some(x => x.directive === "ignore-cost")
                ) {
                  const match = p.stdout.match(cost_pattern);
                  if (match) {
                    const [_, cost_str] = match;
                    const cost = Number(cost_str);
                    if (cost > config.error_cost!) {
                      return make_diagnostic(
                        1,
                        tss.DiagnosticCategory.Error,
                        `explain cost is too high: ${cost}\n${s}`,
                      );
                    }
                    if (cost > config.warn_cost!) {
                      return make_diagnostic(
                        1,
                        tss.DiagnosticCategory.Warning,
                        `explain cost is at warning: ${cost}\n${s}`,
                      );
                    }
                    if (cost > config.info_cost!) {
                      return make_diagnostic(1, tss.DiagnosticCategory.Suggestion, `explain cost is ok: ${cost}\n${s}`);
                    }
                  } else {
                    return make_diagnostic(
                      1,
                      tss.DiagnosticCategory.Error,
                      `can not extract cost with cost_pattern: ${cost_pattern.source}\n${p.stdout}\n${s}`,
                    );
                  }
                }
              }
            });
            return [...origin_diagnostics, ...(explain_rss.filter(v => !!v) as any[])];
          };
        }
        return (target as any)[p];
      },
    });

    if (!config.schema_command) {
      return proxy;
    }

    const [_schema_command, ..._schema_command_args] = shq.parse(config.schema_command) as any as string[];
    const schema_info_p = child_process.spawnSync(_schema_command, _schema_command_args, { encoding: 'utf8' });
    if (schema_info_p.status) {
      throw Error(schema_info_p.stderr);
    }
    const schema_info = schema_info_p.stdout
      .split("\n")
      .map(it => it.match(/\w+/g))
      .filter(it => it?.length === 3)
      .map((raw, id) => {
        const [schema, table, column] = raw!;
        return { schema, table, column, id };
      });

    return decorateWithTemplateLanguageService(
      mod.typescript,
      proxy,
      info.project,
      new SqlTemplateAutocomplete(
        lunr(function () {
          this.ref("id");
          this.field("column");
          this.field("schema");
          this.field("table");
          schema_info.forEach(schema_info_item => this.add(schema_info_item));
        }),
        schema_info,
        // schema_info.reduce((acc, schema_info_item) => {
        //   acc[schema_info_item.id] = schema_info_item;
        //   return acc;
        // }, {} as any),
      ),
      { tags: ["sql"], enableForStringWithSubstitutions: true },
    );
  };
}
