import * as $fs             from "fs";
import * as $util           from "util";
import * as $path           from "path";
import * as $glob           from "glob";
import * as $minimatch      from "minimatch";
import * as $main           from "../main";
import * as $buildconfig    from "../buildconfig";

const process_cwd = process.cwd();

interface ITargetDirectory
{
    [fn:string]:    boolean|ITargetDirectory;
}

export interface ISrcTarget
{
    srcpath:        string;
    targetname:     string;
}

export interface IFileItem<T>
{
    srcfilename:    string;
    dstfilename:    string;
    targetname:     string;
    item:           T;
}

export class Args
{
    private     _rebuild:               boolean|undefined;
    private     _release:               boolean|undefined;
    private     _flavor:                string|undefined;
    private     _outdir:                string|undefined;
    private     _version:               string|undefined;
    private     _diagoutput:            boolean|undefined;


    public get  rebuild()
    {
        return this._rebuild;
    }
    public get  release()
    {
        return this._release;
    }
    public get  flavor()
    {
        return this._flavor;
    }
    public get  outdir()
    {
        return this._outdir;
    }
    public get  version()
    {
        return this._version;
    }
    public get  diagoutput() {
        return this._diagoutput;
    }

    public          parse(argv:string[])
    {
        for (let i = 2 ; i < argv.length ; ++i) {
            const argn = argv[i].split("=", 2);
            switch(argn[0]) {
            case "--rebuild":       this._rebuild = true;       break;
            case "--release":       this._release = true;       break;
            case "--diagoutput":    this._diagoutput = true;    break;
            case "/Configuration": {
                    let   c = argn[1];
                    const s = c.indexOf("-");

                    if (s >= 0) {
                        this._flavor = c.substr(0, s);
                        c = c.substr(s + 1);
                    }

                    switch(c) {
                    case "Debug":       this._release = false;      break;
                    case "Release":     this._release = true;       break;
                    default:            throw new Error("Invalid configuration option: '" + argn[1] + "'.");
                    }
                }
                break;

            case "/Flavor":
                this._flavor = argn[1];
                break;

            case "/OutDir":
                this._outdir = argn[1];
                break;

            case "/Version":
                this._version = argn[1];
                break;

            case "--help":
                console.log("BuildJS [--rebuild] [--release] [--diagoutput] [/Configuration=<Configuration>]");
                return false;
            default:
                console.log("Unknown option: '" + argn[0] + "'.");
                return false;
            }
        }

        return true;
    }
}

export class Build
{
    private     _rebuild:               boolean;
    private     _release:               boolean;
    private     _flavor:                string;
    private     _lint:                  boolean;
    private     _diagoutput:            boolean;
    private     _paths:                 $buildconfig.IPaths;
    private     _root_path:             string;
    private     _src_path:              string;
    private     _dst_path:              string;
    private     _sourcemap_path:        string;
    private     _sourcemap_root:        string;
    private     _sourcemap_inlinesrc:   boolean;
    private     _state_file:            string;
    private     _errors:                number;
    private     _state:                 any;
    private     _targets:               ITargetDirectory;

    public get  rebuild()
    {
        return this._rebuild;
    }
    public get  release()
    {
        return this._release;
    }
    public get  flavor()
    {
        return this._flavor;
    }
    public get  lint()
    {
        return this._lint;
    }
    public get  diagoutput()
    {
        return this._diagoutput;
    }
    public get  sourcemap()
    {
        return typeof this._sourcemap_path === "string";
    }
    public get  sourcemap_inlinesrc()
    {
        return this._sourcemap_inlinesrc;
    }
    public get  root_path()
    {
        return this._root_path;
    }
    public get  src_path()
    {
        return this._src_path;
    }
    public get  dst_path()
    {
        return this._dst_path;
    }
    public get  errors()
    {
        return this._errors;
    }

