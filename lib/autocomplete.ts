import { TemplateContext, TemplateLanguageService } from "typescript-template-language-service-decorator";
import tss from "typescript/lib/tsserverlibrary";
import { Index } from "lunr";

import { SchemaInfo } from "./utils";

export class SqlTemplateAutocomplete implements TemplateLanguageService {
  constructor(private db_info_search_index: Index, private db_info: SchemaInfo) {}

  getCompletionEntryDetails({}, {}, name: string): tss.CompletionEntryDetails {
    const documentation = this.db_info_search_index.search(name).map(({ ref }) => {
      const db_info_item = this.db_info[ref as any];
      return {
        kind: tss.ScriptElementKind.keyword,
        text: `
            schema: ${db_info_item.schema},
            table: ${db_info_item.table},
            column: ${db_info_item.column}
          `.replace(/          /gm, "    "),
      };
    });
    return {
      name,
      displayParts: [],
      kind: tss.ScriptElementKind.keyword,
      kindModifiers: "ts-sql-plugin",
      documentation,
    };
  }

  getCompletionsAtPosition(context: TemplateContext, position: tss.LineAndCharacter): tss.CompletionInfo {
    const entries = new Map<string, tss.CompletionEntry>();
    const query = context.text
      .split(/\n/g)
      [position.line].slice(0, position.character)
      .match(/[\s\.]+([\w]*)$/)?.[1];
    if (query) {
      this.db_info_search_index.search(`*${query}*`).forEach(({ ref }) => {
        const db_info_item = this.db_info[ref as any];
        if (db_info_item.schema.match(query)) {
          entries.set(`schema|${db_info_item.schema}`, {
            name: db_info_item.schema,
            kind: tss.ScriptElementKind.keyword,
            sortText: `3 - ${db_info_item.schema}`,
          });
        }
        if (db_info_item.table.match(query)) {
          entries.set(`table|${db_info_item.table}`, {
            name: db_info_item.table,
            kind: tss.ScriptElementKind.string,
            sortText: `2 - ${db_info_item.table}`,
          });
        }
        if (db_info_item.column.match(query)) {
          entries.set(`column|${db_info_item.column}`, {
            name: db_info_item.column,
            kind: tss.ScriptElementKind.constElement,
            sortText: `1 - ${db_info_item.column}`,
          });
        }
      });
    }
    return {
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: Array.from(entries.values()),
    };
  }
}
