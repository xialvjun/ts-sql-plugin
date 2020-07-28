#!/usr/bin/env node

import crypto from "crypto";
import fs from "fs";
import path from "path";
import child_process from "child_process";

import ts from "typescript";
import { program } from "commander";
import shq from "shell-quote";

import {
  default_mock,
  default_cost_pattern,
  default_tags,
  default_command,
  merge_defaults,
  get_all_ts_files,
  report,
  TsSqlPluginConfig,
} from "./lib/utils";
import { make_fake_expression } from "./lib/make_fake_expression";
import { parseDirectives } from "./lib/directiveParser";

program
  .option("-w, --watch", `watch mode of cli`)
  .option("-p, --project <string>", "ts project path where tsconfig.json is in", "./")
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
    let cli_config: any = program.opts();
    if (typeof cli_config.command !== "string") {
      cli_config.command = undefined;
    }
    cli_config.exclude = new RegExp(cli_config.exclude);

    const ts_config_path = ts.findConfigFile(cli_config.project, ts.sys.fileExists, "tsconfig.json");
    if (!ts_config_path) {
      throw new Error("Could not find a valid 'tsconfig.json'.");
    }
    const { config: ts_config } = ts.parseConfigFileTextToJson(
      ts_config_path,
      fs.readFileSync(ts_config_path, { encoding: "utf8" }),
    );
    let plugin_config: TsSqlPluginConfig = (ts_config.compilerOptions.plugins as any[])?.find(
      it => it.name === "ts-sql-plugin",
    );
    plugin_config = merge_defaults(plugin_config, cli_config);
    const cost_pattern = new RegExp(plugin_config.cost_pattern!);

    if (cli_config.watch) {
      const watchHost = ts.createWatchCompilerHost(ts_config_path, undefined, ts.sys);
      const watchProgram = ts.createWatchProgram(watchHost);
      const onChangeFile = (fileName: string) => {
        const file = watchProgram.getProgram().getSourceFile(fileName);
        if (file) {
          fake_expression = make_fake_expression(
            watchProgram.getProgram().getProgram().getTypeChecker(),
            plugin_config.tags,
          );
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
        .filter(it => !cli_config.exclude.test(it.fileName));
      source_files.forEach(watchFile);
      source_files.forEach(it => onChangeFile(it.fileName));
      return;
    }

    const initProgram = ts.createProgram(get_all_ts_files(path.dirname(ts_config_path)), ts_config.compilerOptions);
    let fake_expression = make_fake_expression(initProgram.getTypeChecker(), plugin_config.tags);
    let has_error = false;
    console.log("-- Start init sql check and emit...");
    initProgram.getSourceFiles().forEach(f => {
      if (!cli_config.exclude.test(f.fileName)) {
        delint(f);
      }
    });
    if (has_error) {
      console.log("\n\n-- Your code can not pass all sql test!!!\n");
      process.exit(1);
    }
    console.log("\n\n-- Init sql check and emit finished.\n");

    function delint(sourceFile: ts.SourceFile) {
      delintNode(sourceFile);

      function delintNode(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.TaggedTemplateExpression) {
          let n = node as ts.TaggedTemplateExpression;
          if (n.tag.getText() === plugin_config.tags.sql) {
            let query_configs = fake_expression(n);
            for (const qc of query_configs) {
              let s: string = qc.text.replace(/\?\?/gm, plugin_config.mock);

              const directives = parseDirectives(s);
              if (cli_config.emit_dir) {
                const emit_directive = directives.find(d => d.directive === "emit");
                if (emit_directive) {
                  const fileName = (emit_directive.arg as string) ?? crypto.createHash("sha1").update(s).digest("hex");
                  const filePath = `${cli_config.emit_dir}/${fileName}.sql`;
                  try {
                    fs.writeFileSync(filePath, s + ";");
                  } catch(err) {
                    console.log(`-- Emit Error occured, when emitting file "${filePath}"`);
                  }
                }
              }

              console.log(`\n\n-- EXPLAIN\n${s};`);
              let stdout = "";
              // try {
              //   stdout = child_process.execSync(`${plugin_config.command} ${quote([`EXPLAIN ${s}`])}`, { encoding: 'utf8', windowsHide: true });
              // } catch (error) {
              //   has_error = true;
              //   report(sourceFile, node, error.stderr);
              //   break;
              // }
              const [_command, ..._command_args] = (shq
                .parse(plugin_config.command)
                .concat("EXPLAIN " + s) as any) as string[];
              const p = child_process.spawnSync(_command, _command_args, { encoding: "utf8" });
              stdout = p.stdout;
              if (p.status) {
                has_error = true;
                report(sourceFile, node, p.stderr);
                break;
              }

              if (
                (plugin_config.error_cost || plugin_config.warn_cost || plugin_config.info_cost) &&
                !directives.some(d => d.directive === "ignore-cost")
              ) {
                const match = stdout.match(cost_pattern);
                if (match) {
                  const [_, cost_str] = match;
                  const cost = Number(cost_str);
                  if (cost > plugin_config.error_cost!) {
                    has_error = true;
                    report(sourceFile, node, `Error: explain cost is too high: ${cost}\n${s}`, 2);
                    break;
                  } else if (cost > plugin_config.warn_cost!) {
                    report(sourceFile, node, `Warn: explain cost is at warning: ${cost}\n${s}`, 2);
                  } else if (cost > plugin_config.info_cost!) {
                    report(sourceFile, node, `Info: explain cost is ok: ${cost}\n${s}`, 1);
                  }
                } else {
                  has_error = true;
                  report(
                    sourceFile,
                    node,
                    `Error: can not extract cost with cost_pattern: ${cost_pattern.source}\n${stdout}\n${s}`,
                    2,
                  );
                  break;
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
