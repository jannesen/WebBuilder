"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $lib = require("../lib/lib");
const $util = require("../lib/util");
const taskName = "replace";
async function runAsync(build, config) {
    let curStateMap;
    const newStates = [];
    if (!build.rebuild) {
        curStateMap = new Map();
        for (const s of build.getState(taskName)) {
            curStateMap.set(s.dst, s);
        }
    }
    await build.parallelAsync(build.fileitems(config)
        .filter((item) => {
        build.define_dstfile(item.dstfilename);
        if (curStateMap) {
            const curState = curStateMap.get(item.dstfilename);
            if (curState &&
                curState.src === item.srcfilename &&
                $lib.compare_recursive(item.item.replace, curState.replace) &&
                $util.isUpdateToDate(curState.dst, curState.src)) {
                newStates.push(curState);
                return false;
            }
        }
        return true;
    }), async (item) => {
        try {
            build.logBuildFile(taskName, item.dstfilename);
            let data = await $util.readFileAsync(item.srcfilename, "utf8");
            for (const r of item.item.replace) {
                while (data.indexOf(r.from) >= 0) {
                    data = data.replace(r.from, r.to);
                }
            }
            await $util.writeTextFileAsync(item.dstfilename, data);
            newStates.push({
                src: item.srcfilename,
                dst: item.dstfilename,
                replace: item.item.replace
            });
        }
        catch (e) {
            build.logError("Failed to replace '" + item.srcfilename + "' to '" + item.dstfilename + "': " + e.message);
        }
    }, 8);
    build.setState(taskName, newStates);
}
exports.runAsync = runAsync;
//# sourceMappingURL=replace.js.map