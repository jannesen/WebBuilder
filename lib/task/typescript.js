"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $path = require("path");
const $lib = require("../lib/lib.js");
const $util = require("../lib/util.js");
const taskName = "typescript";
async function runAsync(build, config) {
    const cur_state = build.getState(taskName);
    const new_state = [];
    for (let i = 0; i < config.length; ++i) {
        const config_item = config[i];
        const cur_state_item = (i < cur_state.length) ? cur_state[i] : undefined;
        const base_src = (typeof config_item.base_src === 'string') ? build.resolvePath(build.src_path, config_item.base_src) : build.src_path;
        const dst = build.dst(config_item);
        const tsconfig = getConfig(base_src, config_item.tsconfig, "tsconfig.json");
        const eslint = build.release ? getConfig(base_src, config_item.eslint, ".eslintrc.json") : undefined;
        const declaration = (tsconfig instanceof Object && tsconfig.compilerOptions instanceof Object && tsconfig.compilerOptions.declaration) ||
            (config_item.options instanceof Object && config_item.options.declaration) ||
            false;
        const frebuild = !(cur_state_item && $lib.compare_recursive(cur_state_item.tsconfig, tsconfig)
            && $lib.compare_recursive(cur_state_item.eslint, eslint)
            && $lib.compare_recursive(cur_state_item.options, config_item.options));
        let buildcfg;
        let fbuild = false;
        if (dst.endsWith("/")) {
            const smap = new Map();
            if (cur_state_item && cur_state_item.type === 'module') {
                for (const s of cur_state_item.sources) {
                    smap.set(s.src, s.references);
                }
            }
            buildcfg = {
                type: 'module',
                base_src: base_src,
                sources: build.src(base_src, config_item).map((file) => {
                    const rtn = {
                        src: file.srcpath,
                        dst: !file.targetname.endsWith(".d.ts") ? $util.rename_extension(dst + file.targetname, ".js") : undefined,
                        references: smap.get(file.srcpath),
                    };
                    if (rtn.dst) {
                        if (frebuild || !rtn.references) {
                            rtn._build = true;
                            fbuild = true;
                        }
                        if (!rtn._build) {
                            if (!$util.isUpdateToDate(rtn.dst, rtn.src, rtn.references, (typeof tsconfig === "string" ? tsconfig : undefined))) {
                                rtn._build = true;
                                fbuild = true;
                            }
                        }
                        build.define_dstfile(rtn.dst, declaration ? $util.rename_extension(dst + file.targetname, ".d.ts") : undefined, build.sourcemap ? rtn.dst + ".map" : undefined);
                    }
                    else {
                        rtn._build = true;
                    }
                    return rtn;
                }),
                tsconfig,
                eslint,
                options: config_item.options
            };
            buildcfg.sources.sort((s1, s2) => {
                if (typeof s1.dst === 'string' && typeof s2.dst === 'string') {
                    return s1.dst < s2.dst ? -1 : s1.dst > s2.dst ? 1 : 0;
                }
                if (typeof s1.dst !== 'string' && typeof s2.dst === 'string') {
                    return -1;
                }
                if (typeof s1.dst === 'string' && typeof s2.dst !== 'string') {
                    return 1;
                }
                return s1.src < s2.src ? -1 : s1.src > s2.src ? 1 : 0;
            });
        }
        else {
            buildcfg = {
                type: 'single',
                base_src: base_src,
                sources: build.src(base_src, config_item).map((file) => file.srcpath),
                references: (cur_state_item && cur_state_item.type === 'single') ? cur_state_item.references : undefined,
                outfile: dst,
                tsconfig,
                eslint,
                options: config_item.options
            };
            buildcfg.sources.sort((s1, s2) => (s1 < s2 ? -1 : s1 > s2 ? 1 : 0));
            if (buildcfg.sources.length > 0) {
                if (frebuild || !buildcfg.references) {
                    fbuild = true;
                }
                if (!fbuild) {
                    if (!$util.isUpdateToDate(dst, buildcfg.references, (typeof tsconfig === "string" ? tsconfig : undefined))) {
                        fbuild = true;
                    }
                }
                build.define_dstfile(dst);
            }
        }
        if (fbuild) {
            if (await tsbuildrun(build, buildcfg) !== 0) {
                return;
            }
            if (eslint) {
                if (await eslintrun(build, buildcfg) !== 0) {
                    return;
                }
            }
        }
        if (buildcfg.type === 'module') {
            for (const s of buildcfg.sources) {
                delete s._build;
            }
        }
        new_state[i] = buildcfg;
    }
    build.setState(taskName, new_state);
}
exports.runAsync = runAsync;
async function tsbuildrun(build, buildcfg) {
    const ts = require('typescript/lib/typescript');
    const diagnostics = [];
    const compileoptions = ts.getDefaultCompilerOptions();
    if (buildcfg.tsconfig) {
        if (buildcfg.tsconfig instanceof Object) {
            buildcfg.tsconfig.compilerOptions.baseUrl = ".";
            await $util.writeTextFileAsync(buildcfg.base_src + "/tsconfig.json", JSON.stringify(buildcfg.tsconfig, null, 4), true);
        }
        loadTSConfig(buildcfg.tsconfig);
    }
    if (diagnostics.length === 0) {
        setOptions(buildcfg.options);
    }
    if (diagnostics.length === 0) {
        if (buildcfg.type === 'single') {
            await transpileSingle(buildcfg);
        }
        if (buildcfg.type === 'module') {
            await transpileModule(buildcfg);
        }
    }
    return logDiagnostics();
    function loadTSConfig(tsconfig) {
        if (typeof tsconfig === "string") {
            const config = readConfig(tsconfig);
            const parse_result = ts.convertCompilerOptionsFromJson(config.compilerOptions, $path.dirname(tsconfig));
            if (addDiagnostics(parse_result.errors)) {
                return;
            }
            Object.assign(compileoptions, parse_result.options);
        }
        else if (tsconfig instanceof Object) {
            const parse_result = ts.convertCompilerOptionsFromJson(tsconfig.compilerOptions, buildcfg.base_src);
            if (addDiagnostics(parse_result.errors)) {
                return;
            }
            Object.assign(compileoptions, parse_result.options);
        }
    }
    function setOptions(options) {
        if (options) {
            const result = ts.convertCompilerOptionsFromJson(options, build.src_path);
            if (addDiagnostics(result.errors)) {
                return;
            }
            Object.assign(compileoptions, result.options);
        }
        compileoptions.noEmit = false;
        compileoptions.noEmitOnError = false;
        compileoptions.suppressOutputPathCheck = true;
        compileoptions.out = undefined;
        compileoptions.outDir = undefined;
        if (build.sourcemap) {
            compileoptions.sourceMap = true;
            compileoptions.inlineSources = build.sourcemap_inlinesrc;
            compileoptions.sourceRoot = "/";
        }
        compileoptions.newLine = ts.NewLineKind.LineFeed;
        if (build.release) {
            compileoptions.removeComments = true;
        }
    }
    async function transpileSingle(buildcfg) {
        build.logBuildFile(taskName, buildcfg.outfile);
        compileoptions.outFile = buildcfg.outfile;
        const program = ts.createProgram(buildcfg.sources, compileoptions);
        if (addDiagnostics(ts.getPreEmitDiagnostics(program)) || !program) {
            return;
        }
        buildcfg.references = program.getSourceFiles().map((s) => s.fileName).sort().filter((f) => buildcfg.sources.findIndex((i) => (i === f)) < 0);
        try {
            await emitFileAsync(program, undefined, buildcfg.outfile);
        }
        catch (e) {
            build.logError(buildcfg.outfile + ": " + e.message);
        }
    }
    async function transpileModule(buildcfg) {
        for (const s of buildcfg.sources) {
            if (s._build && s.dst) {
                build.logBuildFile(taskName, s.dst);
            }
        }
        const program = ts.createProgram(buildcfg.sources.map((s) => s.src), compileoptions);
        if (!program) {
            return;
        }
        if (addDiagnostics(ts.getPreEmitDiagnostics(program))) {
            return;
        }
        const sourceMap = createSourceMap(program);
        for (const source of buildcfg.sources) {
            try {
                const sf = sourceMap.get(program.getCanonicalFileName(source.src));
                if (!sf) {
                    throw new Error("Can't find file in sourceFiles");
                }
                source.references = getDependencies(program, sourceMap, sf.dependencies);
                if (source._build && source.dst && (build.lint || build.release)) {
                    extraChecks(program, sf.sourceFile);
                }
            }
            catch (e) {
                build.logError(source.dst + ": " + e.message);
            }
        }
        if (diagnostics.length === 0) {
            for (const source of buildcfg.sources) {
                try {
                    if (source._build && source.dst) {
                        await emitFileAsync(program, sourceMap.get(program.getCanonicalFileName(source.src)).sourceFile, source.dst);
                    }
                }
                catch (e) {
                    build.logError(source.dst + ": " + e.message);
                }
            }
        }
    }
    function extraChecks(program, sourceFile) {
        const templateInterfacePath = getExportInterface(sourceFile);
        if (templateInterfacePath) {
            try {
                const templateFile = program.getSourceFile(templateInterfacePath);
                if (!templateFile) {
                    throw new Error("Can't find '" + templateInterfacePath + "' in program files.");
                }
                checkExportInterface(program, templateFile, sourceFile);
            }
            catch (e) {
                addError(sourceFile, e.message);
            }
        }
    }
    function checkExportInterface(program, templateFile, sourceFile) {
        const tc = program.getTypeChecker();
        const templateSymbol = tc.getSymbolAtLocation(templateFile);
        const sourceSymbol = tc.getSymbolAtLocation(sourceFile);
        if (!sourceSymbol) {
            throw new Error("File is empty");
        }
        if (!templateSymbol) {
            throw new Error("Template file is empty");
        }
        const templateExports = tc.getExportsAndPropertiesOfModule(templateSymbol);
        const sourceExports = tc.getExportsAndPropertiesOfModule(sourceSymbol);
        templateExports.forEach((templateSymbol) => {
            const sourceSymbol = sourceExports.find((s) => s.escapedName === templateSymbol.escapedName);
            if (sourceSymbol) {
                if (sourceSymbol.flags === templateSymbol.flags) {
                    const templateType = tc.getTypeOfSymbolAtLocation(templateSymbol, templateFile);
                    const sourceType = tc.getTypeOfSymbolAtLocation(sourceSymbol, sourceFile);
                    if (!tc.isTypeIdenticalTo(sourceType, templateType)) {
                        const templateTypeFlags = simpleType(templateType);
                        const sourceTypeFlags = simpleType(sourceType);
                        if (!(templateTypeFlags && templateTypeFlags === sourceTypeFlags)) {
                            addError(sourceFile, templateSymbol.name + " export type '" + tc.typeToString(sourceType) + "' expect '" + tc.typeToString(templateType) + "'", sourceSymbol);
                        }
                    }
                }
                else {
                    addError(sourceFile, templateSymbol.name + " export " + symbolFlagsToString(sourceSymbol) + " expect " + symbolFlagsToString(templateSymbol) + "'", sourceSymbol);
                }
            }
            else {
                addError(sourceFile, "Missing export for " + templateSymbol.name);
            }
        });
        sourceExports.forEach((sourceSymbol) => {
            if (!templateExports.find((s) => s.escapedName === sourceSymbol.escapedName)) {
                addError(sourceFile, "Exported symbol " + sourceSymbol.name + " not defined in export-interface", sourceSymbol);
            }
        });
        function simpleType(type) {
            if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.StructuredType | ts.TypeFlags.TypeParameter | ts.TypeFlags.Index | ts.TypeFlags.IndexedAccess)) {
                return 0;
            }
            if (type.flags & ts.TypeFlags.StringLike)
                return ts.TypeFlags.String;
            if (type.flags & ts.TypeFlags.NumberLike)
                return ts.TypeFlags.Number;
            if (type.flags & ts.TypeFlags.BooleanLike)
                return ts.TypeFlags.Boolean;
        }
        function symbolFlagsToString(symbol) {
            const flags = symbol.flags;
            let rtn = "";
            let bit = 1;
            while (bit & 0xffffffff) {
                if (flags & bit) {
                    rtn += (rtn.length > 0 ? "," : "") + ts.SymbolFlags["" + bit] || "0x" + bit.toString(16);
                }
                bit = bit << 1;
            }
            return rtn;
        }
    }
    async function emitFileAsync(program, sourceFile, dstfn) {
        let jsdata;
        let dtsdata;
        let mapdata;
        let sourcemap;
        const emitResult = program.emit(sourceFile, (fileName, data, _writeByteOrderMark, onError, _sourceFiles) => {
            if (fileName.endsWith(".map")) {
                if (mapdata) {
                    onError("Multiple outputs.");
                }
                mapdata = data;
            }
            else if (fileName.endsWith(".d.ts")) {
                if (dtsdata) {
                    onError("Multiple outputs.");
                }
                dtsdata = data;
            }
            else {
                if (jsdata) {
                    onError("Multiple outputs.");
                }
                jsdata = data;
            }
        });
        if (!jsdata) {
            throw new Error("No data emitted.");
        }
        if (emitResult.diagnostics.length !== 0) {
            addDiagnostics(emitResult.diagnostics);
            return;
        }
        if (mapdata) {
            sourcemap = JSON.parse(mapdata);
            sourcemap = {
                version: 3,
                file: $path.basename(dstfn),
                sources: sourcemap.sources.map((f) => 'file:///' + $util.path_join(program.getCommonSourceDirectory(), f)),
                sourcesContent: (build.sourcemap_inlinesrc ? sourcemap.sourcesContent : undefined),
                mappings: sourcemap.mappings,
                names: sourcemap.names
            };
        }
        if (build.release) {
            const fn = $path.basename(dstfn);
            const code = {};
            code[fn] = jsdata;
            const options = {
                compress: {
                    drop_debugger: true
                }
            };
            if (sourcemap) {
                options.sourceMap = {
                    content: sourcemap,
                    url: fn + ".map",
                    includeSources: build.sourcemap_inlinesrc
                };
            }
            const result = await require("terser").minify(code, options);
            if (typeof result.code !== 'string') {
                throw new Error('terser did not returned code.');
            }
            jsdata = result.code;
            if (sourcemap && result.map) {
                const map = typeof result.map === 'string' ? JSON.parse(result.map) : result.map;
                sourcemap = {
                    version: 3,
                    file: $path.basename(dstfn),
                    sources: map.sources,
                    sourcesContent: (build.sourcemap_inlinesrc ? map.sourcesContent : undefined),
                    mappings: map.mappings,
                    names: map.names
                };
            }
        }
        const atasks = [$util.writeTextFileAsync(dstfn, jsdata)];
        if (dtsdata) {
            atasks.push($util.writeTextFileAsync($util.rename_extension(dstfn, ".d.ts"), dtsdata, true));
        }
        if (sourcemap) {
            atasks.push($util.writeTextFileAsync(dstfn + ".map", JSON.stringify(sourcemap)));
        }
        await Promise.allSettled(atasks);
    }
    function addError(sourceFile, message, symbol) {
        if (symbol) {
            const d = symbol.getDeclarations();
            addDiagnostics([{
                    file: sourceFile,
                    start: (d ? d[0].pos : 0),
                    length: (d ? d[0].end - d[0].pos : 0),
                    messageText: message,
                    category: ts.DiagnosticCategory.Error,
                    code: 0
                }]);
        }
        else {
            addDiagnostics([{
                    file: sourceFile,
                    start: 0,
                    length: 0,
                    messageText: message,
                    category: ts.DiagnosticCategory.Error,
                    code: 0
                }]);
        }
    }
    function addDiagnostics(diags) {
        if (diags && diags.length > 0) {
            for (const d of diags) {
                diagnostics.push(d);
            }
            return true;
        }
        return false;
    }
    function logDiagnostics() {
        for (let i = 0; i < diagnostics.length && i < 1000; ++i) {
            const diagnostic = diagnostics[i];
            const fileName = diagnostic.file ? diagnostic.file.fileName : undefined;
            const pos = diagnostic.file && typeof diagnostic.start === "number" ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : undefined;
            const line = pos ? pos.line + 1 : undefined;
            const column = pos ? pos.character + 1 : undefined;
            if (typeof diagnostic.messageText === "string") {
                build.logErrorFile(fileName, line, column, (diagnostic.code ? "TS" + diagnostic.code : undefined), diagnostic.messageText);
            }
            else {
                logDiagnosticMessageChain(diagnostic.messageText, 0);
                function logDiagnosticMessageChain(diagnosticChain, indent) {
                    build.logErrorFile(fileName, line, column, (diagnostic.code ? "TS" + diagnostic.code : undefined), "  ".repeat(indent) + diagnosticChain.messageText);
                    if (diagnosticChain.next) {
                        for (const n of diagnosticChain.next) {
                            logDiagnosticMessageChain(n, indent + 1);
                        }
                    }
                }
            }
        }
        return diagnostics.length;
    }
    function readConfig(fn) {
        const read_result = ts.readConfigFile(fn, (fn) => $util.readTextFileSync(fn));
        if (read_result.error) {
            throw new Error(fn + ": " + read_result.error.messageText);
        }
        return read_result.config;
    }
}
async function eslintrun(build, buildcfg) {
    const ESLint = require('eslint').ESLint;
    const parserOptions = {
        warnOnUnsupportedTypeScriptVersion: false,
        tsconfigRootDir: buildcfg.base_src,
        ecmaVersion: 2020
    };
    if (typeof buildcfg.tsconfig === 'string') {
        parserOptions.project = buildcfg.tsconfig;
    }
    if (buildcfg.tsconfig instanceof Object) {
        parserOptions.project = "tsconfig.json";
    }
    const eslint = new ESLint({
        baseConfig: {
            parser: "@typescript-eslint/parser",
            plugins: [
                "@typescript-eslint", "jsdoc", "import"
            ],
            env: {
                browser: true,
                node: false
            },
            parserOptions: parserOptions
        },
        cwd: buildcfg.base_src,
        globInputPaths: false,
        ignore: false,
        overrideConfig: (typeof buildcfg.eslint === 'object' ? buildcfg.eslint : undefined),
        overrideConfigFile: (typeof buildcfg.eslint === 'string' ? buildcfg.eslint : undefined),
        useEslintrc: false,
        fix: false,
        cache: false,
    });
    const results = await eslint.lintFiles(buildcfg.type === 'single' ? buildcfg.sources : buildcfg.sources.map((s) => s.src));
    let n = 0;
    for (const r of results) {
        for (const m of r.messages) {
            build.logErrorFile(r.filePath, m.line, m.column, m.messageId, m.message);
            ++n;
        }
    }
    return n;
}
function getConfig(base_url, config, name) {
    if (config === undefined) {
        return $util.isFile(config = base_url + "/" + name) ? config : undefined;
    }
    if (typeof config === "string") {
        if (!$util.isFile(config = base_url + "/" + config)) {
            throw new Error("Unknown file '" + config + "' for " + name + ".");
        }
        return config;
    }
    if (config instanceof Object) {
        return config;
    }
}
function createSourceMap(program) {
    const sourceMap = new Map();
    for (const sourceFile of program.getSourceFiles()) {
        sourceMap.set(program.getCanonicalFileName(sourceFile.fileName), { sourceFile, dependencies: program.getReferencedFiles(sourceFile) });
    }
    return sourceMap;
}
function getDependencies(program, sourceMap, dependencies) {
    const dep = [];
    const seenMap = new Set();
    const queue = [];
    addQueue(dependencies);
    while (queue.length) {
        const path = queue.pop();
        if (!seenMap.has(path)) {
            seenMap.add(path);
            const sf = sourceMap.get(program.getCanonicalFileName(path));
            if (sf) {
                dep.push(sf.sourceFile.fileName);
                addQueue(sf.dependencies);
            }
        }
    }
    return dep.sort().filter((s, i, a) => (i === 0 || a[i - 1] !== s));
    function addQueue(dependencies) {
        if (dependencies) {
            const iterator = dependencies.keys();
            for (let { value, done } = iterator.next(); !done; { value, done } = iterator.next()) {
                queue.push(value);
            }
        }
    }
}
function getExportInterface(sourceFile) {
    if (!sourceFile.fileName.endsWith("d.ts")) {
        const match = (/\/\/\/\s*<export-interface\s+path\s*=\s*('|")(.+?)('|")\s*\/>/im).exec(sourceFile.text);
        if (match) {
            return $util.path_join($path.dirname(sourceFile.fileName), match[2]);
        }
    }
    return undefined;
}
//# sourceMappingURL=typescript.js.map