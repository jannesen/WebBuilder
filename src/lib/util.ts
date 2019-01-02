import * as $fs from "fs";
import * as $path from "path";
import * as $glob from "glob";
import * as $minimatch from "minimatch";
import * as $main from "../main";

const process_cwd = process.cwd();

interface ITargetDirectory
{
    [fn:string]:    boolean|ITargetDirectory;
}

export interface ISrcTarget
{
    path:       string;
    name:       string;
}

export class Args
{
    private     _rebuild:               boolean;
    private     _release:               boolean;

    public get  rebuild()
    {
        return this._rebuild;
    }
    public get  release()
    {
        return this._release;
    }

    constructor()
    {
        const argv = process.argv;
        for (let i = 2 ; i < argv.length ; ++i) {
            const argn = argv[i].split("=", 2);
            switch(argn[0]) {
            case "--rebuild":       this._rebuild = true;       break;
            case "--release":       this._release = true;       break;
            case "/Configuration":
                switch(argn[1]) {
                case "Debug":       this._release = false;      break;
                case "Release":     this._release = true;       break;
                default:            throw new Error("Invalid configuration option: '" + argn[1] + "'.");
                }
                break;
            default:                throw new Error("Unknown option: '" + argn[0] + "'.");
            }
        }
    }
}

export class Build
{
    private     _rebuild:               boolean;
    private     _release:               boolean;
    private     _lint:                  boolean;
    private     _diagoutput:            boolean;
    private     _paths:                 $main.IPaths;
    private     _src_path:              string;
    private     _dst_path:              string;
    private     _sourcemap_path:        string;
    private     _sourcemap_root:        string;
    private     _sourcemap_inlinesrc:   boolean;
    private     _state_file:            string;
    private     _errors:                number;
    private     _state:                 any;
    private     _curTask:               string;
    private     _targets:               ITargetDirectory;

