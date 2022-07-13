"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileCopyAsync = exports.writeTextFileAsync = exports.writeTextFileSync = exports.readTextFileSync = exports.writeFileAsync = exports.readFileAsync = exports.touch = exports.path_make = exports.isFile = exports.file_stat = exports.path_join = exports.rename_extension = exports.isGlob = exports.isUpdateToDate = exports.Build = exports.Args = void 0;
const $fs = require("fs");
const $util = require("util");
const $path = require("path");
const $glob = require("glob");
const $minimatch = require("minimatch");
const $main = require("../main");
const process_cwd = process.cwd();
class Args {
    get rebuild() {
        return this._rebuild;
    }
    get release() {
        return this._release;
    }
    get flavor() {
        return this._flavor;
    }
    get diagoutput() {
        return this._diagoutput;
    }
    parse(argv) {
        for (let i = 2; i < argv.length; ++i) {
            const argn = argv[i].split("=", 2);
            switch (argn[0]) {
                case "--rebuild":
                    this._rebuild = true;
                    break;
                case "--release":
                    this._release = true;
                    break;
                case "--diagoutput":
                    this._diagoutput = true;
                    break;
                case "/Configuration":
                    {
                        let c = argn[1];
                        const s = c.indexOf("-");
                        if (s >= 0) {
                            this._flavor = c.substr(0, s);
                            c = c.substr(s + 1);
                        }
                        switch (c) {
                            case "Debug":
                                this._release = false;
                                break;
                            case "Release":
                                this._release = true;
                                break;
                            default: throw new Error("Invalid configuration option: '" + argn[1] + "'.");
                        }
                    }
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
exports.Args = Args;
class Build {
    constructor(global) {
        let rebuild = false;
        let release = global.release;
        let flavor = global.flavor;
        let lint = global.lint;
        let diagoutput = global.diagoutput || false;
        let sourcemap_path = global.sourcemap_path;
        let sourcemap_root = global.sourcemap_root;
        let sourcemap_inlinesrc = global.sourcemap_inlinesrc;
        this._root_path = path_join(global.root_path);
        ;
        this._src_path = path_join(this._root_path, global.src_path);
        this._dst_path = path_join(this._root_path, global.dst_path);
        this._state_file = path_join(this._root_path, global.state_file || (this._dst_path + "/build.state"));
        this._errors = 0;
        this._state = {};
        this._targets = {};
        if ($main.args.rebuild !== undefined)
            rebuild = $main.args.rebuild;
        if ($main.args.release !== undefined)
            release = $main.args.release;
        if ($main.args.flavor !== undefined)
            flavor = $main.args.flavor;
        if ($main.args.diagoutput !== undefined)
            diagoutput = $main.args.diagoutput;
        if (release === undefined)
            release = false;
        if (lint === undefined)
            lint = release;
        if (flavor === undefined)
            flavor = "";
        if (sourcemap_path)
            sourcemap_path = path_join(this._src_path, sourcemap_path);
        if (!sourcemap_root && sourcemap_path)
            sourcemap_root = "/sources/";
        if (!sourcemap_inlinesrc)
            sourcemap_inlinesrc = !release;
        this._rebuild = rebuild;
        this._release = release;
        this._flavor = flavor;
        this._lint = lint;
        this._diagoutput = diagoutput;
        this._paths = {};
        for (const n in global.paths) {
            this._paths[n] = path_join(this._root_path, global.paths[n]);
        }
        this._sourcemap_path = sourcemap_path;
        this._sourcemap_root = sourcemap_root;
        this._sourcemap_inlinesrc = sourcemap_inlinesrc;
        if (!this._rebuild && this._state_file) {
            try {
                if ($fs.existsSync(this._state_file)) {
                    this._state = JSON.parse($fs.readFileSync(this._state_file, { encoding: "utf8" }));
                }
            }
            catch (e) {
                console.log("Reading statefile failed: " + e.message);
            }
        }
        if (global.rebuild ||
            !this._state ||
            !this._state.global ||
            this._state.global.release !== this._release ||
            this._state.global.flavor !== this._flavor ||
            this._state.global.lint !== this._lint ||
            this._state.global.sourcemap_path !== this._sourcemap_path ||
            this._state.global.sourcemap_root !== this._sourcemap_root) {
            console.log("Build: Rebuild");
            this._rebuild = true;
            this._state = {};
        }
        this._state.global = {
            release: this._release,
            flavor: this._flavor,
            lint: this._lint,
            sourcemap_path: this._sourcemap_path,
            sourcemap_root: this._sourcemap_root
        };
    }
    get rebuild() {
        return this._rebuild;
    }
    get release() {
        return this._release;
    }
    get flavor() {
        return this._flavor;
    }
    get lint() {
        return this._lint;
    }
    get diagoutput() {
        return this._diagoutput;
    }
    get sourcemap() {
        return typeof this._sourcemap_path === "string";
    }
    get sourcemap_inlinesrc() {
        return this._sourcemap_inlinesrc;
    }
    get root_path() {
        return this._root_path;
    }
    get src_path() {
        return this._src_path;
    }
    get dst_path() {
        return this._dst_path;
    }
    get errors() {
        return this._errors;
    }
    checkTarget() {
        try {
            const scan = new TargetScan(this._diagoutput);
            scan.ScanTree(this.dst_path, this._targets);
            scan.CleanTarget();
        }
        catch (e) {
            console.log("Cleanup of target failed.: " + e.message);
        }
    }
    saveState() {
        if (this._state_file) {
            try {
                this.define_dstfile(this._state_file);
                path_make($path.dirname(this._state_file));
                $fs.writeFileSync(this._state_file, JSON.stringify(this._state), { encoding: "utf8" });
            }
            catch (e) {
                console.log("Writing statefile failed: " + e.message);
            }
        }
    }
    async runTaskAsync(name, config) {
        try {
            await require("../task/" + name + ".js").runAsync(this, config);
        }
        catch (e) {
            console.log(name + " failed: " + e.message);
        }
    }
    parallelAsync(items, handler, nparallel) {
        const self = this;
        if (items.length === 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const itemStatus = (new Array(items.length)).fill(0);
            let ndone = 0;
            let nstarted = 0;
            while (nstarted < items.length && nstarted < nparallel) {
                start(nstarted++);
            }
            function start(n) {
                itemStatus[n] = 1;
                handler(items[n]).then(() => {
                    done(n, 2);
                }, (err) => {
                    self.logError(items[n].srcfilename + ": build handler failer: " + err.message);
                    done(n, 3);
                });
            }
            function done(n, result) {
                if (itemStatus[n] === 1) {
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
    resolvePath(path, fn) {
        if (fn.startsWith("$")) {
            return this.resolvePathFilename(fn);
        }
        return path_join(path, fn);
    }
    resolvePathFilename(pathfn) {
        let i = pathfn.indexOf("/");
        if (i < 0)
            i = pathfn.length;
        const n = pathfn.substring(1, i);
        const p = this._paths && this._paths[n];
        if (typeof p !== "string") {
            throw new Error("Unknown path '$" + n + "'.");
        }
        return p + pathfn.substr(i);
    }
    fileitems(items, targetrename) {
        const rtn = [];
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
                        targetname: targetname,
                        item: item
                    });
                }
            }
            else {
                if (typeof item.src !== "string" || isGlob(item.src)) {
                    throw new Error("Invalid dst '" + item.dst + "': must by a directory.");
                }
                rtn.push({
                    srcfilename: item_src(path_join(this.src_path, item.src), item),
                    dstfilename: dst,
                    targetname: dst,
                    item: item
                });
            }
        }
        rtn.sort((i1, i2) => (i1.dstfilename < i2.dstfilename ? -1 : i1.dstfilename > i2.dstfilename ? 1 : 0));
        return rtn;
    }
    src(path, item) {
        return this.src1(path, undefined, item.src, undefined);
    }
    src1(path, base, pattern, target) {
        if (typeof pattern === "string") {
            return this.src2(path, base, pattern, undefined);
        }
        if (Array.isArray(pattern)) {
            let nobj = 0;
            let nstr = 0;
            for (const p of pattern) {
                if (typeof p === "string") {
                    nstr++;
                }
                else if (p instanceof Object) {
                    nobj++;
                }
                else {
                    throw new Error("Invalid src.");
                }
            }
            if (nobj > 0 && nstr === 0) {
                const rtn = [];
                pattern.forEach((p) => {
                    this.src1(path, base, p, target).forEach((r) => rtn.push(r));
                });
                return rtn;
            }
            if (nstr > 0 && nobj === 0) {
                return this.src2(path, base, pattern, undefined);
            }
            throw new Error("Invalid src.");
        }
        if (pattern instanceof Object) {
            return this.src2(path, pattern.base, pattern.pattern, pattern.target);
        }
        throw new Error("Src not defined.");
    }
    src2(path, base, pattern, target) {
        let cwd = base ? this.resolvePath(path, base) : path;
        if (!cwd.endsWith("/")) {
            cwd += "/";
        }
        if (typeof target === "string") {
            if (!target.endsWith("/")) {
                target += "/";
            }
        }
        else {
            target = "";
        }
        return this.glob(cwd, pattern).map((name) => {
            if (!name.startsWith(cwd)) {
                throw new Error("'" + name + "' outside base '" + cwd + "'.");
            }
            return {
                srcpath: name,
                targetname: target + name.substring(cwd.length)
            };
        });
    }
    glob(cwd, patterns) {
        if (!(typeof patterns === "string" || Array.isArray(patterns))) {
            throw new Error("Invalid glob pattern, expect string or array.");
        }
        if (cwd.endsWith("/") || cwd.endsWith("\\")) {
            cwd = cwd.substring(0, cwd.length - 1);
        }
        const options = {
            cwd,
            absolute: true
        };
        let files = [];
        patterns = Array.isArray(patterns) ? patterns : [patterns];
        for (let pattern of patterns) {
            if (typeof pattern === "string") {
                if (pattern[0] === "!") {
                    for (let i = files.length - 1; i >= 0; --i) {
                        if ($minimatch($path.relative(cwd, files[i]).replace(/\\/g, "/"), pattern.substring(1))) {
                            files.splice(i, 1);
                        }
                    }
                }
                else {
                    if (isGlob(pattern)) {
                        const newList = $glob.sync(pattern, options);
                        if (files.length > 0) {
                            newList.forEach((item) => {
                                if (files.indexOf(item) === -1) {
                                    files.push(item);
                                }
                            });
                        }
                        else {
                            files = newList;
                        }
                    }
                    else {
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
    dst(item) {
        if (item.dst !== undefined) {
            if (typeof item.dst !== "string") {
                throw new Error("Invalid dst: expect string.");
            }
            return path_join(this._dst_path, item.dst);
        }
        return this._dst_path + "/";
    }
    sourcemap_map(srcfn) {
        return this._sourcemap_root + $path.relative(this._sourcemap_path, srcfn).replace(/\\/g, "/");
    }
    define_dstfile(...dstfns) {
        for (const dstfn of dstfns) {
            if (typeof dstfn === "string" && dstfn.startsWith(this._dst_path)) {
                const fparts = dstfn.substring(this._dst_path.length + 1).replace(/\\/g, "/").split("/");
                let targetdir = this._targets;
                for (let i = 0; i < fparts.length - 1; ++i) {
                    let f = targetdir[fparts[i]];
                    if (f) {
                        if (typeof f === "boolean") {
                            throw new Error("Target '" + dstfn + "' already defined.");
                        }
                    }
                    else {
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
    getState(name) {
        return (this._state[name] || []);
    }
    setState(name, state) {
        this._state[name] = state;
    }
    logDebug(name, msg) {
        if (this._diagoutput) {
            console.log("Debug " + name + ": " + msg);
        }
    }
    logBuildFile(name, fn) {
        if (this._diagoutput) {
            console.log("Build " + name + ": " + $path.relative(this._dst_path, fn));
        }
    }
    logWarning(msg) {
        console.log(msg);
    }
    logError(msg) {
        console.log(msg);
        this._errors++;
    }
    logErrorFile(fn, line, column, code, msg) {
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
        }
        else {
            this.logError(msg);
        }
        this._errors++;
    }
}
exports.Build = Build;
function isUpdateToDate(dstfn, ...srcfns) {
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
            }
            else {
                const s = file_stat(srcfn);
                if (!(s && s.mtime.getTime() < dst_s.mtime.getTime())) {
                    return false;
                }
            }
        }
    }
    return true;
}
exports.isUpdateToDate = isUpdateToDate;
function isGlob(pattern) {
    return /[*?[(]/.test(pattern);
}
exports.isGlob = isGlob;
function rename_extension(fn, ext) {
    const i = fn.lastIndexOf(".");
    return (i > 0 ? fn.substring(0, i) : fn) + ext;
}
exports.rename_extension = rename_extension;
function path_join(...args) {
    let i;
    let p;
    for (i = args.length - 1; i >= 0; --i) {
        if (args[i] && $path.isAbsolute(args[i])) {
            p = args[i];
            break;
        }
    }
    if (p === undefined) {
        p = process_cwd;
    }
    for (++i; i < args.length; ++i) {
        if (args[i]) {
            p = $path.join(p, args[i]);
        }
    }
    return $path.normalize(p).replace(/[\\]/g, "/");
}
exports.path_join = path_join;
function file_stat(fn) {
    try {
        return $fs.statSync(fn);
    }
    catch (e) {
        if (e.code === "ENOENT") {
            return null;
        }
        throw e;
    }
}
exports.file_stat = file_stat;
function isFile(fn) {
    try {
        const s = $fs.statSync(fn);
        return s.isFile();
    }
    catch (e) {
        return false;
    }
}
exports.isFile = isFile;
function path_make(fn) {
    try {
        $fs.mkdirSync(fn);
    }
    catch (e) {
        switch (e.code) {
            case "EEXIST":
                return;
            case "ENOENT":
                path_make($path.dirname(fn));
                try {
                    $fs.mkdirSync(fn);
                }
                catch (e2) {
                    if (e2.code !== "EEXIST") {
                        throw new Error("Failed to create directory '" + fn + "': " + e2.message);
                    }
                }
                return;
            default:
                throw new Error("Failed to create directory '" + fn + "': " + e.message);
        }
    }
    return;
}
exports.path_make = path_make;
function touch(fn) {
    const s = $fs.statSync(fn);
    $fs.utimesSync(fn, s.atime, new Date());
}
exports.touch = touch;
exports.readFileAsync = $util.promisify($fs.readFile);
exports.writeFileAsync = $util.promisify($fs.writeFile);
function readTextFileSync(fn) {
    return $fs.readFileSync(fn, { encoding: "utf8" });
}
exports.readTextFileSync = readTextFileSync;
function writeTextFileSync(fn, data, compare) {
    if (compare) {
        try {
            if (data === readTextFileSync(fn)) {
                return;
            }
        }
        catch (e) {
        }
    }
    path_make($path.dirname(fn));
    $fs.writeFileSync(fn, data, { encoding: "utf8" });
}
exports.writeTextFileSync = writeTextFileSync;
async function writeTextFileAsync(fn, data, compare) {
    if (compare) {
        try {
            if (data === await (0, exports.readFileAsync)(fn, "utf8")) {
                return;
            }
        }
        catch (e) {
        }
    }
    path_make($path.dirname(fn));
    await (0, exports.writeFileAsync)(fn, data, { encoding: "utf8" });
}
exports.writeTextFileAsync = writeTextFileAsync;
async function fileCopyAsync(src_filename, dst_filename) {
    path_make($path.dirname(dst_filename));
    await (0, exports.writeFileAsync)(dst_filename, await (0, exports.readFileAsync)(src_filename, { encoding: null }), { encoding: null });
}
exports.fileCopyAsync = fileCopyAsync;
class TargetScan {
    constructor(diagoutput) {
        this._diagoutput = diagoutput;
        this._file_to_delete = [];
        this._directoies_to_delete = [];
    }
    ScanTree(path, dir) {
        const dirnames = $fs.readdirSync(path);
        for (const name of dirnames) {
            const fullname = path + "/" + name;
            const s = file_stat(fullname);
            let d = dir[name];
            if (s && s.isDirectory()) {
                if (!d || typeof d === "boolean") {
                    this._directoies_to_delete.push(fullname);
                    d = {};
                }
                this.ScanTree(fullname, d);
            }
            else {
                if (!d || typeof d !== "boolean") {
                    this._file_to_delete.push(fullname);
                }
            }
        }
    }
    CleanTarget() {
        if (this._file_to_delete.length + this._directoies_to_delete.length > 1024) {
            throw new Error("Tomany file to cleanup.");
        }
        for (const name of this._file_to_delete) {
            if (this._diagoutput) {
                console.log(name + ": delete");
            }
            $fs.unlinkSync(name);
        }
        for (let i = this._directoies_to_delete.length - 1; i >= 0; --i) {
            const name = this._directoies_to_delete[i];
            if (this._diagoutput) {
                console.log(name + ": delete");
            }
            $fs.rmdirSync(name);
        }
    }
}
function item_src(src, config) {
    if (config.allow_user_override) {
        if (isFile(src + ".user")) {
            src += ".user";
        }
    }
    return src;
}
//# sourceMappingURL=util.js.map