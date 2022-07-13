"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $util = require("../lib/util");
const taskName = "touch";
function runAsync(build, config) {
    for (const fn of build.glob(build.dst_path, config)) {
        build.logBuildFile(taskName, fn);
        $util.touch(fn);
    }
    return Promise.resolve();
}
exports.runAsync = runAsync;
//# sourceMappingURL=touch.js.map