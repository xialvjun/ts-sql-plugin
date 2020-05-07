import * as child_process from "child_process";

// import ts from 'typescript'; // used as value, passed in by tsserver at runtime
import tss from "typescript/lib/tsserverlibrary"; // used as type only
import { decorateWithTemplateLanguageService } from "typescript-template-language-service-decorator";

import {
  find_all_nodes,
  default_command,
  default_tags,
  default_cost_pattern,
} from "./utils";
import { make_fake_expression, Tags } from "./make_fake_expression";
import { SqlTemplateAutocomplete } from "./autocomplete";
import lunr from "lunr";
import { parseDirectives } from "./directiveParser";

interface TsSqlPluginConfig {
  error_cost?: number;
  warn_cost?: number;
  info_cost?: number;
  cost_pattern?: string;
  command: string[];
  tags: Tags;
}
export function makeCreate(mod: { typescript: typeof tss }) {
  return function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const logger = (msg: string) =>
      info.project.projectService.logger.info(`[ts-sql-plugin] ${msg}`);

    const config: TsSqlPluginConfig = {
      command: default_command,
      cost_pattern: default_cost_pattern.source,
      ...info.config,
      tags: { ...default_tags, ...(info.config || {}).tags },
    };

    const cost_pattern = new RegExp(config.cost_pattern);

    const proxy = new Proxy(info.languageService, {
      get(target, p, receiver) {
        if (p === "getSemanticDiagnostics") {
          return function getSemanticDiagnostics(
            fileName: string
          ): tss.Diagnostic[] {
            let origin_diagnostics = target.getSemanticDiagnostics(fileName);

            const program = info.languageService.getProgram();
            const fake_expression = make_fake_expression(
              program.getTypeChecker(),
              config.tags
            );

            const source_file = program.getSourceFile(fileName);
            const nodes: tss.TaggedTemplateExpression[] = find_all_nodes(
              source_file,
              (n) =>
                n.kind === tss.SyntaxKind.TaggedTemplateExpression &&
                (n as tss.TaggedTemplateExpression).tag.getText() ===
                  config.tags.sql
            ) as any;

            const explain_rss = nodes.map((n) => {
              const make_diagnostic = (
                code: any,
                category: any,
                messageText: any
              ) => ({
                file: source_file,
                start: n.getStart(),
                length: n.getEnd() - n.getStart(),
                source: "ts-sql-plugin",
                code,
                category,
                messageText,
              });
              // one sql`select * from person ${xxx ? sql.raw`aaa` : sql.raw`bbb`}` may generate two sqls, need to be explained one by one
              let query_configs = fake_expression(n);
              for (const qc of query_configs) {
                let s: string = qc.text.replace(/\?\?/gm, "null");
                let p = child_process.spawnSync(
                  config.command[0],
                  config.command.slice(1).concat(`EXPLAIN ${s}`)
                );
                const directives = parseDirectives(s);
                if (p.status) {
                  const stderr_str = (p.stderr.toString as any)("utf8");
                  return make_diagnostic(
                    1,
                    tss.DiagnosticCategory.Error,
                    stderr_str
                  );
                }

                if (
                  [config.error_cost, config.warn_cost, config.info_cost].some(
                    (it) => it != void 0
                  ) &&
                  !directives.some((x) => x.directive === "ignore-cost")
                ) {
                  const stdout_str = (p.stdout.toString as any)("utf8");
                  const match = stdout_str.match(cost_pattern);
                  if (match) {
                    const [_, cost_str] = match;
                    const cost = Number(cost_str);
                    if (cost > config.error_cost) {
                      return make_diagnostic(
                        1,
                        tss.DiagnosticCategory.Error,
                        `explain cost is too high: ${cost}`
                      );
                    }
                    if (cost > config.warn_cost) {
                      return make_diagnostic(
                        1,
                        tss.DiagnosticCategory.Warning,
                        `explain cost is at warning: ${cost}`
                      );
                    }
                    if (cost > config.info_cost) {
                      return make_diagnostic(
                        1,
                        tss.DiagnosticCategory.Suggestion,
                        `explain cost is ok: ${cost}`
                      );
                    }
                  } else {
                    return make_diagnostic(
                      1,
                      tss.DiagnosticCategory.Error,
                      `can not extract cost with cost_pattern: ${cost_pattern.source}\n${stdout_str}`
                    );
                  }
                }
              }
            });
            return [...origin_diagnostics, ...explain_rss.filter((v) => !!v)];
          };
        }
        return target[p];
      },
    });

    const db_info_raw = child_process
      .spawnSync(
        config.command[0],
        config.command
          .slice(1)
          .concat(
            "copy (select table_schema, table_name, column_name from information_schema.columns) to stdout delimiter ','"
          )
      )
      .stdout.toString();

    const db_info = db_info_raw
      .trim()
      .split("\n")
      .map((raw, id) => {
        const [schema, table, column] = raw.split(",");
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
          db_info.forEach((db_info_item) => this.add(db_info_item));
        }),
        db_info.reduce((acc, db_info_item) => {
          acc[db_info_item.id] = db_info_item;
          return acc;
        }, {})
      ),
      { tags: ["sql"], enableForStringWithSubstitutions: true }
    );
  };
}
