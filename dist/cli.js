#! /usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
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
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
exports.__esModule = true;
var fs_1 = require("fs");
var commander_1 = require("commander");
var change_case_1 = require("change-case");
var sdk_1 = require("@prisma/sdk");
var DEFAULT_FILE_LOCATION = 'schema.prisma';
var program = new commander_1.Command('prisma-case');
program
    .description("Give your schema.prisma sane naming conventions")
    .requiredOption('--file <file>', 'schema.prisma file location', DEFAULT_FILE_LOCATION)
    .option('--table-case <tableCase>', 'case convention for table names. allowable values: "pascal", "camel", "snake"', 'pascal')
    .option('--field-case <fieldCase>', 'case convention for field names. allowable values: "pascal", "camel", "snake"', 'camel')
    .option('-D, --dry-run', 'print changes to console, rather than back to file', false);
program.parse(process.argv);
run();
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var options, _a, file_contents, error_file, _b, tableCaseConvention, error_table_case, _c, fieldCaseConvention, error_field_case, _d, schema, schema_error, new_schema;
        var _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    options = program.opts();
                    if (options.dryRun) {
                        console.log('***Dry run mode***');
                    }
                    _a = __read(tryGetFileContents(options), 2), file_contents = _a[0], error_file = _a[1];
                    if (error_file) {
                        console.log("Encountered an error while trying to read provided schema.prisma file at path " + options.file);
                        console.log(error_file.message);
                        process.exit(1);
                    }
                    _b = __read(tryGetTableCaseConvention(options.tableCase), 2), tableCaseConvention = _b[0], error_table_case = _b[1];
                    if (error_table_case) {
                        console.log("Warning: encountered unsupported case convention: \"" + options.fieldCase + "\". Defaulting to \"pascal\" case.");
                        _e = __read(tryGetTableCaseConvention('pascal'), 1), tableCaseConvention = _e[0];
                    }
                    _c = __read(tryGetTableCaseConvention(options.fieldCase), 2), fieldCaseConvention = _c[0], error_field_case = _c[1];
                    if (error_field_case) {
                        console.log("Warning: encountered unsupported case convention: \"" + options.fieldCase + "\". Defaulting to \"camel\" case.");
                        _f = __read(tryGetTableCaseConvention('camel'), 1), fieldCaseConvention = _f[0];
                    }
                    _d = __read(migrateCaseConventions(file_contents, tableCaseConvention, fieldCaseConvention), 2), schema = _d[0], schema_error = _d[1];
                    if (schema_error) {
                        console.log('Encountered error while migrating case conventions');
                        console.log(schema_error);
                        process.exit(1);
                    }
                    return [4 /*yield*/, sdk_1.formatSchema({ schema: schema })];
                case 1:
                    new_schema = _g.sent();
                    if (options.dryRun) {
                        console.log('Prettify yielded the following schema:');
                        console.log(new_schema);
                        process.exit(0);
                    }
                    fs_1.writeFileSync(options.file, Buffer.from(new_schema), { encoding: 'utf8' });
                    console.log('✨ Done.');
                    return [2 /*return*/];
            }
        });
    });
}
function tryGetFileContents(options) {
    var file_path = options.file;
    try {
        var contents = String(fs_1.readFileSync(file_path));
        return [contents,];
    }
    catch (error) {
        return [, error];
    }
}
function tryGetTableCaseConvention(type) {
    switch (type) {
        case 'pascal': return [change_case_1.pascalCase,];
        case 'camel': return [change_case_1.camelCase,];
        case 'snake': return [change_case_1.snakeCase,];
        default: return [, new Error('unsupported case convention: ' + type)];
    }
}
function migrateCaseConventions(file_contents, tableCaseConvention, fieldCaseConvention) {
    var MODEL_TOKEN = 'model';
    var END_MODEL_TOKEN = '}';
    var lines = file_contents.split('\n');
    var _a = __read(getModelBounds(lines), 2), model_bounds = _a[0], model_bounds_error = _a[1];
    if (model_bounds_error) {
        return [, model_bounds_error];
    }
    var _b = __read(reshapeModels(lines), 2), new_lines = _b[0], reshape_models_error = _b[1];
    if (reshape_models_error) {
        return [, reshape_models_error];
    }
    return [new_lines.join('\n'),];
    function getModelBounds(lines) {
        var e_1, _a;
        var model_bounds = [];
        var within_model = false;
        var boundary_cursor = [];
        try {
            for (var _b = __values(lines.entries()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), index = _d[0], line = _d[1];
                if (!within_model && line.trim().startsWith(MODEL_TOKEN)) {
                    boundary_cursor.push(index);
                    within_model = true;
                }
                else if (within_model && line.trim().endsWith(END_MODEL_TOKEN)) {
                    boundary_cursor.push(index);
                    model_bounds.push(boundary_cursor);
                    boundary_cursor = [];
                    within_model = false;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (within_model) {
            return [, new Error("model starting on line " + boundary_cursor[0] + " did not end")];
        }
        return [model_bounds,];
    }
    function reshapeModels(lines) {
        var e_2, _a;
        var MODEL_DECLARATION_REGEX = /^\s*model\s+(?<model>\w+)\s*\{\s*/;
        var FIELD_DECLARATION_REGEX = /^(\s*)(?<field>\w+)(\s+)(?<type>[\w+]+)(?<complications>[\[\]\?]*)(\s+.*\s*)?/;
        var RELATION_ANNOTATION_REGEX = /(@relation\("?\w*"?,?\s*fields: \[)(?<fields>.*)(\],\s*references: \[)(?<references>.*)(\]\))/;
        var TABLE_INDEX_REGEX = /\@\@index\((?<fields>\[[\w\s,]+\])/;
        var TABLE_UNIQUE_REGEX = /\@\@unique\((?<fields>\[[\w\s,]+\])/;
        var TABLE_ID_REGEX = /\@\@id\((?<fields>\[[\w\s,]+\])/;
        var offset = 0;
        try {
            for (var _b = __values(model_bounds), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), start = _d[0], end = _d[1];
                start = start + offset;
                try {
                    var model_declaration_line = MODEL_DECLARATION_REGEX.exec(lines[start]);
                    var model_name = model_declaration_line.groups['model'];
                    if (tableCaseConvention(model_name) !== model_name) {
                        var map_model_line = "  @@map(\"" + model_name + "\")";
                        lines[start] = transformDeclarationName(lines[start], model_name, tableCaseConvention);
                        lines.splice(start + 1, 0, map_model_line);
                        offset += 1;
                    }
                }
                catch (error) {
                    return [, error];
                }
                end = end + offset;
                for (var i = start + 2; i < end; i++) {
                    var field_declaration_line = FIELD_DECLARATION_REGEX.exec(lines[i]);
                    if (field_declaration_line) {
                        var _e = __read(field_declaration_line, 7), search_term = _e[0], chunk0 = _e[1], field_name = _e[2], chunk2 = _e[3], field_type = _e[4], chunk4 = _e[5], chunk5 = _e[6];
                        field_name = fieldCaseConvention(field_name);
                        var map_field_fragment = '';
                        if (fieldCaseConvention(field_name) !== field_name && !lines[i].includes('@relation')) {
                            map_field_fragment = " @map(\"" + field_name + "\")";
                        }
                        if (!isPrimitive(field_type)) {
                            // this may have bugs...
                            field_type = tableCaseConvention(field_type);
                        }
                        lines[i] = lines[i].replace(search_term, [chunk0, field_name, chunk2, field_type, chunk4, chunk5].join(''));
                    }
                    var relation_annotation_line = RELATION_ANNOTATION_REGEX.exec(lines[i]);
                    if (relation_annotation_line) {
                        var _f = __read(relation_annotation_line, 6), search_term = _f[0], chunk0 = _f[1], fields = _f[2], chunk2 = _f[3], references = _f[4], chunk4 = _f[5];
                        var updated_fields = fields
                            .split(/,\s*/)
                            .map(fieldCaseConvention)
                            .join(', ');
                        var updated_references = references
                            .split(/,\s*/)
                            .map(fieldCaseConvention)
                            .join(', ');
                        lines[i] = lines[i].replace(search_term, [chunk0, updated_fields, chunk2, updated_references, chunk4].join(''));
                    }
                    var table_unique_declaration_line = TABLE_UNIQUE_REGEX.exec(lines[i]);
                    if (table_unique_declaration_line) {
                        var field_names = table_unique_declaration_line.groups['fields'];
                        var updated_field_names = '[' + field_names
                            .split(/,\s*/)
                            .map(fieldCaseConvention)
                            .join(', ') + ']';
                        lines[i] = lines[i].replace(field_names, updated_field_names);
                    }
                    var table_index_declaration_line = TABLE_INDEX_REGEX.exec(lines[i]);
                    if (table_index_declaration_line) {
                        var field_names = table_index_declaration_line.groups['fields'];
                        var updated_field_names = '[' + field_names
                            .split(/,\s*/)
                            .map(fieldCaseConvention)
                            .join(', ') + ']';
                        lines[i] = lines[i].replace(field_names, updated_field_names);
                    }
                    var table_id_declaration_line = TABLE_ID_REGEX.exec(lines[i]);
                    if (table_id_declaration_line) {
                        var field_names = table_id_declaration_line.groups['fields'];
                        var updated_field_names = '[' + field_names
                            .split(/,\s*/)
                            .map(fieldCaseConvention)
                            .join(', ') + ']';
                        lines[i] = lines[i].replace(field_names, updated_field_names);
                    }
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return [lines,];
    }
    function transformDeclarationName(declaration_line, declaration_name, tableCaseConvention) {
        return declaration_line.replace(declaration_name, tableCaseConvention(declaration_name));
    }
}
function isPrimitive(field_type) {
    field_type = field_type.replace('[]', '').replace('?', '').replace(/("\w+")/, '');
    return (field_type === 'String'
        || field_type === 'Boolean'
        || field_type === 'Int'
        || field_type === 'BigInt'
        || field_type === 'Float'
        || field_type === 'Decimal'
        || field_type === 'DateTime'
        || field_type === 'Json'
        || field_type === 'Bytes'
        || field_type === 'Unsupported');
}
