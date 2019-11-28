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
    '-c, --command <string>',
    'The command be run to explain the faked sql.',
    default_command,
  )
  .option(
    '-t, --tags <string>',
    'The tags you used in you ts file.',
    Object.entries(default_tags)
      .map(it => it.join('='))
      .join(','),
  );

commander.parse(process.argv);

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
  throw has_error;
}

function delint(sourceFile: ts.SourceFile) {
  delintNode(sourceFile);

  function delintNode(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.TaggedTemplateExpression) {
      let n = node as ts.TaggedTemplateExpression;
      if (n.tag.getText() === config.tags.sql) {
        try {
          let query_configs = fake_expression(n);
          query_configs.map((qc: any) => {
            let s = qc.text.replace(/\?\?/gm, 'null').replace(/'/g, "\\'");
            let buffer_rs = child_process.execSync(
              `${config.command} 'EXPLAIN ${s}'`,
            );
            // let messageText = buffer_rs.toString('utf8');
            // return null;
          });
        } catch (error) {
          has_error = true;
          report(sourceFile, n, '');
        }
      }
    }

    ts.forEachChild(node, delintNode);
  }
}
