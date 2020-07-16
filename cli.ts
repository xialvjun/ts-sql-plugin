#!/usr/bin/env node

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

import ts from "typescript";
import { program } from "commander";
import { quote } from "shell-quote";

import {
  default_mock,
  default_cost_pattern,
  default_tags,
  default_command,
  merge_defaults,
  get_all_ts_files,
  report,
} from "./lib/utils";
import { make_fake_expression } from "./lib/make_fake_expression";
import { parseDirectives } from "./lib/directiveParser";

program
  .option("-w, --watch", `watch mode of cli`)
  .option("-p, --project <string>", "path of tsconfig.json", "./tsconfig.json")
  .option("-e, --exclude <regexp>", "regexp to exclude files", "node_modules")
  .option("--emit_dir <path>", "where sqls will be emitted")
  // ! --mock, --error_cost, --warn_cost, --info_cost, --cost_pattern, --tags, --command are the same as plugin options
  // ! do not use commander default option value, to use the options in tsconfig.json
  .option(
    "-m, --mock <string>",
    `string to mock the values in the fake sqls, you can override it with: sql.mock<'null'>(any_value) (default: "${default_mock}")`,
  )
  .option("--error_cost <number>", `throw error if explain cost exceeds treshold`)
  .option("--warn_cost <number>", `log warning if explain cost exceeds treshold`)
  .option("--info_cost <number>", `log info if explain cost exceeds treshold`)
  .option(
    "--cost_pattern <regexp>",
    `regexp to extract cost from command stdout, make sure the number is the first capturing group (default: "/${default_cost_pattern.source}/")`,
    // (str, pv) => new RegExp(str || pv),
    // default_cost_pattern.source as any as RegExp
  )
  .option(
    "-t, --tags <string>",
    `tags you used in you ts file (default: "${Object.entries(default_tags)
      .map(it => it.join("="))
      .join(",")}")`,
    (str, pv) => {
      return Object.fromEntries(str.split(",").map(s => s.split("=")));
      // return [(pv as any) as string, str]
      //   .map((it) => Object.fromEntries(it.split(",").map((s) => s.split("="))))
      //   .reduce((acc, cv) => ({ ...acc, ...cv }), {}) as typeof default_tags;
    },
    // (Object.entries(default_tags)
    //   .map((it) => it.join("="))
    //   .join(",") as any) as typeof default_tags
  )
  .option(
    "-c, --command <string>",
    `command to be run to explain the fake sql (default: "${default_command}")` /* default_command */,
  )
  .description(
    `Explain all your sqls in your code to test them. \n\nEg: ts-sql-plugin -p ./my_ts_projet/tsconfig.json -c 'psql -c'`,
  )
  .action(() => {
    const config: any = merge_defaults(program.opts() as any);
    config.exclude = new RegExp(config.exclude);
    config.cost_pattern = new RegExp(config.cost_pattern);

    const { config: tsconfig } = ts.parseConfigFileTextToJson(
      config.project,
      fs.readFileSync(config.project, { encoding: "utf8" }),
    );

    if (config.watch) {
      const watchHost = ts.createWatchCompilerHost(
        get_all_ts_files(path.dirname(config.project)),
        tsconfig.compilerOptions,
        ts.sys,
      );
      const watchProgram = ts.createWatchProgram(watchHost);
      const onChangeFile = (fileName: string) => {
        const file = watchProgram.getProgram().getSourceFile(fileName);
        if (file) {
          fake_expression = make_fake_expression(watchProgram.getProgram().getProgram().getTypeChecker(), config.tags);
          delint(file);
        }
      };
      const watchFile = (sourceFile: ts.SourceFile) => {
        watchHost.watchFile(sourceFile.fileName, (fileName, event) => {
          if (event !== ts.FileWatcherEventKind.Deleted) {
            onChangeFile(fileName);
          }
        });
      };
      const source_files = watchProgram
        .getProgram()
        .getSourceFiles()
        .filter(it => !config.exclude.test(it.fileName));
      source_files.forEach(watchFile);
      source_files.forEach(it => onChangeFile(it.fileName));
      return;
    }

    const initProgram = ts.createProgram(get_all_ts_files(path.dirname(config.project)), tsconfig.compilerOptions);
    let fake_expression = make_fake_expression(initProgram.getTypeChecker(), config.tags);
    let has_error = false;
    console.log("Start init sql check and emit...");
    initProgram.getSourceFiles().forEach(f => {
      if (!config.exclude.test(f.fileName)) {
        delint(f);
      }
    });
    if (has_error) {
      console.error("Your code can not pass all sql test!!!");
      process.exit(1);
    }
    console.log("Init sql check and emit finished.");

    function delint(sourceFile: ts.SourceFile) {
      delintNode(sourceFile);

      function delintNode(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.TaggedTemplateExpression) {
          let n = node as ts.TaggedTemplateExpression;
          if (n.tag.getText() === config.tags.sql) {
            let query_configs = fake_expression(n);
            for (const qc of query_configs) {
              let s: string = qc.text.replace(/\?\?/gm, config.mock_value);

              const directives = parseDirectives(s);
              if (config.emit_dir) {
                const emit_directive = directives.find(d => d.directive === "emit");
                if (emit_directive) {
                  const fileName = (emit_directive.arg as string) ?? crypto.createHash("sha1").update(s).digest("hex");
                  const filePath = `${config.emit_dir}/${fileName}.sql`;
                  fs.writeFile(filePath, s + ";", err => {
                    if (err) {
                      console.error(`Error occured, when emitting file "${filePath}"`);
                    }
                  });
                }
              }

              let stdout = "" as any;
              try {
                stdout = child_process.execSync(`${config.command} ${quote([`EXPLAIN ${s}`])}`);
              } catch (error) {
                const stderr_str = error.process?.stderr?.toString("utf8");
                has_error = true;
                report(sourceFile, node, stderr_str);
                break;
              }

              if (
                (config.error_cost || config.warn_cost || config.info_cost) &&
                !directives.some(d => d.directive === "ignore-cost")
              ) {
                const stdout_str = stdout.toString("utf8");
                const match = stdout_str.match(config.cost_pattern);
                if (match) {
                  const [_, cost_str] = match;
                  const cost = Number(cost_str);
                  if (cost > config.error_cost) {
                    has_error = true;
                    report(sourceFile, node, `Error: explain cost is too high: ${cost}\n${s}`, 3);
                    break;
                  } else if (cost > config.warn_cost) {
                    report(sourceFile, node, `Warn: explain cost is at warning: ${cost}\n${s}`, 2);
                  } else if (cost > config.info_cost) {
                    report(sourceFile, node, `Info: explain cost is ok: ${cost}\n${s}`, 1);
                  }
                }
              }
            }
          }
        }

        ts.forEachChild(node, delintNode);
      }
    }
  })
  .parse(process.argv);
