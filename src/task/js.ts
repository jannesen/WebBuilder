import * as $path from "path";
import * as $fs from "fs";
import * as $main from "../main";
import * as $util from "../lib/util";

interface IJSItem
{
    src:        string;
    dst:        string;
}

export function run(build:$util.Build, config:$main.IBuildCopy[])
{
    const   items:IJSItem[] = [];

    for (const config_item of config) {
        const dst = build.dst(config_item);

        if (dst.endsWith("/")) {
            for (const file of build.src(config_item)) {
                items.push({
                                src: file.path,
                                dst: dst + file.name
                            });
            }
        } else {
            if (typeof config_item.src !== "string" || $util.isGlob(config_item.src)) {
                throw new Error("Invalid dst '" + config_item.dst + "': must by a directory.");
            }

            items.push({
                            src: $util.path_join(build.src_path, config_item.src),
                            dst: dst
                        });
        }
    }

    items.sort((i1, i2) => ( i1.dst < i2.dst ? -1 : i1.dst > i2.dst ? 1 : 0 ) );

    for (const item of items) {
        try {
            build.define_dstfile(item.dst, (build.sourcemap ? item.dst + ".map" : undefined));

            if (!build.rebuild && $util.isUpdateToDate(item.dst, item.src)) {
                continue;
            }

            build_js(build, item);
        } catch(e) {
            build.logError("Failed to JS '" + item.src + "' to '" + item.dst + "': " + e.message);
        }
    }
}

function build_js(build:$util.Build, item:IJSItem)
{
    try {
        build.logBuildFile(item.dst);

        if (build.release) {
            const   sourcedata = $fs.readFileSync(item.src, "utf8");
            const   code:any    = {};   code[ build.sourcemap_map(item.src) ] = sourcedata;
            const   options:any = {
                                    compress:       {
                                                        drop_debugger:  true
                                                    }
                                   };

            if (build.sourcemap) {
                options.sourceMap = {
                    url:            $path.basename(item.dst) + ".map",
                    includeSources: build.sourcemap_inlinesrc
                };
            }

            const result = require("uglify-es").minify(code, options);

            if (result.error) {
                throw new Error(result.error);
            }
            $util.write_file(item.dst, result.code);

            if (result.map) {
                let map = JSON.parse(result.map);

                map = {
                    version:        3,
                    file:           $path.basename(item.dst),
                    sources:        map.sources,
                    sourcesContent: map.sourcesContent,
                    mappings:       map.mappings,
                    names:          map.names
                };

                $util.write_file(item.dst + ".map", JSON.stringify(map));
            }
        } else {
            $util.file_copy(item.src, item.dst);
        }
    } catch(e) {
        build.logErrorFile(item.src, 0, 0, undefined, e.message);
    }
}