                constructor(global:$buildconfig.IGlobal)
    {
        if (!global.dst_path) {
            throw new Error("global.dst_path not set.");
        }

        let rebuild              = false;
        let release              = global.release;
        let flavor               = global.flavor;
        let lint                 = global.lint;
        let diagoutput           = global.diagoutput || false;
        let sourcemap_path       = global.sourcemap_path;
        let sourcemap_root       = global.sourcemap_root;
        let sourcemap_inlinesrc  = global.sourcemap_inlinesrc;

        this._root_path           = path_join(global.root_path);;
        this._src_path            = path_join(this._root_path, global.src_path);
        this._dst_path            = path_join(this._root_path, global.dst_path);
        this._state_file          = path_join(this._root_path, global.state_file || (this._dst_path + "/.buildstate"));
        this._errors              = 0;
        this._state               = {};
        this._targets             = {};

        if ($main.args.rebuild    !== undefined)   rebuild    = $main.args.rebuild;
        if ($main.args.release    !== undefined)   release    = $main.args.release;
        if ($main.args.flavor     !== undefined)   flavor     = $main.args.flavor;
        if ($main.args.diagoutput !== undefined)   diagoutput = $main.args.diagoutput;

        if (release    === undefined)           release = false;
        if (lint       === undefined)           lint    = release;
        if (flavor     === undefined)           flavor  = "";
        if (sourcemap_path)                     sourcemap_path = path_join(this._src_path, sourcemap_path);
        if (!sourcemap_root && sourcemap_path)  sourcemap_root = "/sources/";
        if (!sourcemap_inlinesrc)               sourcemap_inlinesrc = !release;

        this._rebuild              = rebuild;
        this._release              = release;
        this._flavor               = flavor;
        this._lint                 = lint;
        this._diagoutput           = diagoutput;

        this._paths = {};
        for (const n in global.paths) {
            this._paths[n] = path_join(this._root_path, global.paths[n]);
        }

        this._sourcemap_path       = sourcemap_path;
        this._sourcemap_root       = sourcemap_root;
        this._sourcemap_inlinesrc  = sourcemap_inlinesrc;

        if (!this._rebuild && this._state_file) {
            try {
                if ($fs.existsSync(this._state_file)) {
                    this._state = JSON.parse($fs.readFileSync(this._state_file, { encoding:"utf8" }));
                }
            } catch(e:any) {
                console.log("Reading statefile failed: " + e.message);
            }
        }

        if (global.rebuild      ||
            !this._state        ||
            !this._state.global ||
            this._state.global.release        !== this._release        ||
            this._state.global.flavor         !== this._flavor         ||
            this._state.global.lint           !== this._lint           ||
            this._state.global.sourcemap_path !== this._sourcemap_path ||
            this._state.global.sourcemap_root !== this._sourcemap_root) {
            console.log("Build: Rebuild");
            this._rebuild = true;
            this._state   = {};
        }

        this._state.global = {
                                release:            this._release,
                                flavor:             this._flavor,
                                lint:               this._lint,
                                sourcemap_path:     this._sourcemap_path,
                                sourcemap_root:     this._sourcemap_root
                            };
    }

    public      checkTarget()
    {
        try {
            const scan = new TargetScan(this._diagoutput);

            scan.ScanTree(this.dst_path, this._targets);
            scan.CleanTarget();
        } catch(e) {
            console.log("Cleanup of target failed.: " + e.message);
        }
    }
    public      saveState()
    {
        if (this._state_file) {
            try {
                this.define_dstfile(this._state_file);
                path_make($path.dirname(this._state_file));
                $fs.writeFileSync(this._state_file, JSON.stringify(this._state), { encoding:"utf8" });
            } catch(e) {
                console.log("Writing statefile failed: " + e.message);
            }
        }
    }

