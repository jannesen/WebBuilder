
export interface IBuild
{
    global:         IGlobal;
    copy?:          ICopy;
    replace?:       IReplace;
    css?:           ICss;
    sass?:          ISass;
    typescript?:    ITypeScript;
    touch?:         Touch;
}

//-----------------------------------------------------------------------------
// Global
//-----------------------------------------------------------------------------

export interface IGlobal
{
    rebuild?:               boolean;
    release?:               boolean;
    flavor?:                string;
    lint?:                  boolean;
    diagoutput?:            boolean;
    paths:                  IPaths;
    root_path:              string;
    src_path:               string;
    dst_path:               string;
    sourcemap_path:         string;
    sourcemap_root:         string;
    sourcemap_inlinesrc?:   boolean;
    state_file?:            string;
}

export interface IPaths
{
    [ key: string ]: string;
}

//-----------------------------------------------------------------------------
// Copy
//-----------------------------------------------------------------------------

export interface ICopy extends IBuildItem
{
}

//-----------------------------------------------------------------------------
// Replace
//-----------------------------------------------------------------------------

export interface IReplace extends IBuildItem
{
    replace:            IReplacer[];
}


export interface IReplacer
{
    from:       string;
    to:         string;
}

//-----------------------------------------------------------------------------
// Css
//-----------------------------------------------------------------------------

export interface ICss extends IBuildItem
{
}

//-----------------------------------------------------------------------------
// Js
//-----------------------------------------------------------------------------

export interface IJs extends IBuildItem
{
}

//-----------------------------------------------------------------------------
// Sass
//-----------------------------------------------------------------------------

export interface ISass extends IBuildItem
{
}

//-----------------------------------------------------------------------------
// TypeScript
//-----------------------------------------------------------------------------

export interface ITypeScript extends IBuildItem
{
    tsconfig?:          string|Object;
    eslint?:            string|Object;
    options?:           ITypeScriptOptions;
}

export interface ITSConfigOptions
{
    compilerOptions:    ITypeScriptOptions;
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

//-----------------------------------------------------------------------------
// AppCache
//-----------------------------------------------------------------------------

export interface IAppCache
{
    dst:            string;
    cache:          string[];
}

//-----------------------------------------------------------------------------
// Workbox
//-----------------------------------------------------------------------------

export interface IWorkbox
{
    globDirectory?: string;
    globPatterns?:  string[];
    globIgnores?:   string[];
    swDest:         string;
    skipWaiting?:   boolean;
}

//-----------------------------------------------------------------------------
// Touch
//-----------------------------------------------------------------------------

export type Touch = string[];

//-----------------------------------------------------------------------------
// General
//-----------------------------------------------------------------------------

export interface ISrcFilter
{
    base?:      string;
    pattern:    string|string[];
    target?:    string;
}

export interface IBuildItem
{
    base_src:               string;
    src:                    string|ISrcFilter|(string|ISrcFilter)[];
    dst?:                   string;
    allow_user_override?:   boolean;
}
