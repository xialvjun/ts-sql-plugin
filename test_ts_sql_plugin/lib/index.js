"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var apollo_server_1 = require("apollo-server");
var pg_promise_1 = __importDefault(require("pg-promise"));
var pg_1 = require("squid/pg");
var pgp = pg_promise_1.default()("postgres://username:password@127.0.0.1:32769/username");
// The GraphQL schema
var typeDefs = apollo_server_1.gql(fs_1.default.readFileSync(path_1.default.join(__dirname, '../schema.gql'), 'utf8'));
// A map of functions which return data for the schema.
var resolvers = {
    Book: {
        author: function (root, args, ctx) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, pgp.one(pg_1.sql(templateObject_1 || (templateObject_1 = __makeTemplateObject(["select * from books where _id=", ""], ["select * from books where _id=", ""])), root._id))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        }); }
    },
    Person: {
        books: function (root, args, ctx) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(args.title_like && args.publisher)) return [3 /*break*/, 2];
                        return [4 /*yield*/, pgp.manyOrNone(pg_1.sql(templateObject_2 || (templateObject_2 = __makeTemplateObject(["select * from books where author_id=", " and title like ", " and publisher=", ""], ["select * from books where author_id=", " and title like ", " and publisher=", ""])), root._id, '%' + args.title_like + '%', args.publisher))];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        if (!(args.title_like && !args.publisher)) return [3 /*break*/, 4];
                        return [4 /*yield*/, pgp.manyOrNone(pg_1.sql(templateObject_3 || (templateObject_3 = __makeTemplateObject(["select * from books where author_id=", " and title like ", ""], ["select * from books where author_id=", " and title like ", ""])), root._id, '%' + args.title_like + '%'))];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        if (!(!args.title_like && args.publisher)) return [3 /*break*/, 6];
                        return [4 /*yield*/, pgp.manyOrNone(pg_1.sql(templateObject_4 || (templateObject_4 = __makeTemplateObject(["select * from books where author_id=", " and publisher=", ""], ["select * from books where author_id=", " and publisher=", ""])), root._id, args.publisher))];
                    case 5: return [2 /*return*/, _a.sent()];
                    case 6: return [4 /*yield*/, pgp.manyOrNone(pg_1.sql(templateObject_5 || (templateObject_5 = __makeTemplateObject(["select * from books where author_id=", ";"], ["select * from books where author_id=", ";"])), root._id))];
                    case 7: return [2 /*return*/, _a.sent()];
                }
            });
        }); }
    },
    Query: {
        books: function (root, args, ctx) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, pgp.manyOrNone(pg_1.sql(templateObject_6 || (templateObject_6 = __makeTemplateObject(["select * from books where 1=1"], ["select * from books where 1=1"]))))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        }); },
    },
};
var server = new apollo_server_1.ApolloServer({
    typeDefs: typeDefs,
    resolvers: resolvers,
});
server.listen().then(function (_a) {
    var url = _a.url;
    console.log("\uD83D\uDE80 Server ready at " + url);
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6;
// const a = {
//   "name.like": "xia"
// }
