import * as $path from "path";
import * as $util from "../lib/util.js";
import type * as $buildconfig   from "../buildconfig";
import type * as $sass          from "sass";

const taskName = "sass";

export interface ISassItem
{
    src:        string;
    dst:        string;
    reference?: string[];
}

export async function runAsync(build:$util.Build, config:$buildconfig.ISass[])
{
    let     curStateMap:Map<string, ISassItem>|undefined;

    if (!build.rebuild) {
        curStateMap = new Map<string, ISassItem>();
        for (const s of build.getState<ISassItem>(taskName)) {
            curStateMap.set(s.dst, s);
        }
    }

    const   newStates:ISassItem[] = [];

    await build.parallelAsync(
               build.fileitems(config, (targetname) => {
                                   const i = targetname.lastIndexOf('.');
                                   return (i > 0 ? targetname.substring(0, i) : targetname) + '.css';
                                })
                    .filter((item) =>{
                        build.define_dstfile(item.dstfilename, (build.sourcemap ? item.dstfilename + ".map" : undefined));

                        if (curStateMap) {
                            const curState = curStateMap.get(item.dstfilename);

                            if (curState &&
                                curState.src === item.srcfilename &&
                                $util.isUpdateToDate(curState.dst, curState.src, curState.reference)) {
                                newStates.push(curState);
                                return false;
                            }
                        }

                        return true;
                    }),
               async (item) => {
                    try {
                        const sass = require("sass") as typeof $sass;
                        build.logBuildFile(taskName, item.dstfilename);

                        const result_sass = sass.compileString($util.readTextFileSync(item.srcfilename), {
                                  alertAscii:         true,
                                  alertColor:         false,
                                  url:                new URL('file:///' + item.srcfilename),
                                  importer: {
                                      canonicalize: (url: string, _options: {fromImport: boolean}) => {
                                          build.logDebug(taskName, "canonicalize: " + url);

                                          if (url.startsWith('file:///$')) {
                                              url = 'file:///' + build.resolvePathFilename(url.substr(8));
                                          }

                                          if (url.startsWith('file:///')) {
                                              const filename = url.substr(8);
                                              const found = findFile(filename) ||
                                                            findFile(filename + '.scss') ||
                                                            findFile(filename + '.sass') ||
                                                            findFile(filename + '.css');
                                              if (found) {
                                                  return new URL('file:///' + found);
                                              }
                                          }

                                          throw new Error("'Unable to canonicalize '" + url + "'.");

                                          function findFile(filename: string) {
                                              if ($util.isFile(filename)) {
                                                  return filename;
                                              }

                                              {
                                                  const i = filename.lastIndexOf('/') + 1;
                                                  if (i >= 0 && i < filename.length && filename[i] !== '_') {
                                                      const filename_ = filename.substr(0, i) + '_' + filename.substr(i);

                                                      if ($util.isFile(filename_)) {
                                                          return filename_;
                                                      }
                                                  }
                                              }
                                          }
                                      },
                                      load: (canonicalUrl: URL) => {
                                          if (canonicalUrl.href.startsWith('file:///')) {
                                              return {
                                                  contents:       $util.readTextFileSync(canonicalUrl.href.substr(8)),
                                                  syntax:         'scss',
                                                  sourceMapUrl:   canonicalUrl
                                              };
                                          }

                                          throw new Error("'Unable to load '" + canonicalUrl.href + "'.");
                                      }
                                  },
                                  logger: {
                                      warn: (message, options) => {
                                          for (const msg of message.split('\n')) {
                                              if (msg.length > 0 && msg !== 'More info and automated migrator: https://sass-lang.com/d/slash-div') {
                                                  if (options.span && options.span.url) {
                                                      build.logErrorFile(options.span.url.href.substr(8), options.span.start.line + 1, options.span.start.column + 1, undefined, msg);
                                                  }
                                                  else {
                                                      build.logErrorFile(item.srcfilename, undefined, undefined, undefined, msg);
                                                  }
                                              }
                                          }
                                      },
                                      debug: (message, _options) => {
                                        build.logDebug(taskName, message);
                                      }
                                  },
                                  quietDeps:                    false,
                                  sourceMap:                    build.sourcemap,
                                  sourceMapIncludeSources:      false,
                                  style:                        (build.release ? "compressed" : "expanded"),
                                  verbose:                      true
                              });

                        await $util.writeTextFileAsync(item.dstfilename, result_sass.css);

                        if (result_sass.sourceMap) {
                            const map = result_sass.sourceMap;
                            await $util.writeTextFileAsync(item.dstfilename + ".map",
                                                           JSON.stringify({
                                                               version:        map.version,
                                                               file:           $path.basename(item.dstfilename),
                                                               sources:        map.sources.map((f:string) =>  (f.startsWith('file:///') ? build.sourcemap_map($util.path_join(process.cwd(), f.substr(8))) : f)),
                                                               sourcesContent: (build.sourcemap_inlinesrc ? map.sourcesContent : undefined),
                                                               mappings:       map.mappings,
                                                               names:          map.names
                                                           }));
                        }

                        newStates.push({
                                src:        item.srcfilename,
                                dst:        item.dstfilename,
                                reference:  result_sass.loadedUrls.map((f) => f.href.substr(8)).sort()
                            });
                    } catch(e) {
                        for (const msg of e.message.split('\n')) {
                            if (msg.length > 0) {
                                build.logErrorFile(item.srcfilename, undefined, undefined, undefined, msg);
                            }
                        }
                    }
               },
               1);

    build.setState(taskName, newStates);
}

