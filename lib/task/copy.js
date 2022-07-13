"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $util = require("../lib/util");
const taskName = "copy";
function runAsync(build, config) {
    return build.parallelAsync(build.fileitems(config)
        .filter((item) => {
        build.define_dstfile(item.dstfilename);
        return build.rebuild || !$util.isUpdateToDate(item.dstfilename, item.srcfilename);
    }), async (item) => {
        try {
            build.logBuildFile(taskName, item.dstfilename);
            await $util.fileCopyAsync(item.srcfilename, item.dstfilename);
        }
        catch (e) {
            build.logError("Failed to copy '" + item.srcfilename + "' to '" + item.dstfilename + "': " + e.message);
        }
    }, 8);
}
exports.runAsync = runAsync;
//# sourceMappingURL=copy.js.map