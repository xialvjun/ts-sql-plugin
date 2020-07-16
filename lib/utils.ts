import * as fs from "fs";
import * as path from "path";

import ts from "typescript";
import { quote } from "shell-quote";

export const is_array = (obj: any) => Object.prototype.toString.call(obj) === "[object Array]";

export const deep_flatten = (arr: any[]) => {
  let new_arr = [];
  new_arr = arr.reduce((acc, cv) => acc.concat(cv), []);
  while (new_arr.length !== arr.length) {
    arr = new_arr;
    new_arr = arr.reduce((acc, cv) => acc.concat(cv), []);
  }
  return new_arr;
};

export const find_all_nodes = (sourceFile: ts.SourceFile, cond: (n: ts.Node) => boolean) => {
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

export const get_all_ts_files = (dirpath: string) => {
  let ts_files: string[] = [];
  const paths = fs.readdirSync(dirpath).map(it => path.join(dirpath, it));
  const path_stats = paths.map(it => [it, fs.statSync(it)] as const);
  const exts = [".ts", ".tsx"];
  const ts_folders = path_stats.filter(
    ([p, s]) =>
      (s.isDirectory() && path.basename(p) !== "node_modules") || (s.isFile() && exts.indexOf(path.extname(p)) > -1),
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

export function report(sourceFile: ts.SourceFile, node: ts.Node, message: string, level: 1 | 2 | 3 = 3) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  console[(["", "info", "warn", "error"] as const)[level]](
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

export interface Tags {
  // template string
  sql: string;
  raw: string;
  cond: string;
  // call expression
  and: string;
  or: string;
  ins: string;
  upd: string;
  mock: string;
}

export interface TsSqlPluginConfig {
  mock: string;
  error_cost?: number;
  warn_cost?: number;
  info_cost?: number;
  cost_pattern?: string;
  tags: Tags;
  command: string;
  schema_command?: string;
}

export const default_mock = "0";
export const default_cost_pattern = /\(cost=\d+\.?\d*\.\.(\d+\.?\d*)/;
export const default_tags: Tags = {
  sql: "sql",
  raw: "raw",
  cond: "cond",
  and: "and",
  or: "or",
  ins: "ins",
  upd: "upd",
  mock: "mock",
};
export const default_command = `psql -c`;

export const merge_defaults = (config?: TsSqlPluginConfig) => {
  config = {
    mock: default_mock,
    cost_pattern: default_cost_pattern.source,
    command: default_command,
    schema_command: "pg",
    ...config,
    tags: { ...default_tags, ...config?.tags },
  } as TsSqlPluginConfig;
  if (config.schema_command === "pg") {
    config.schema_command = `${config.command} ${quote([
      `copy (select table_schema, table_name, column_name from information_schema.columns WHERE table_schema=CURRENT_SCHEMA()) to stdout delimiter ','`,
    ])}`;
  }
  if (config.schema_command === "mysql") {
    config.schema_command = `${config.command} ${quote([
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME from information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()`,
    ])}`;
  }
  return config;
};

export type SchemaInfo = {
  schema: string;
  table: string;
  column: string;
  id: number
}[];
