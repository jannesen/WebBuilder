import * as $path   from "path";
import * as $util   from "../lib/util";
import type * as $buildconfig   from "../buildconfig";
import type * as $terser        from "terser";
import type * as $source_map    from "source-map";

const taskName = "js";

export function runAsync(build:$util.Build, config:$buildconfig.IJs[])
{
    return build.parallelAsync(
               build.fileitems(config)
                    .filter((item) => {
                        build.define_dstfile(item.dstfilename, (build.sourcemap ? item.dstfilename + ".map" : undefined));
                        return build.rebuild || !$util.isUpdateToDate(item.dstfilename, item.srcfilename);
                    }),
               async (item) => {
                   try {
                       build.logBuildFile(taskName, item.dstfilename);

                       if (build.release) {
                           const terser = require("terser") as typeof $terser;
                           const code:{ [file: string]: string } =  { [ build.sourcemap_map(item.srcfilename) ]: await $util.readFileAsync(item.srcfilename, "utf8") };
                           const options:$terser.MinifyOptions = {
                                     compress:  {
                                         drop_debugger: true
                                     },
                                     format: {
                                         comments:      false
                                     }
                                 };

                           if (build.sourcemap) {
                               options.sourceMap = {
                                   url:            $path.basename(item.dstfilename) + ".map",
                                   includeSources: build.sourcemap_inlinesrc
                               };
                           }

                           const result = await terser.minify(code, options);

                           if (typeof result.code !== 'string') {
                               throw new Error('terser did not returned code.');
                           }

                           await $util.writeTextFileAsync(item.dstfilename, result.code);

                           if (result.map) {
                               const map = typeof result.map === 'string' ? JSON.parse(result.map) as $source_map.RawSourceMap : result.map;

                               await $util.writeTextFileAsync(item.dstfilename + ".map",
                                                              JSON.stringify({
                                                                  version:        3,
                                                                  file:           $path.basename(item.dstfilename),
                                                                  sources:        map.sources,
                                                                  sourcesContent: (build.sourcemap_inlinesrc ? map.sourcesContent : undefined),
                                                                  mappings:       map.mappings,
                                                                  names:          map.names
                                                              }));
                           }
                       } else {
                           await $util.fileCopyAsync(item.srcfilename, item.dstfilename);
                       }
                   } catch(e) {
                       build.logErrorFile(item.srcfilename, 0, 0, undefined, e.message);
                   }
               },
               4);
}
