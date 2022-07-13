"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $path = require("path");
const $util = require("../lib/util");
const taskName = "css";
function runAsync(build, config) {
    return build.parallelAsync(build.fileitems(config)
        .filter((item) => {
        build.define_dstfile(item.dstfilename, (build.sourcemap ? item.dstfilename + ".map" : undefined));
        return build.rebuild || !$util.isUpdateToDate(item.dstfilename, item.srcfilename);
    }), async (item) => {
        try {
            build.logBuildFile(taskName, item.dstfilename);
            if (build.release) {
                const cleancss = require("clean-css");
                const sourcedata = await $util.readFileAsync(item.srcfilename, "utf8");
                const result = await new cleancss({
                    returnPromise: true,
                    sourceMap: build.sourcemap,
                    level: {
                        1: {
                            specialComments: "0"
                        },
                        2: {}
                    }
                }).minify(sourcedata);
                if (result.errors && result.errors.length > 0) {
                    throw new Error("css-clean failed: " + result.errors[0]);
                }
                await $util.writeTextFileAsync(item.dstfilename, result.styles);
                if (result.sourceMap) {
                    const map = JSON.parse(result.sourceMap.toString());
                    await $util.writeTextFileAsync(item.dstfilename + ".map", JSON.stringify({
                        version: 3,
                        file: $path.basename(item.dstfilename),
                        sources: [build.sourcemap_map(item.srcfilename)],
                        sourcesContent: (build.sourcemap_inlinesrc ? [sourcedata] : undefined),
                        mappings: map.mappings,
                        names: map.names
                    }));
                }
            }
            else {
                await $util.fileCopyAsync(item.srcfilename, item.dstfilename);
            }
        }
        catch (e) {
            build.logErrorFile(item.srcfilename, 0, 0, undefined, e.message);
        }
    }, 4);
}
exports.runAsync = runAsync;
//# sourceMappingURL=css.js.map