    public get  rebuild()
    {
        return this._rebuild;
    }
    public get  release()
    {
        return this._release;
    }
    public get  lint()
    {
        return this._lint;
    }
    public get  sourcemap()
    {
        return typeof this._sourcemap_path === "string";
    }
    public get  sourcemap_inlinesrc()
    {
        return this._sourcemap_inlinesrc;
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

                constructor(global:$main.IBuildGlobal)
    {
        this._rebuild              = false;
        this._release              = global.release;
        this._lint                 = global.lint;
        this._diagoutput           = global.diagoutput || false;
        this._paths                = global.paths;
        this._src_path             = path_join(global.src_path);
        this._dst_path             = path_join(global.dst_path);
        this._sourcemap_path       = global.sourcemap_path;
        this._sourcemap_root       = global.sourcemap_root;
        this._sourcemap_inlinesrc  = global.sourcemap_inlinesrc;
        this._state_file           = path_join(global.state_file || (this._dst_path + "/build.state"));
        this._errors               = 0;
        this._state                = {};
        this._targets              = {};

        if ($main.args.rebuild !== undefined)   this._rebuild = $main.args.rebuild;
        if ($main.args.release !== undefined)   this._release = $main.args.release;

        if (this._release    === undefined)                 this._release = false;
        if (this._lint       === undefined)                 this._lint    = this._release;
        if (this._sourcemap_path          )                 this._sourcemap_path = path_join(this._src_path, this._sourcemap_path);
        if (!this._sourcemap_root && this._sourcemap_path)  this._sourcemap_root = "/sources/";
        if (!this._sourcemap_inlinesrc)                     this._sourcemap_inlinesrc = !this._release;

        if (!this._rebuild && this._state_file) {
            try {
                if ($fs.existsSync(this._state_file)) {
                    this._state = JSON.parse($fs.readFileSync(this._state_file, { encoding:"utf8" }));
                }
            } catch(e) {
                console.log("Reading statefile failed: " + e.message);
            }
        }

        if (global.rebuild      ||
            !this._state        ||
            !this._state.global ||
            this._state.global.release        !== this._release        ||
            this._state.global.lint           !== this._lint           ||
            this._state.global.sourcemap_path !== this._sourcemap_path ||
            this._state.global.sourcemap_root !== this._sourcemap_root) {
            console.log("Build: Rebuild");
            this._rebuild = true;
            this._state   = {};
        }

        this._state.global = {
                                release:            this._release,
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

    public      runTask(name:string, config:any)
    {
        this._curTask = name;

        try {
            require("../task/" + name + ".js").run(this, config);
        } catch (e) {
            console.log(this._curTask + " failed: " + e.message);
        }

        this._curTask = undefined;
    }
    public      resolveName(fn:string):string
    {
        if (fn.startsWith("$")) {
            let i = fn.indexOf("/");
            if (i < 0) i = fn.length;
            const n = fn.substring(1, i);
            const p = this._paths && this._paths[n];

            if (typeof p !== "string") {
                throw new Error("Unknown path '$" + n + "'.");
            }

            fn = p + fn.substr(i);
        }

        return path_join(this._src_path, fn);
    }
    public      src(item:$main.IBuildItem)
    {
        return this.src1(item.src_base, item.src, undefined);
    }
    public      src1(base:string, pattern:string|$main.ISrcFilter|(string|$main.ISrcFilter)[], target:string)
    {
        if (typeof pattern === "string") {
            return this.src2(base, pattern, undefined);
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
                const rtn = [] as ISrcTarget[];
                pattern.forEach((p) => {
                                    this.src1(base, p, target).forEach((r) => rtn.push(r));
                                });
                return rtn;
            }

            if (nstr > 0 && nobj === 0) {
                return this.src2(base, pattern as string[], undefined);
            }

            throw new Error("Invalid src.");
        }

        if (pattern instanceof Object) {
            return this.src2((pattern as $main.ISrcFilter).base || base, (pattern as $main.ISrcFilter).pattern, (pattern as $main.ISrcFilter).target);
        }

        throw new Error("Src not defined.");
    }
    public      src2(base:string, pattern:string|string[], target:string):ISrcTarget[]
    {
        let cwd = base ? this.resolveName(base) : this._src_path;
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
                                        if (!name.startsWith(cwd))
                                            throw new Error("'" + name + "' outside base '" + cwd + "'.");

                                        return {
                                                path: name,
                                                name: target + name.substring(cwd.length)
                                              };
                                      });
    }
    public      glob(cwd:string, patterns:string|string[]):string[]
    {
        if (!(typeof patterns === "string" || Array.isArray(patterns)))
            throw new Error("Invalid glob pattern, expect string or array.");

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
    public      dst(item:$main.IBuildItem):string
    {
        if (item.dst !== undefined) {
            if (typeof item.dst !== "string")
                throw new Error("Invalid dst: expect string.");

            return path_join(this._dst_path, item.dst);
        }

        return this._dst_path + "/";
    }
    public      sourcemap_map(srcfn:string):string
    {
        return this._sourcemap_root + $path.relative(this._sourcemap_path, srcfn).replace(/\\/g, "/");
    }
    public      define_dstfile(...dstfns:string[])
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
    public      getState<T>()
    {
        return (this._state[this._curTask] || []) as T[];
    }
    public      setState(state:any)
    {
        this._state[this._curTask] = state;
    }
    public      logBuildFile(fn:string)
    {
        if (this._diagoutput) {
            console.log("Build " + this._curTask + ": " + $path.relative(this._dst_path, fn));
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
    public      logErrorFile(fn:string, line:number, column:number, code:string, msg:string)
    {
        if (typeof fn === "string") {
            let m = $path.relative(this._src_path, fn);

            if (line > 0) {
                m += "(" + line;
                if (column > 0) {
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

export function isUpdateToDate(dstfn:string, ...srcfns:(string|string[])[] )
{
    const dst_s = file_stat(dstfn);

    if (!dst_s)
        return false;

    for (const srcfn of srcfns) {
        if (srcfn) {
            if (Array.isArray(srcfn)) {
                for (const sfn of srcfn) {
                    const s = file_stat(sfn);

                    if (!(s && s.mtime.getTime() < dst_s.mtime.getTime()))
                        return false;
                }
            } else {
                const s = file_stat(srcfn);

                if (!(s && s.mtime.getTime() < dst_s.mtime.getTime()))
                    return false;
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
    let p:string;

    for (i = arguments.length - 1 ; i >= 0 ; --i) {
        if (arguments[i] && ($path as any).isAbsolute(arguments[i])) {
            p = arguments[i];
            break;
        }
    }

    if (p === undefined)
        p = process_cwd;

    for (++i ; i < arguments.length ; ++i) {
        if (arguments[i]) {
            p = $path.join(p, arguments[i]);
        }
    }

    return $path.normalize(p).replace(/[\\]/g, "/");
}

export function file_stat(fn:string)
{
    try {
        return $fs.statSync(fn);
    } catch (e) {
        if (e.code === "ENOENT")
            return null;

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
                if (e2.code !== "EEXIST")
                    throw new Error("Failed to create directory '" + fn + "': " + e2.message);
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

export function write_file(fn:string, data:string, compare?:boolean)
{
    if (compare) {
        try {
            if (data === $fs.readFileSync(fn, "utf8")) {
                return ;
            }
        } catch(e) {
        }
    }
    path_make($path.dirname(fn));
    $fs.writeFileSync(fn, data, { encoding:"utf8" });
}

export function file_copy(src_filename:string, dst_filename:string)
{
    path_make($path.dirname(dst_filename));
    $fs.writeFileSync(dst_filename, $fs.readFileSync(src_filename, { encoding:null }), { encoding:null });
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
