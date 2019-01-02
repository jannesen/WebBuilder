import * as $fs from "fs";
import * as $path from "path";
import * as $string_decoder from "string_decoder";
import * as $util from "../lib/util.js";
import * as $task from "./sass";
import * as $nodesass from "node-sass";

export function build_sass(build:$util.Build, item:$task.ISassItem)
{
    try {
        const dstn          = $path.basename(item.dst);
        let cssdata:string  = $fs.readFileSync(item.src, { encoding: "utf8" });
        let sourcemap:any;

        build.logBuildFile(item.dst);

        const sassOptions:$nodesass.Options = {
                                                    file:               item.src,
                                                    data:               cssdata,
                                                    outFile:            dstn,
                                                    outputStyle:        (build.release ? "compressed" : "expanded"),
                                                    indentedSyntax:     false,
                                                    omitSourceMapUrl:   false,
                                                    importer:           (url:string, prev:string, done:(r:any) => void) => {
                                                                            try {
                                                                                if (url.endsWith(".scss")) {
                                                                                    return {
                                                                                        file: url.startsWith("$")
                                                                                            ? build.resolveName(url)
                                                                                            : $util.path_join($path.dirname(prev), url)
                                                                                    };
                                                                                } else {
                                                                                    return url;
                                                                                }
                                                                            } catch (e) {
                                                                                return e;
                                                                            }
                                                                        }
                                              };

        // postcss can't deal with sources maps from sass so disable them.
        if (!build.release && build.sourcemap) {
            sassOptions.sourceMap =         true;
            sassOptions.sourceMapContents = build.sourcemap_inlinesrc;
        }

        const result_sass = require("node-sass").renderSync(sassOptions) as $nodesass.Result;

        item.reference = result_sass.stats.includedFiles.sort();

        cssdata = (new $string_decoder.StringDecoder("utf8")).write(result_sass.css);

        if (result_sass.map) {
            sourcemap = JSON.parse((new $string_decoder.StringDecoder("utf8")).write(result_sass.map));
            sourcemap = {
                version:        3,
                file:           $path.basename(item.dst),
                sources:        sourcemap.sources.map((f:string) => build.sourcemap_map($util.path_join(process.cwd(), f))),
                sourcesContent: (build.sourcemap_inlinesrc ? sourcemap.sourcesContent : undefined),
                mappings:       sourcemap.mappings,
                names:          sourcemap.names
            };
        }

        if (build.release && item.options && item.options.autoprefixer) {
            const $postcss      = require("postcss");
            const $autoprefixer = require("autoprefixer");
            let result_postcss:any;

            result_postcss = $postcss([ $autoprefixer({
                                                        add:      false,
                                                        cascade:  false,
                                                        browsers: []
                                                      }) ])
                             .process(cssdata, {
                                                    to:     dstn,
                                                    map: (sourcemap
                                                            ? {
                                                                    prev:           sourcemap,
                                                                    sourcesContent: Array.isArray(sourcemap.sourcesContent)
                                                              }
                                                            : undefined)
                                               });
            cssdata   = result_postcss.css;
            sourcemap = sourcemap && result_postcss.map;
            result_postcss = $postcss([ $autoprefixer({
                                                        add:      true,
                                                        cascade:  false,
                                                        browsers: item.options.autoprefixer
                                                      }) ])
                             .process(cssdata, {
                                                    to:     dstn,
                                                    map: (sourcemap
                                                            ? {
                                                                    prev:           sourcemap,
                                                                    sourcesContent: Array.isArray(sourcemap.sourcesContent)
                                                              }
                                                            : undefined)
                                               });

            cssdata   = result_postcss.css;
            sourcemap = sourcemap && result_postcss.map;
        }

        $util.write_file(item.dst, cssdata);

        if (sourcemap) {
            $util.write_file(item.dst + ".map", JSON.stringify(sourcemap));
        }
    } catch(e) {
        if (e.file) {
            build.logErrorFile(e.file, e.line, e.column, null, e.message);
        } else {
            build.logErrorFile(item.src, 0, 0, null, e.message);
        }
    }
}
