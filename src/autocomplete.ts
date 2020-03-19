import { TemplateContext, TemplateLanguageService } from 'typescript-template-language-service-decorator';
import * as ts from 'typescript/lib/tsserverlibrary';

export class SqlTemplateAutocomplete implements TemplateLanguageService {
  constructor(private db_info: {schema: string; table: string; column: string}[]) {}

  getCompletionEntryDetails({}, {}, name): ts.CompletionEntryDetails {
    const documentation = this.db_info
      .filter(info =>
        !!(info.schema === name || info.table === name || info.column === name)
      )
      .map(info => ({
        kind: ts.ScriptElementKind.keyword,
        text: `
          schema: ${info.schema},
          table: ${info.table},
          column: ${info.column}
        `.replace(/          /gm, '    ')
      }));
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
      for (const info of this.db_info) {
        if (info.schema.match(query)) {
          entries.set(`schema|${info.schema}`, {
            name: info.schema,
            kind: ts.ScriptElementKind.keyword,
            sortText: `3 - ${info.schema}`
          })
        }
        if (info.table.match(query)) {
          entries.set(`table|${info.table}`, {
            name: info.table,
            kind: ts.ScriptElementKind.string,
            sortText: `2 - ${info.table}`
          })
        }
        if (info.column.match(query)) {
          entries.set(`column|${info.column}`, {
            name: info.column,
            kind: ts.ScriptElementKind.constElement,
            sortText: `1 - ${info.column}`
          })
        }
      }
    }
    return {
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: Array.from(entries.values())
    };
  }
}
