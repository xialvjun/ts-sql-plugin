#!/usr/bin/env node

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

import ts from "typescript";
import commander from "commander";
import chokidar from "chokidar";
import debounce from "lodash.debounce";

import { default_command, default_tags, default_cost_pattern, get_all_ts_files, report, index_of_array } from "./utils";
import { make_fake_expression } from "./make_fake_expression";
import { parseDirectives } from "./directiveParser";

const default_cost_pattern_source = default_cost_pattern.source;
const default_tags_string = Object.entries(default_tags)
  .map((it) => it.join("="))
  .join(",");

commander
  .option("-p, --project <string>", "The project path or tsconfig.json, defaults to: ./ .", "./")
  .option("-e, --exclude <regexp>", "The regexp to exclude files, defaults to: node_modules .", "node_modules")
  .option(
    "-t, --tags <string>",
    `The tags you used in you ts file, defaults to: ${default_tags_string} .`,
    default_tags_string
  )
  .option("-m, --error-cost <int>", "Throw error if explain cost exceeds treshold.")
  .option("--emit-out-dir <string>", "Path, where sqls will be emitted", "./emit-sql")
  .option("--warn-cost <int>", "Log warning if explain cost exceeds treshold.")
  .option("--info-cost <int>", "Log info if explain cost exceeds treshold.")
  .option(
    "--cost-pattern <regexp>",
    `The regexp used to extract cost from command stdout, defaults to: ${default_cost_pattern_source} .`,
    default_cost_pattern_source
  )
  .option("-w, --watch", `Watch mode of cli`, false)
  .arguments("[command...]")
  .description("Explain all your sqls in your code to test them. Eg: ts-sql-plugin -p ./my_ts_projet psql -c", {
    command: "The command to be run to explain the faked sql, like: psql.",
    args: "The arguments passed to the command, like: -c. The faked sql will be added as the last argument.",
  })
  .action((_command) => {
    if (_command.length === 0) {
      _command = default_command;
    } else {
      _command = commander.rawArgs.slice(index_of_array(commander.rawArgs, _command));
    }

    const config = commander.opts();
    config.error_cost = config.errorCost;
    config.warn_cost = config.warnCost;
    config.info_cost = config.infoCost;
    config.cost_pattern = config.costPattern;

    const exclude = new RegExp(config.exclude);
    const tags = Object.assign(
      {},
      default_tags,
      config.tags
        .split(",")
        .map((s) => s.split("="))
        .reduce((acc, [k, v]) => {
          acc[k] = v;
          return acc;
        }, {})
    );
    const cost_pattern = new RegExp(config.cost_pattern);

    const project_path = path.dirname(config.project);
    const tsconfig_path = path.join(project_path, "tsconfig.json");

    const { config: tsconfig } = ts.parseConfigFileTextToJson(
      tsconfig_path,
      fs.readFileSync(tsconfig_path, { encoding: "utf8" })
    );

    const watchHost = config.watch
      ? ts.createWatchCompilerHost(get_all_ts_files(project_path), tsconfig.compilerOptions, ts.sys)
      : null;

    const watchProgram = config.watch ? ts.createWatchProgram(watchHost) : null;

    const initProgram = config.watch
      ? watchProgram.getProgram().getProgram()
      : ts.createProgram(get_all_ts_files(project_path), tsconfig.compilerOptions);

    let fake_expression = make_fake_expression(initProgram.getTypeChecker(), tags);

    if (config.watch) {
      let changedFile = "";
      chokidar.watch(`${project_path}/**/*.{ts,tsx}`).on("all", ({}, path) => {
        changedFile = path;
      });
      const origOnWatch = watchHost.onWatchStatusChange;
      const onChangeFile = debounce(
        () => {
          const file = watchProgram.getProgram().getSourceFile(path.join(project_path, changedFile));
          if (file && !exclude.test(file.fileName)) {
            fake_expression = make_fake_expression(watchProgram.getProgram().getProgram().getTypeChecker(), tags);
            delint(file);
          }
        },
        2000
      );
      watchHost.onWatchStatusChange = (...args) => {
        origOnWatch.apply(watchHost, args);
        onChangeFile();
      };
    }

    let has_error = false;

    initProgram.getSourceFiles().forEach((f) => {
      if (!exclude.test(f.fileName)) {
        delint(f);
      }
    });

    if (has_error) {
      console.error("Your code can not pass all sql test!!!");
      process.exit(1);
    }

    function delint(sourceFile: ts.SourceFile) {
      delintNode(sourceFile);

      function delintNode(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.TaggedTemplateExpression) {
          let n = node as ts.TaggedTemplateExpression;
          if (n.tag.getText() === tags.sql) {
            let query_configs = fake_expression(n);
            for (const qc of query_configs) {
              let s: string = qc.text.replace(/\?\?/gm, "null");
              const directives = parseDirectives(s);
              const emitDir = directives.find((d) => d.directive === "emit");
              if (emitDir) {
                const fileName = (emitDir.arg as string) ?? crypto.createHash("sha1").update(s).digest("hex");
                const filePath = `${config.emitOutDir}/${fileName}.sql`;
                fs.writeFile(filePath, s, (err) => {
                  if (err) {
                    console.error(`Error occured, when emitting file "${filePath}"`);
                  }
                });
              }
              let p = child_process.spawnSync(_command[0], _command.slice(1).concat(`EXPLAIN ${s}`));
              if (p.status) {
                const stderr_str = (p.stderr.toString as any)("utf8");
                has_error = true;
                report(sourceFile, node, stderr_str);
                break;
              }
              if (
                (config.error_cost || config.warn_cost || config.info_cost) &&
                !directives.some((d) => d.directive === "ignore-cost")
              ) {
                const stdout_str = (p.stdout.toString as any)("utf8");
                const match = stdout_str.match(cost_pattern);
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
  });

commander.parse(process.argv);
