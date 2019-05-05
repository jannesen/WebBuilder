import * as $fs from "fs";
import * as $path from "path";
import * as $main from "../main";
import * as $util from "../lib/util.js";
import * as $task from "./typescript";
import * as $ts from "typescript/lib/typescript";

export function build_typescript(build:$util.Build, tsconfig:string|Object, tslint:string|Object, options:$main.ITypeScriptOptions, items:$task.ITypeScriptItem[], singleFile:boolean)
{
    for (const i of items) {
        build.logBuildFile(i.dst);
    }

    (new TypeScriptBuild(build)).Build(tsconfig, tslint, options, items, singleFile);
}

class TypeScriptBuild
{
    private     build:              $util.Build;
    private     compileoptions:     $ts.CompilerOptions;
    private     program!:           $ts.Program;
    private     diagnostics:        $ts.Diagnostic[];

    constructor(build:$util.Build) {
        this.build          = build;
        this.compileoptions = $ts.getDefaultCompilerOptions();
        this.diagnostics    = [];
    }

    public      Build(tsconfig:string|Object, tslint:string|Object, options:$main.ITypeScriptOptions, items:$task.ITypeScriptItem[], singleFile:boolean)
    {
        if (tsconfig) {
            this.LoadTSConfig(tsconfig);
        }

        if (this.diagnostics.length === 0) {
            this.setOptions(options);
        }

        if (this.diagnostics.length === 0) {
            this.createProgram(items, singleFile);
        }

        if (this.diagnostics.length === 0 && this.build.lint && tslint) {
            this.checkExportInterface();

            if (this.lintFiles(tslint)) {
                return;
            }

            this.createProgram(items, singleFile);
        }

        if (this.diagnostics.length === 0) {
            if (singleFile) {
                this.processSingleFiles(items[0]);
            } else {
                this.processFiles(items);
            }
        }

        this.logDiagnostics();
    }