    public async runTaskAsync(name:string, config:any)
    {
        try {
            await require("../task/" + name + ".js").runAsync(this, config);
        } catch (e) {
            console.log(name + " failed: " + e.message);
        }
    }
    public      parallelAsync<T extends IFileItem<any>>(items:T[], handler: (item:T)=>Promise<void>, nparallel:number)
    {
        const self = this;
        const enum Status {
            Waiting,
            Running,
            Success,
            Failed
        }

        if (items.length === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) =>{
                    const itemStatus = (new Array<Status>(items.length)).fill(Status.Waiting);
                    let ndone    = 0;
                    let nstarted = 0;

                    while (nstarted < items.length && nstarted < nparallel) {
                        start(nstarted++);
                    }

                    function start(n:number) {
                        itemStatus[n] = Status.Running;

                        handler(items[n]).then(() => {
                                                   done(n, Status.Success);
                                               },
                                               (err) => {
                                                   self.logError(items[n].srcfilename + ": build handler failer: " + err.message);
                                                   done(n, Status.Failed);
                                               });
                    }
                    function done(n:number, result:Status) {
                        if (itemStatus[n] === Status.Running) {
                            itemStatus[n] = result;
                            ++ndone;

                            if (nstarted < items.length) {
                                start(nstarted++);
                            }
                            else {
                                if (ndone >= items.length) {
                                    resolve(undefined);
                                }
                            }
                        }
                    }
               });
    }
    public      resolvePath(path:string, fn:string):string
    {
        if (fn.startsWith("$")) {
            return this.resolvePathFilename(fn);
        }

        return path_join(path, fn);
    }
    public      resolvePathFilename(pathfn:string):string
    {
        let i = pathfn.indexOf("/");
        if (i < 0) i = pathfn.length;
        const n = pathfn.substring(1, i);
        const p = this._paths && this._paths[n];

        if (typeof p !== "string") {
            throw new Error("Unknown path '$" + n + "'.");
        }

        return p + pathfn.substr(i);
    }
    public      fileitems<T extends $buildconfig.IBuildItem>(items:readonly T[], targetrename?:(filename:string)=>string): IFileItem<T>[]
    {
        const rtn:IFileItem<T>[] = [];

        for (const item of items) {
            const dst = this.dst(item);

            if (dst.endsWith("/")) {
                for (const file of this.src(this._src_path, item)) {
                    let targetname = file.targetname;
                    if (targetrename) {
                        targetname = targetrename(targetname);
                    }

                    rtn.push({
                        srcfilename: item_src(file.srcpath, item),
                        dstfilename: dst + targetname,
                        targetname:  targetname,
                        item:        item
                    });
                }
            } else {
                if (typeof item.src !== "string" || isGlob(item.src)) {
                    throw new Error("Invalid dst '" + item.dst + "': must by a directory.");
                }

                rtn.push({
                    srcfilename: item_src(path_join(this.src_path, item.src), item),
                    dstfilename: dst,
                    targetname:  dst,
                    item:        item
                });
            }
        }

        rtn.sort((i1, i2) => (i1.dstfilename < i2.dstfilename ? -1 : i1.dstfilename > i2.dstfilename ? 1 : 0));

        return rtn;
    }
    public      src(path:string, item:$buildconfig.IBuildItem)
    {
        return this.src1(path, undefined, item.src, undefined);
    }
    private     src1(path:string, base:string|undefined, pattern:string|$buildconfig.ISrcFilter|(string|$buildconfig.ISrcFilter)[], target:string|undefined)
    {
        if (typeof pattern === "string") {
            return this.src2(path, base, pattern, undefined);
        }

        if (Array.isArray(pattern)) {
            let nobj = 0;
            let nstr = 0;

            for (const p of pattern) {
                if (typeof p === "string") {
                    nstr++;
                } else if (p instanceof Object) {
                    nobj++;
                } else {
                    throw new Error("Invalid src.");
                }
            }

            if (nobj > 0 && nstr === 0) {
                const rtn:ISrcTarget[] = [];
                pattern.forEach((p) => {
                                    this.src1(path, base, p, target).forEach((r) => rtn.push(r));
                                });
                return rtn;
            }

            if (nstr > 0 && nobj === 0) {
                return this.src2(path, base, pattern as string[], undefined);
            }

            throw new Error("Invalid src.");
        }

        if (pattern instanceof Object) {
            return this.src2(path, pattern.base, pattern.pattern, pattern.target);
        }

        throw new Error("Src not defined.");
    }
    private     src2(path:string, base:string|undefined, pattern:string|string[], target:string|undefined):ISrcTarget[]
    {
        let cwd = base ? this.resolvePath(path, base) : path;
        if (!cwd.endsWith("/")) {
            cwd += "/";
        }

        if (typeof target === "string") {
            if (!target.endsWith("/")) {
                target += "/";
            }
        } else {
            target = "";
        }

        return this.glob(cwd, pattern).map((name) => {
                                        if (!name.startsWith(cwd)) {
                                            throw new Error("'" + name + "' outside base '" + cwd + "'.");
                                        }

                                        return {
                                                srcpath:    name,
                                                targetname: target + name.substring(cwd.length)
                                              };
                                      });
    }
    public      glob(cwd:string, patterns:string|string[]):string[]
    {
        if (!(typeof patterns === "string" || Array.isArray(patterns))) {
            throw new Error("Invalid glob pattern, expect string or array.");
        }

        if (cwd.endsWith("/") || cwd.endsWith("\\")) {
            cwd = cwd.substring(0, cwd.length - 1);
        }

        const   options  = {
                                cwd,
                                absolute:   true
                            };
        let files:string[] = [];

        patterns = Array.isArray(patterns) ? patterns : [ patterns ];

        for (let pattern of patterns) {
            if (typeof pattern === "string") {
                if (pattern[0] === "!") {
                    for (let i = files.length - 1; i >= 0 ; --i) {
                        if ($minimatch($path.relative(cwd, files[i]).replace(/\\/g, "/"), pattern.substring(1))) {
                            files.splice(i, 1);
                        }
                    }
                } else {
                    if (isGlob(pattern)) {
                        const newList = $glob.sync(pattern, options);

                        if (files.length > 0) {
                            newList.forEach((item) => {
                                                if (files.indexOf(item) === -1) {
                                                    files.push(item);
                                                }
                                            });
                        } else {
                            files = newList;
                        }
                    } else {
                        pattern = path_join(options.cwd, pattern);
                        if (files.indexOf(pattern) === -1) {
                            files.push(pattern);
                        }
                    }
                }
            }
        }

        files = files.filter(isFile).sort();

        if (files.length === 0) {
            this.logWarning("glob has no files cwd='" + cwd + "', pattern=[" + patterns.map((s) => "'" + s + "'").join(", ") + "]");
        }

        return files;
    }
    public      dst(item:$buildconfig.IBuildItem):string
    {
        if (item.dst !== undefined) {
            if (typeof item.dst !== "string") {
                throw new Error("Invalid dst: expect string.");
            }

            return path_join(this._dst_path, item.dst);
        }

        return this._dst_path + "/";
    }
    public      sourcemap_map(srcfn:string):string
    {
        //return 'file:///'+srcfn;
        return this._sourcemap_root + $path.relative(this._sourcemap_path, srcfn).replace(/\\/g, "/");
    }
    public      define_dstfile(...dstfns:(string|undefined)[])
    {
        for (const dstfn of dstfns) {
            if (typeof dstfn === "string" && dstfn.startsWith(this._dst_path)) {
                const   fparts    = dstfn.substring(this._dst_path.length + 1).replace(/\\/g, "/").split("/");
                let     targetdir = this._targets;

                for (let i = 0 ; i < fparts.length  - 1; ++i) {
                    let f = targetdir[fparts[i]];

                    if (f) {
                         if (typeof f === "boolean") {
                             throw new Error("Target '" + dstfn + "' already defined.");
                        }
                    } else {
                        targetdir[fparts[i]] = f = {};
                    }

                    targetdir = f;
                }

                if (targetdir[fparts[fparts.length - 1]]) {
                     throw new Error("Target '" + dstfn + "' already defined.");
                }

                targetdir[fparts[fparts.length - 1]] = true;
            }
        }
    }
    public      getState<T>(name:string)
    {
        return (this._state[name] || []) as T[];
    }
    public      setState(name:string, state:any)
    {
        this._state[name] = state;
    }
    public      logDebug(name:string, msg:string)
    {
        if (this._diagoutput) {
            console.log("Debug " + name + ": " + msg);
        }
    }
    public      logBuildFile(name:string, fn:string)
    {
        if (this._diagoutput) {
            console.log("Build " + name + ": " + $path.relative(this._dst_path, fn));
        }
    }
    public      logWarning(msg:string)
    {
        console.log(msg);
    }
    public      logError(msg:string)
    {
        console.log(msg);
        this._errors++;
    }
    public      logErrorFile(fn:string|undefined, line:number|undefined, column:number|undefined, code:string|undefined, msg:string)
    {
        if (typeof fn === "string") {
            let m = $path.relative(this._src_path, fn);

            if (typeof line === "number" && line > 0) {
                m += "(" + line;
                if (typeof column === "number" && column > 0) {
                    m += "," + column;
                }
                m += ")";
            }

            if (code) {
                m += ":" + code;
            }

            this.logError(m + ": " + msg);
        } else {
            this.logError(msg);
        }

        this._errors++;
    }
}

