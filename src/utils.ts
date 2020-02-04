import * as fs from 'fs';
import * as path from 'path';

import ts from 'typescript';

import { Tags } from './make_fake_expression';

export const is_array = (obj: any) =>
  Object.prototype.toString.call(obj) === '[object Array]';

export const deep_flatten = (arr: any[]) => {
  let new_arr = [];
  new_arr = arr.reduce((acc, cv) => acc.concat(cv), []);
  while (new_arr.length !== arr.length) {
    arr = new_arr;
    new_arr = arr.reduce((acc, cv) => acc.concat(cv), []);
  }
  return new_arr;
};

export const find_all_nodes = (
  sourceFile: ts.SourceFile,
  cond: (n: ts.Node) => boolean,
) => {
  const result: ts.Node[] = [];
  function find(node: ts.Node) {
    if (cond(node)) {
      result.push(node);
      return;
    } else {
      ts.forEachChild(node, find);
    }
  }
  find(sourceFile);
  return result;
};

export const default_command = ['psql', '-c'] as const;

export const default_tags: Tags = {
  sql: 'sql',
  and: 'and',
  or: 'or',
  ins: 'ins',
  upd: 'upd',
  raw: 'raw',
  cond: 'cond',
  mock: 'mock'
};

export const default_cost_pattern = /\(cost=\d+\.?\d*\.\.(\d+\.?\d*)/;

export const get_all_ts_files = (dirpath: string) => {
  let ts_files: string[] = [];
  const paths = fs.readdirSync(dirpath).map(it => path.join(dirpath, it));
  const path_stats = paths.map(it => [it, fs.statSync(it)] as const);
  const exts = ['.ts', '.tsx'];
  const ts_folders = path_stats.filter(
    ([p, s]) =>
      (s.isDirectory() && path.basename(p) !== 'node_modules') ||
      (s.isFile() && exts.indexOf(path.extname(p)) > -1),
  );
  ts_folders.forEach(([p, s]) => {
    if (s.isFile()) {
      ts_files.push(p);
    }
  });
  ts_folders.forEach(([p, s]) => {
    if (s.isDirectory()) {
      ts_files = ts_files.concat(get_all_ts_files(p));
    }
  });
  return ts_files;
};

export function report(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  message: string,
  level: 1 | 2 | 3 = 3,
) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(),
  );
  console[['info', 'warn', 'error'][level - 1]](
    `${sourceFile.fileName} (${line + 1},${character + 1}): ${message}\n\n`,
  );
}

export function index_of_array(parent: any[], child: any[]) {
  I: for (let i = 0; i < parent.length; i++) {
    J: for (let j = 0; j < child.length; j++) {
      if (parent[i + j] !== child[j]) {
        continue I;
      }
    }
    return i;
  }
  return -1;
}