    private     LoadTSConfig(tsconfig:string|Object)
    {
        if (typeof tsconfig === "string") {
            const config = this.readConfig(tsconfig);

            const parse_result = $ts.convertCompilerOptionsFromJson(config.compilerOptions, $path.dirname(tsconfig));
            if (this.addDiagnostics(parse_result.errors))
                return ;

            Object.assign(this.compileoptions, parse_result.options);
        } else if (tsconfig instanceof Object) {
            const parse_result = $ts.convertCompilerOptionsFromJson((tsconfig as any).compilerOptions, this.build.src_path);
            if (this.addDiagnostics(parse_result.errors))
                return ;

            Object.assign(this.compileoptions, parse_result.options);
        }
    }
    private     setOptions(options:$main.ITypeScriptOptions)
    {
        if (options) {
            const result = $ts.convertCompilerOptionsFromJson(options, this.build.src_path);
            if (this.addDiagnostics(result.errors))
                return;

            Object.assign(this.compileoptions, result.options);
        }
    }
    private     createProgram(files:$task.ITypeScriptItem[], singleFile:boolean)
    {
        this.compileoptions.allowJs                 = true;
        this.compileoptions.noEmit                  = false;
        this.compileoptions.noEmitOnError           = false;
        this.compileoptions.suppressOutputPathCheck = true;
        this.compileoptions.out                     = undefined;
        this.compileoptions.outDir                  = undefined;
        this.compileoptions.outFile                 = singleFile ? files[0].dst : undefined;

        if (this.build.sourcemap) {
            this.compileoptions.sourceMap     = true;
            this.compileoptions.inlineSources = this.build.sourcemap_inlinesrc;
            this.compileoptions.sourceRoot    = "/";
        }

        this.compileoptions.newLine       = $ts.NewLineKind.LineFeed;

        if (this.build.release) {
            this.compileoptions.removeComments  = true;
        }

        this.program     = $ts.createProgram((singleFile ? (files[0].src as string[]) : files.map(f => (f.src as string))), this.compileoptions);
        if (this.addDiagnostics($ts.getPreEmitDiagnostics(this.program)))
            return;
    }
    private     checkExportInterface()
    {
        const self = this;
        for (const sourceFile of this.program.getSourceFiles()) {
            const templateInterfacePath = getExportInterface(sourceFile);
            if (templateInterfacePath) {
                try {
                    const templateFile = this.program.getSourceFile(templateInterfacePath);
                    if (!templateFile) {
                        throw new Error("Unknown file '" + templateFile + "' in program.");
                    }

                    const tc              = this.program.getTypeChecker();
                    const templateSymbol  = tc.getSymbolAtLocation(templateFile);
                    const sourceSymbol    = tc.getSymbolAtLocation(sourceFile);
                    if (!sourceSymbol) {
                        throw new Error("File is empty");
                    }
                    if (!templateSymbol) {
                        throw new Error("Template file is empty");
                    }

                    const templateExports = tc.getExportsAndPropertiesOfModule(templateSymbol);
                    const sourceExports   = tc.getExportsAndPropertiesOfModule(sourceSymbol);

                    templateExports.forEach((templateSymbol) => {
                                                const sourceSymbol = sourceExports.find((s) => s.escapedName === templateSymbol.escapedName);
                                                if (sourceSymbol) {
                                                    if (sourceSymbol.flags === templateSymbol.flags) {
                                                        const templateType = tc.getTypeOfSymbolAtLocation(templateSymbol, templateFile);
                                                        const sourceType   = tc.getTypeOfSymbolAtLocation(sourceSymbol, sourceFile);

                                                        if (!tc.isTypeIdenticalTo(sourceType, templateType)) {
                                                            const templateTypeFlags = simpleType(templateType);
                                                            const sourceTypeFlags = simpleType(sourceType);

                                                            if (!(templateTypeFlags && templateTypeFlags === sourceTypeFlags)) {
                                                                addError(templateSymbol.name + " export type '" + tc.typeToString(sourceType) + "' expect '" + tc.typeToString(templateType) + "'", sourceSymbol);
                                                            }
                                                        }
                                                    } else {
                                                        addError(templateSymbol.name + " export " + symbolFlagsToString(sourceSymbol) + " expect " + symbolFlagsToString(templateSymbol) + "'", sourceSymbol);
                                                    }
                                                } else {
                                                    addError("Missing export for " + templateSymbol.name);
                                                }
                                            });
                    sourceExports.forEach((sourceSymbol) => {
                                                if (!templateExports.find((s) => s.escapedName === sourceSymbol.escapedName)) {
                                                    addError("Exported symbol " + sourceSymbol.name + " not defined in export-interface", sourceSymbol);
                                                }
                                            });
                } catch (e) {
                    addError(e.message);
                }

                function addError(message:string, symbol?:$ts.Symbol) {
                    if (symbol) {
                        const d = symbol.getDeclarations();

                        self.addDiagnostics([{
                            file:               sourceFile,
                            start:              (d ? d[0].pos            : 0),
                            length:             (d ? d[0].end - d[0].pos : 0),
                            messageText:        message,
                            category:           $ts.DiagnosticCategory.Error,
                            code:               0
                        }]);
                    } else {
                        self.addDiagnostics([{
                            file:               sourceFile,
                            start:              0,
                            length:             0,
                            messageText:        message,
                            category:           $ts.DiagnosticCategory.Error,
                            code:               0
                        }]);
                    }
                }
                function simpleType(type:$ts.Type) {
                    if (type.flags & ($ts.TypeFlags.Any | $ts.TypeFlags.StructuredType | $ts.TypeFlags.TypeParameter | $ts.TypeFlags.Index | $ts.TypeFlags.IndexedAccess)) {
                        return 0;
                    }

                    if (type.flags & $ts.TypeFlags.StringLike)  return $ts.TypeFlags.String;
                    if (type.flags & $ts.TypeFlags.NumberLike)  return $ts.TypeFlags.Number;
                    if (type.flags & $ts.TypeFlags.BooleanLike) return $ts.TypeFlags.Boolean;
                }
                function symbolFlagsToString(symbol:$ts.Symbol):string {
                    const flags = symbol.flags;
                    let rtn = "";
                    let bit = 1;
                    while (bit & 0xffffffff) {
                        if (flags & bit) {
                            rtn += (rtn.length > 0 ? "," : "") + ($ts.SymbolFlags as any)["" + bit] || "0x" + bit.toString(16);
                        }
                        bit = bit << 1;
                    }
                    return rtn;
                }
            }
        }
    }
    private     lintFiles(tslint:string|Object)
    {
        let errors  = 0;
        const $linter = require("tslint");

        const options = {
            fix:        false,
            formatter:  "json"
        };

        for (const sourceFile of this.program.getSourceFiles().filter((f) => !f.fileName.endsWith("d.ts"))) {
            const fileName = sourceFile.fileName;
            const linter = new $linter.Linter(options);
            const configuration = typeof tslint === "string"
                                        ? $linter.Configuration.findConfiguration(tslint, fileName).results
                                        : Object.assign({}, $linter.Configuration.EMPTY_CONFIG, $linter.Configuration.parseConfigFile(tslint, this.build.src_path));
            linter.program = this.program;
            linter.lint(fileName, $fs.readFileSync(fileName, "utf8"), configuration);
            const result = linter.getResult();

            for (const failure of result.failures) {
                const lineAndCharacter = failure.getStartPosition().getLineAndCharacter();

                this.build.logErrorFile(failure.getFileName(),
                                        lineAndCharacter.line + 1, lineAndCharacter.character + 1,
                                        failure.getRuleName(),
                                        "Warning - " + failure.getFailure());
                ++errors;
            }
        }

        return errors;
    }
    private     processFiles(files:$task.ITypeScriptItem[])
    {
        const getCanonicalFileName = $ts.getGetCanonicalFileName();
        const sourceMap = new Map<string, { sourceFile: $ts.SourceFile, dependencies: $ts.Map<true>|undefined }>();

        for (const sourceFile of this.program.getSourceFiles()) {
            sourceMap.set(getCanonicalFileName(sourceFile.fileName), { sourceFile, dependencies: $ts.getReferencedFiles(this.program, sourceFile, getCanonicalFileName) });
        }

        for (const typeScriptFile of files) {
            try {
                const sf = sourceMap.get(getCanonicalFileName(typeScriptFile.src as string));
                if (!sf)
                    throw new Error("Can't File File in sourceFiles");

                typeScriptFile.reference = getDependencies(sf.dependencies);
                this.emitFile(sf.sourceFile, typeScriptFile.dst);
            } catch(e) {
                this.build.logError(typeScriptFile.dst + ": " + e.message);
            }
        }

        function getDependencies(dependencies:$ts.Map<true>|undefined):string[] {
            const dep     = <string[]> [];
            const seenMap = new Map<string, true>();
            const queue   = <string[]> [];

            addQueue(dependencies);

            while (queue.length) {
                const path = queue.pop()!;
                if (!seenMap.has(path)) {
                    seenMap.set(path, true);
                    const sf = sourceMap.get(getCanonicalFileName(path));
                    if (sf) {
                        dep.push(sf.sourceFile.fileName);
                        addQueue(sf.dependencies);
                    }
                }
            }

            return dep.sort().filter((s, i, a) => (i === 0 || a[i - 1] !== s));

            function addQueue(dependencies:$ts.Map<true>|undefined) {
                if (dependencies) {
                    const iterator = dependencies.keys();
                    for (let { value, done } = iterator.next(); !done; { value, done } = iterator.next()) {
                        queue.push(value);
                    }
                }
            }
        }
    }
    private     processSingleFiles(file:$task.ITypeScriptItem)
    {
        try {
            file.reference = this.program.getSourceFiles().map((s) => s.fileName).sort().filter((f) => ((file.src as string[]).findIndex((i) => (i === f)) < 0));
            this.emitFile(undefined, file.dst);
        } catch(e) {
            this.build.logError(file.dst + ": " + e.message);
        }
    }
    private     emitFile(sourceFile:$ts.SourceFile|undefined, dstfn:string)
    {
        let jsdata:string|undefined;
        let dtsdata:string|undefined;
        let mapdata:string|undefined;
        let sourcemap:any;

        const emitResult = this.program.emit(sourceFile, (fileName, data, _writeByteOrderMark, onError, _sourceFiles) => {
                                                if (fileName.endsWith(".map")) {
                                                    if (mapdata) {
                                                        onError!("Multiple outputs.");
                                                    }
                                                    mapdata = data;
                                                } else if (fileName.endsWith(".d.ts")) {
                                                    if (dtsdata) {
                                                        onError!("Multiple outputs.");
                                                    }
                                                    dtsdata = data;
                                                } else {
                                                    if (jsdata) {
                                                        onError!("Multiple outputs.");
                                                    }
                                                    jsdata = data;
                                                }
                                            });

        if (!jsdata) {
            throw new Error("No data emitted.");
        }

        if (emitResult.diagnostics.length !== 0) {
            this.addDiagnostics(emitResult.diagnostics);
            return ;
        }

        if (mapdata) {
            sourcemap = JSON.parse(mapdata);

            sourcemap = {
                version:        3,
                file:           $path.basename(dstfn),
                sources:        sourcemap.sources.map((f:string) => this.build.sourcemap_map($util.path_join(this.program.getCommonSourceDirectory(), f))),
                sourcesContent: (this.build.sourcemap_inlinesrc ? sourcemap.sourcesContent : undefined),
                mappings:       sourcemap.mappings,
                names:          sourcemap.names
            };
        }

        if (this.build.release) {
            const   fn          = $path.basename(dstfn);
            const   code:any    = {};   code[fn] = jsdata;
            const   options:any = {
                                        compress:       {
                                                            drop_debugger:  true
                                                        }
                                  };

            if (sourcemap) {
                options.sourceMap = {
                    content:        sourcemap,
                    url:            fn + ".map",
                    includeSources: this.build.sourcemap_inlinesrc
                };
            }

            const result = require("terser").minify(code, options);

            if (result.error) {
                throw new Error(result.error);
            }

            jsdata  = result.code as string;

            if (sourcemap) {
                const   map = JSON.parse(result.map);

                sourcemap = {
                    version:        3,
                    file:           $path.basename(dstfn),
                    sources:        map.sources,
                    sourcesContent: (this.build.sourcemap_inlinesrc ? map.sourcesContent : undefined),
                    mappings:       map.mappings,
                    names:          map.names
                };
            }
        }

        $util.write_file(dstfn, jsdata);

        if (dtsdata) {
            $util.write_file($util.rename_extension(dstfn, ".d.ts"), dtsdata, true);
        }
        if (sourcemap) {
            $util.write_file(dstfn + ".map", JSON.stringify(sourcemap));
        }
    }
    private     addDiagnostics(diagnostics:ReadonlyArray<$ts.Diagnostic>)
    {
        if (diagnostics && diagnostics.length > 0) {
            diagnostics.forEach(d => this.diagnostics.push(d));
            return true;
        }
        return false;
    }
    private     logDiagnostics()
    {
        for (let i = 0 ; i < this.diagnostics.length && i < 1000 ; ++i ) {
            const diagnostic = this.diagnostics[i];

            const fileName = diagnostic.file ? diagnostic.file.fileName : undefined;
            const pos      = diagnostic.file && typeof diagnostic.start === "number" ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : undefined;
            const line     = pos ? pos.line + 1      : undefined;
            const column   = pos ? pos.character + 1 : undefined;

            if (typeof diagnostic.messageText === "string") {
                this.build.logErrorFile(fileName, line, column, (diagnostic.code ? "TS" + diagnostic.code : undefined), diagnostic.messageText);
            } else {
                for (let diagnosticChain = diagnostic.messageText as ($ts.DiagnosticMessageChain|undefined), indent = 0 ;
                        diagnosticChain ;
                        diagnosticChain = diagnosticChain.next, ++indent) {
                    this.build.logErrorFile(fileName, line, column, (diagnostic.code ? "TS" + diagnostic.code : undefined), "  ".repeat(indent) + diagnosticChain.messageText);
                }
            }
        }

        return this.diagnostics.length;
    }
    private     readConfig(fn:string)
    {
        const read_result = $ts.readConfigFile(fn, (fn) => $fs.readFileSync(fn, {encoding:"utf8"}) );
        if (read_result.error) {
            throw new Error(fn + ": " + read_result.error.messageText);
        }

        return read_result.config;
    }
}

const regex_exportinterface = /\/\/\/\s*<export-interface\s+path\s*=\s*('|")(.+?)('|")\s*\/>/im;

function getExportInterface(sourceFile:$ts.SourceFile) {
    if (!sourceFile.fileName.endsWith("d.ts")) {
        const match = regex_exportinterface.exec(sourceFile.text);
        if (match) {
            return $util.path_join($path.dirname(sourceFile.fileName), match[2]);
        }
    }

    return undefined;
}
