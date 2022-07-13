"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $fs = require("fs");
const $path = require("path");
const $crypto = require("crypto");
const $lib = require("../lib/lib");
const $util = require("../lib/util");
const taskName = "appcache";
async function runAsync(build, config) {
    let statemap;
    if (!build.rebuild) {
        statemap = new Map();
        for (const s of build.getState(taskName)) {
            statemap.set(s.dst, s);
        }
    }
    const state = [];
    for (const config_item of config) {
        const dst = $util.path_join(build.dst_path, config_item.dst);
        const cwd = $path.dirname(dst);
        const cache_files = build.glob(cwd, config_item.cache);
        const newState = {
            dst: dst,
            cache: cache_files.map((fn) => ({ fn: fn, ts: $util.file_stat(fn).mtime.getTime() }))
        };
        build.define_dstfile(dst);
        if (!(statemap && $lib.compare_recursive(statemap.get(dst), newState))) {
            build.logBuildFile(taskName, dst);
            const md5sum = $crypto.createHash("sha256");
            for (const fn of cache_files) {
                md5sum.update($fs.readFileSync(fn, null));
            }
            const data = "CACHE MANIFEST\n\n" +
                "CACHE:\n" +
                cache_files.map((f) => $path.relative(cwd, f).replace(/\\/g, "/")).join("\n") + "\n\n" +
                "NETWORK:\n" +
                "*\n\n" +
                "#HASH: " + md5sum.digest("hex").toUpperCase();
            await $util.writeFileAsync(dst, data);
        }
        state.push(newState);
    }
    build.setState(taskName, state);
}
exports.runAsync = runAsync;
//# sourceMappingURL=appcache.js.map