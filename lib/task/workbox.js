"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $lib = require("../lib/lib");
const $util = require("../lib/util");
const taskName = "workbox";
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
        const ignores = [];
        if (config_item.globIgnores !== null) {
            for (const ignore of config_item.globIgnores) {
                ignores.push("!" + ignore);
            }
        }
        const fullGlob = [...config_item.globPatterns, ...ignores];
        const cache_files = build.glob(build.dst_path, fullGlob);
        const curState = statemap && statemap.get(build.dst_path);
        const newState = {
            dst: build.dst_path,
            output: curState ? curState.output : [],
            cache: cache_files.map((fn) => ({ fn: fn, ts: $util.file_stat(fn).mtime.getTime() }))
        };
        if (!(curState && $lib.compare_recursive(curState, newState))) {
            newState.output = (await (require("workbox-build")).generateSW(config_item)).filePaths;
        }
        for (const url of newState.output) {
            build.define_dstfile(url);
        }
        state.push(newState);
    }
    build.setState(taskName, state);
}
exports.runAsync = runAsync;
//# sourceMappingURL=workbox.js.map