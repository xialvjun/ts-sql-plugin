import { TemplateContext, TemplateLanguageService } from 'typescript-template-language-service-decorator';
import * as ts from 'typescript/lib/tsserverlibrary';
import { Index } from 'lunr'

export class SqlTemplateAutocomplete implements TemplateLanguageService {
  constructor(private db_info_search_index: Index, private db_info_index: {[id: string]: {
    schema: string;
    table: string;
    column: string;
  }}) {}

  getCompletionEntryDetails({}, {}, name): ts.CompletionEntryDetails {
    const documentation = this.db_info_search_index.search(name)
      .map(({ref}) => {
        const db_info_item = this.db_info_index[ref];
        return {
          kind: ts.ScriptElementKind.keyword,
          text: `
            schema: ${db_info_item.schema},
            table: ${db_info_item.table},
            column: ${db_info_item.column}
          `.replace(/          /gm, '    ')
        };
      });
    return {
      name,
      displayParts: [],
      kind: ts.ScriptElementKind.keyword,
      kindModifiers: 'ts-sql-plugin',
      documentation
    };
  }

  getCompletionsAtPosition(
    context: TemplateContext,
    position: ts.LineAndCharacter
  ): ts.CompletionInfo {
    const entries = new Map<string, ts.CompletionEntry>();
    const query = context.text.split(/\n/g)[position.line]
      .slice(0, position.character)
      .match(/[\s\.]+([\w]*)$/)?.[1];
    if (query) {
      this.db_info_search_index.search(`*${query}*`).forEach(({ref}) => {
        const db_info_item = this.db_info_index[ref];
        if (db_info_item.schema.match(query)) {
          entries.set(`schema|${db_info_item.schema}`, {
            name: db_info_item.schema,
            kind: ts.ScriptElementKind.keyword,
            sortText: `3 - ${db_info_item.schema}`
          });
        }
        if (db_info_item.table.match(query)) {
          entries.set(`table|${db_info_item.table}`, {
            name: db_info_item.table,
            kind: ts.ScriptElementKind.string,
            sortText: `2 - ${db_info_item.table}`
          });
        }
        if (db_info_item.column.match(query)) {
          entries.set(`column|${db_info_item.column}`, {
            name: db_info_item.column,
            kind: ts.ScriptElementKind.constElement,
            sortText: `1 - ${db_info_item.column}`
          });
        }
      });
    }
    return {
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: Array.from(entries.values())
    };
  }
}
