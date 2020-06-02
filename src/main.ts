import * as $util from "./lib/util.js";
import * as $workbox from "workbox-build";

export interface IBuildConfig
{
    global:         IBuildGlobal;
    copy?:          IBuildCopy;
    sass?:          IBuildSass;
    typescript?:    IBuildTypeScript;
    appcache?:      IBuildAppCache;
    workbox?:       $workbox.GenerateSWConfig;
    touch?:         BuildTouch;
}

export interface IPaths
{
    [ket:string]: string;
}

export interface IBuildGlobal
{
    rebuild?:               boolean;
    release?:               boolean;
    flavor?:                string;
    lint?:                  boolean;
    diagoutput?:            boolean;
    paths:                  IPaths;
    src_path:               string;
    dst_path:               string;
    sourcemap_path:         string;
    sourcemap_root:         string;
    sourcemap_inlinesrc?:   boolean;
    state_file?:            string;
}

export interface ISrcFilter
{
    base?:      string;
    pattern:    string|string[];
    target?:    string;
}

export interface IBuildItem
{
    src_base?:          string;
    src:                string|ISrcFilter|(string|ISrcFilter)[];
    dst?:               string;
}

export interface IBuildCopy extends IBuildItem
{
    allow_user?:        boolean;
    rename?:            ICopyRename;
}

export interface IBuildReplace extends IBuildItem
{
    replace:            IReplacer[];
}

export interface ICopyRename
{
    dirname:   CopyRenamer;
    basename:  CopyRenamer;
    extname:   CopyRenamer;
}
export type CopyRenamer = string | ((n:string) => string);

export interface IReplacer
{
    from:       string;
    to:         string;
}

export interface IBuildSass extends IBuildItem
{
    options?:           ISassOptions;
}

export interface IBuildTypeScript extends IBuildItem
{
    tsconfig?:          string|Object;
    tslint?:            string|Object;
    options?:           ITypeScriptOptions;
}

export interface IBuildAppCache
{
    dst:            string;
    cache:          string[];
}

export type BuildTouch = string[];

export interface ISassOptions
{
    autoprefixer?:      string[];
}

export interface ITypeScriptOptions
{
    allowJs?: boolean;
    allowSyntheticDefaultImports?: boolean;
    allowUnreachableCode?: boolean;
    allowUnusedLabels?: boolean;
    baseUrl?: string;
    charset?: string;
    declaration?: boolean;
    declarationDir?: string;
    disableSizeLimit?: boolean;
    emitBOM?: boolean;
    emitDecoratorMetadata?: boolean;
    experimentalDecorators?: boolean;
    forceConsistentCasingInFileNames?: boolean;
    inlineSourceMap?: boolean;
    inlineSources?: boolean;
    isolatedModules?: boolean;
    jsx?: string;
    lib?: string[];
    locale?: string;
    mapRoot?: string;
    maxNodeModuleJsDepth?: number;
    module?: string;
    moduleResolution?: string;
    newLine?: string;
    noEmit?: boolean;
    noEmitHelpers?: boolean;
    noEmitOnError?: boolean;
    noErrorTruncation?: boolean;
    noFallthroughCasesInSwitch?: boolean;
    noImplicitAny?: boolean;
    noImplicitReturns?: boolean;
    noImplicitThis?: boolean;
    noUnusedLocals?: boolean;
    noUnusedParameters?: boolean;
    noImplicitUseStrict?: boolean;
    noLib?: boolean;
    noResolve?: boolean;
    paths?: string;
    preserveConstEnums?: boolean;
    project?: string;
    reactNamespace?: string;
    removeComments?: boolean;
    rootDir?: string;
    rootDirs?: string[];
    skipLibCheck?: boolean;
    skipDefaultLibCheck?: boolean;
    sourceMap?: boolean;
    sourceRoot?: string;
    strictNullChecks?: boolean;
    suppressExcessPropertyErrors?: boolean;
    suppressImplicitAnyIndexErrors?: boolean;
    target?: string;
    traceResolution?: boolean;
    types?: string[];
    typeRoots?: string[];
}

export const args = new $util.Args();

try {
    if (!args.parse(process.argv)) {
        process.exit(1);
    }
} catch (e) {
    console.error("Parse args failed.", e);
    process.exit(1);
}

export async function build(...buildconfig:IBuildConfig[])
{
    try {
        const   start  = (new Date()).getTime();
        let     errors = 0;

        for (let i = 0 ; errors === 0 && i < (buildconfig as IBuildConfig[]).length ; ++i) {
            const bc = (buildconfig as IBuildConfig[])[i];
            const build = new $util.Build(bc.global);

            for(const name of ["css", "sass", "js", "typescript", "replace", "copy", "appcache", "workbox", "touch"]) {
                if ((bc as any)[name]) {
                    await build.runTaskAsync(name, (bc as any)[name]);
                }
            }

            if (build.errors === 0) {
                build.saveState();
                build.checkTarget();
            }

            errors += build.errors;
        }

        console.log("Build: " + (errors ? "failed" : "done") + " in " + (((new Date()).getTime() - start) / 1000.0).toFixed(3).replace(".", ",") + " sec.");
        process.exit(errors > 0 ? 1 : 0);
    } catch(e) {
        console.error("Build failed.", e);
        process.exit(1);
    }

}

export const path_join  = $util.path_join;
export const write_file = $util.write_file;
