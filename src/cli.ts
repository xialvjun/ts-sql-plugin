#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

import ts from 'typescript';
import commander from 'commander';

import {
  default_command,
  default_tags,
  get_all_ts_files,
  report,
  index_of_array,
} from './utils';
import { make_fake_expression } from './make_fake_expression';

commander
  .option('-p, --project <string>', 'The project path or tsconfig.json.', './')
  .option(
    '-e, --exclude <regexp>',
    'The regexp to exclude files',
    'node_modules',
  )
  .option(
    '-t, --tags <string>',
    'The tags you used in you ts file.',
    Object.entries(default_tags)
      .map(it => it.join('='))
      .join(','),
  )
  .option(
    '-m, --max-cost <int>',
    'throw error if explain cost transgress this ',
    null,
  )
  .arguments('[command...]')
  .description(
    'Explain all your sqls in your code to test them. Eg: ts-sql-plugin -p ./my_ts_projet psql -c',
    {
      command: 'The command to be run to explain the faked sql, like: psql.',
      args:
        'The arguments passed to the command, like: -c. The faked sql will be added as the last argument.',
    },
  )
  .action((_command) => {
    if (_command.length === 0) {
      _command = default_command;
    } else {
      _command = commander.rawArgs.slice(
        index_of_array(commander.rawArgs, _command),
      );
    }

    const config = commander.opts();
    config.tags = Object.assign(
      {},
      default_tags,
      config.tags
        .split(',')
        .map(s => s.split('='))
        .reduce((acc, [k, v]) => {
          acc[k] = v;
          return acc;
        }, {}),
    );
    const exclude = new RegExp(config.exclude);

    const project_path = path.dirname(config.project);
    const tsconfig_path = path.join(project_path, 'tsconfig.json');

    const { config: tsconfig } = ts.parseConfigFileTextToJson(
      tsconfig_path,
      fs.readFileSync(tsconfig_path, { encoding: 'utf8' }),
    );

    const program = ts.createProgram(get_all_ts_files(project_path), tsconfig);

    const fake_expression = make_fake_expression(
      program.getTypeChecker(),
      config.tags,
    );

    let has_error = false;

    program.getSourceFiles().forEach(f => {
      if (!exclude.test(f.fileName)) {
        delint(f);
      }
    });

    if (has_error) {
      throw new Error('Your code can not pass all sql test!!!');
    }

    function delint(sourceFile: ts.SourceFile) {
      delintNode(sourceFile);

      function delintNode(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.TaggedTemplateExpression) {
          let n = node as ts.TaggedTemplateExpression;
          if (n.tag.getText() === config.tags.sql) {
            let query_configs = fake_expression(n);
            for (const qc of query_configs) {
              let s = qc.text.replace(/\?\?/gm, 'null');
              let p = child_process.spawnSync(
                _command[0],
                _command.slice(1).concat(`EXPLAIN ${s}`),
              );
              if(config.maxCost){
                const [{}, max] = (p.stdout.toString as any)('utf8').match(/\(cost=.+\.\.([\d]+\.[\d]+)/);
                if(max && Number(max) && Number(max) > config.maxCost){
                  has_error = true;
                  report(sourceFile, node, `explain cost is too high: ${max}`);
                  break;
                }
              }

              if (p.status) {
                has_error = true;
                report(sourceFile, node, (p.stderr.toString as any)('utf8'));
                break;
              }
            }
            // query_configs.map((qc: any) => {
            //   let s = qc.text.replace(/\?\?/gm, 'null');
            //   let p = child_process.spawnSync(
            //     _command,
            //     _args.concat(`EXPLAIN ${s}`),
            //   );
            //   if (p.status) {
            //     has_error = true;
            //     report(sourceFile, node, (p.stderr.toString as any)('utf8'));
            //   }
            // });
          }
        }

        ts.forEachChild(node, delintNode);
      }
    }
  });

commander.parse(process.argv);
