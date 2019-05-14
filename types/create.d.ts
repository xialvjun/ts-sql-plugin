import * as tss from 'typescript/lib/tsserverlibrary';
export interface TsSqlPluginConfig {
    command: string;
    tags: {
        sql: string;
        spreadAnd: string;
        spreadInsert: string;
        spreadUpdate: string;
    };
}
export declare function create(info: tss.server.PluginCreateInfo): tss.LanguageService;
