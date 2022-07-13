"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAsync = void 0;
const $path = require("path");
const $util = require("../lib/util");
const taskName = "js";
function runAsync(build, config) {
    return build.parallelAsync(build.fileitems(config)
        .filter((item) => {
        build.define_dstfile(item.dstfilename, (build.sourcemap ? item.dstfilename + ".map" : undefined));
        return build.rebuild || !$util.isUpdateToDate(item.dstfilename, item.srcfilename);
    }), async (item) => {
        try {
            build.logBuildFile(taskName, item.dstfilename);
            if (build.release) {
                const terser = require("terser");
                const code = { [build.sourcemap_map(item.srcfilename)]: await $util.readFileAsync(item.srcfilename, "utf8") };
                const options = {
                    compress: {
                        drop_debugger: true
                    },
                    format: {
                        comments: false
                    }
                };
                if (build.sourcemap) {
                    options.sourceMap = {
                        url: $path.basename(item.dstfilename) + ".map",
                        includeSources: build.sourcemap_inlinesrc
                    };
                }
                const result = await terser.minify(code, options);
                if (typeof result.code !== 'string') {
                    throw new Error('terser did not returned code.');
                }
                await $util.writeTextFileAsync(item.dstfilename, result.code);
                if (result.map) {
                    const map = typeof result.map === 'string' ? JSON.parse(result.map) : result.map;
                    await $util.writeTextFileAsync(item.dstfilename + ".map", JSON.stringify({
                        version: 3,
                        file: $path.basename(item.dstfilename),
                        sources: map.sources,
                        sourcesContent: (build.sourcemap_inlinesrc ? map.sourcesContent : undefined),
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
//# sourceMappingURL=js.js.map