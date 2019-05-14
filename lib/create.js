"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var tss = __importStar(require("typescript/lib/tsserverlibrary")); // used as type only
var child_process = __importStar(require("child_process"));
var pg_1 = require("squid/pg");
function findAllNodes(sourceFile, cond) {
    var result = [];
    function find(node) {
        if (cond(node)) {
            result.push(node);
            return;
        }
        else {
            tss.forEachChild(node, find);
        }
    }
    find(sourceFile);
    return result;
}
var default_command = 'psql -c';
var default_tags = {
    sql: 'sql',
    spreadAnd: 'spreadAnd',
    spreadInsert: 'spreadInsert',
    spreadUpdate: 'spreadUpdate',
};
function create(info) {
    var _a;
    var logger = function (msg) { return info.project.projectService.logger.info("[ts-pgsql-plugin] " + msg); };
    logger('config: ' + JSON.stringify(info.config));
    var config = __assign({ command: default_command }, info.config, { tags: __assign({}, default_tags, (info.config || {}).tags) });
    var spread = (_a = {},
        _a[config.tags.spreadAnd] = pg_1.spreadAnd,
        _a[config.tags.spreadInsert] = pg_1.spreadInsert,
        _a[config.tags.spreadUpdate] = pg_1.spreadUpdate,
        _a);
    return new Proxy(info.languageService, {
        get: function (target, p, receiver) {
            if (p === 'getSemanticDiagnostics') {
                return function getSemanticDiagnostics(fileName) {
                    var origin_diagnostics = target.getSemanticDiagnostics(fileName);
                    var type_checker = info.languageService.getProgram().getTypeChecker();
                    var source_file = info.languageService.getProgram().getSourceFile(fileName);
                    var nodes = findAllNodes(source_file, function (n) { return n.kind === tss.SyntaxKind.TaggedTemplateExpression && n.tag.getText() === config.tags.sql; });
                    var explain_rss = nodes.map(function (n) {
                        var texts = [];
                        var values = [];
                        if (n.template.kind === tss.SyntaxKind.TemplateExpression) {
                            texts.push(n.template.head.text);
                            n.template.templateSpans.forEach(function (span) {
                                values.push(null);
                                if (tss.isCallExpression(span.expression)) {
                                    var fn = spread[span.expression.getFirstToken().getText()];
                                    if (!!fn) {
                                        var t = type_checker.getTypeAtLocation(span.expression.arguments[0]);
                                        var fake = t.getProperties().reduce(function (acc, cv) {
                                            var _a;
                                            return Object.assign(acc, (_a = {}, _a[cv.getName()] = null, _a));
                                        }, {});
                                        values.pop();
                                        values.push(fn(fake));
                                    }
                                }
                                texts.push(span.literal.text);
                            });
                        }
                        else if (n.template.kind === tss.SyntaxKind.NoSubstitutionTemplateLiteral) {
                            texts.push(n.template.text);
                        }
                        var diagnostic = {
                            file: source_file,
                            start: n.getStart(),
                            length: n.getEnd() - n.getStart(),
                            source: 'pgsql',
                            messageText: '',
                            category: tss.DiagnosticCategory.Message,
                            code: 0,
                        };
                        try {
                            var query_config = pg_1.sql.apply(void 0, [texts].concat(values));
                            var s = query_config.text.replace(/\$\d+/g, 'null').replace(/'/g, "'");
                            var buffer_rs = child_process.execSync(config.command + " 'EXPLAIN " + s + "'");
                            var messageText = buffer_rs.toString('utf8');
                            return null;
                        }
                        catch (error) {
                            diagnostic.messageText = error.message;
                            diagnostic.category = tss.DiagnosticCategory.Error;
                            diagnostic.code = 1;
                            return diagnostic;
                        }
                    });
                    return origin_diagnostics.concat(explain_rss.filter(function (v) { return !!v; }));
                };
            }
            return target[p];
        },
    });
}
exports.create = create;
//# sourceMappingURL=create.js.map