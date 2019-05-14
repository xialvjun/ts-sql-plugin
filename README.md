# ts-sql-plugin
TypeScript Language Service Plugin for SQL especially for github:andywer/squid, a SQL tagged template strings builder.

# Usage

Install the plugin, run:

```sh
npm install ts-sql-plugin -D
npm install squid
```

Then, configure the `plugins` section in your *tsconfig.json*:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es5",
    "plugins": [
      {
        "name": "ts-sql-plugin",
        "command": "psql -c", // both command and tags have default values
        "tags": {
          "sql": "sql",
          "spreadAnd": "spreadAnd",
          "spreadInsert": "spreadInsert",
          "spreadUpdate": "spreadUpdate",
        }
      }
    ]
  }
}
```