export function isUpdateToDate(dstfn:string, ...srcfns:(string|string[]|undefined)[])
{
    const dst_s = file_stat(dstfn);

    if (!dst_s) {
        return false;
    }

    for (const srcfn of srcfns) {
        if (srcfn) {
            if (Array.isArray(srcfn)) {
                for (const sfn of srcfn) {
                    const s = file_stat(sfn);

                    if (!(s && s.mtime.getTime() < dst_s.mtime.getTime())) {
                        return false;
                    }
                }
            } else {
                const s = file_stat(srcfn);

                if (!(s && s.mtime.getTime() < dst_s.mtime.getTime())) {
                    return false;
                }
            }
        }
    }

    return true;
}

export function isGlob(pattern:string)
{
    return /[*?[(]/.test(pattern);
}

export function rename_extension(fn:string, ext:string):string
{
    const i = fn.lastIndexOf(".");
    return (i > 0 ? fn.substring(0, i) : fn) + ext;
}

export function path_join(...args:string[]):string
{
    let i:number;
    let p:string|undefined;

    for (i = args.length - 1 ; i >= 0 ; --i) {
        if (args[i] && $path.isAbsolute(args[i])) {
            p = args[i];
            break;
        }
    }

    if (p === undefined) {
        p = process_cwd;
    }

    for (++i ; i < args.length ; ++i) {
        if (args[i]) {
            p = $path.join(p, args[i]);
        }
    }

    return $path.normalize(p).replace(/[\\]/g, "/");
}

export function file_stat(fn:string)
{
    try {
        return $fs.statSync(fn);
    } catch (e) {
        if (e.code === "ENOENT") {
            return null;
        }

        throw e;
    }
}

export function isFile(fn:string)
{
    try {
        const s = $fs.statSync(fn);
        return s.isFile();
    } catch(e) {
        return false;
    }
}

export function path_make(fn:string)
{
    try {
        $fs.mkdirSync(fn);
    } catch(e) {
        switch(e.code) {
        case "EEXIST":
            return;

        case "ENOENT":
            path_make($path.dirname(fn));

            try {
                $fs.mkdirSync(fn);
            } catch(e2) {
                if (e2.code !== "EEXIST") {
                    throw new Error("Failed to create directory '" + fn + "': " + e2.message);
                }
            }
            return ;

        default:
            throw new Error("Failed to create directory '" + fn + "': " + e.message);
        }
    }

    return;
}

export function touch(fn:string) {
    const s = $fs.statSync(fn);
    $fs.utimesSync(fn, s.atime, new Date());
}

export const readFileAsync = $util.promisify($fs.readFile);

export const writeFileAsync = $util.promisify($fs.writeFile);

export function readTextFileSync(fn:string)
{
    return $fs.readFileSync(fn, { encoding:"utf8" });
}

export function writeTextFileSync(fn:string, data:string, compare?:boolean)
{
    if (compare) {
        try {
            if (data === readTextFileSync(fn)) {
                return ;
            }
        } catch(e) {
        }
    }
    path_make($path.dirname(fn));
    $fs.writeFileSync(fn, data, { encoding:"utf8" });
}

export async function writeTextFileAsync(fn:string, data:string, compare?:boolean)
{
    if (compare) {
        try {
            if (data === await readFileAsync(fn, "utf8")) {
                return ;
            }
        } catch(e) {
        }
    }
    path_make($path.dirname(fn));
    await writeFileAsync(fn, data, { encoding:"utf8" });
}

export async function fileCopyAsync(src_filename:string, dst_filename:string)
{
    path_make($path.dirname(dst_filename));
    await writeFileAsync(dst_filename, await readFileAsync(src_filename, { encoding:null }), { encoding:null });
}

class TargetScan
{
    private     _diagoutput:            boolean;
    private     _file_to_delete:        string[];
    private     _directoies_to_delete:  string[];

    constructor(diagoutput:boolean)
    {
        this._diagoutput           = diagoutput;
        this._file_to_delete       = [];
        this._directoies_to_delete = [];
    }

    public      ScanTree(path:string, dir:ITargetDirectory)
    {
        const dirnames = $fs.readdirSync(path);

        for (const name of dirnames)    {
            const   fullname = path + "/" + name;
            const   s        = file_stat(fullname);
            let     d        = dir[name];

            if (s && s.isDirectory()) {
                if (!d || typeof d === "boolean") {
                    this._directoies_to_delete.push(fullname);
                    d = {};
                }

                this.ScanTree(fullname,  d);
            } else {
                if (!d || typeof d !== "boolean") {
                    this._file_to_delete.push(fullname);
                }
            }
        }
    }

    public      CleanTarget()
    {
        if (this._file_to_delete.length + this._directoies_to_delete.length > 1024) {
            throw new Error("Tomany file to cleanup.");
        }

        for (const name of this._file_to_delete) {
            if (this._diagoutput) {
                console.log(name + ": delete");
            }
            $fs.unlinkSync(name);
        }

        for (let i = this._directoies_to_delete.length - 1 ; i >= 0 ; --i) {
            const name = this._directoies_to_delete[i];
            if (this._diagoutput) {
                console.log(name + ": delete");
            }
            $fs.rmdirSync(name);
        }
    }
}

function item_src(src:string, config:$buildconfig.IBuildItem)
{
    if (config.allow_user_override) {
        if (isFile(src + ".user")) {
            src += ".user";
        }
    }
    return src;
}
