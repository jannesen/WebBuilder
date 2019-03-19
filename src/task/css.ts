import * as $path from "path";
import * as $fs from "fs";
import * as $main from "../main";
import * as $util from "../lib/util";

interface ICSSItem
{
    src:        string;
    dst:        string;
}

export function run(build:$util.Build, config:$main.IBuildCopy[])
{
    const   items:ICSSItem[] = [];

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

            build_css(build, item);
        } catch(e) {
            build.logError("Failed to JS '" + item.src + "' to '" + item.dst + "': " + e.message);
        }
    }
}

function build_css(build:$util.Build, item:ICSSItem)
{
    try {
        build.logBuildFile(item.dst);

        if (build.release) {
            const   $cleanCss  = require("clean-css");
            const   sourcedata = $fs.readFileSync(item.src, "utf8");
            const   opts:any   = {
                                    target:     $path.dirname(item.dst),
                                };

            if (build.sourcemap) {
                opts.sourceMap = true;
            }
            const result = new $cleanCss(opts).minify(sourcedata);

            if (result.errors && result.errors.length > 0) {
                throw new Error("css-clean failed: " + result.errors[0]);
            }

            $util.write_file(item.dst, result.styles);

            if (result.sourceMap) {
                const   map = JSON.parse(result.sourceMap);

                $util.write_file(item.dst + ".map", JSON.stringify({
                                                                        version:        3,
                                                                        file:           $path.basename(item.dst),
                                                                        sources:        [ build.sourcemap_map(item.src) ],
                                                                        sourcesContent: (build.sourcemap_inlinesrc ? [ sourcedata ] : undefined),
                                                                        mappings:       map.mappings,
                                                                        names:          map.names
                                                                    }));
            }
        } else {
            $util.file_copy(item.src, item.dst);
        }
    } catch(e) {
        build.logErrorFile(item.src, 0, 0, undefined, e.message);
    }
}
