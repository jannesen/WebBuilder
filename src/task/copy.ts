import * as $util   from "../lib/util";
import type * as $buildconfig    from "../buildconfig";

const taskName = "copy";

export function runAsync(build:$util.Build, config:$buildconfig.ICopy[])
{
    return build.parallelAsync(
               build.fileitems(config)
                    .filter((item) => {
                         build.define_dstfile(item.dstfilename);
                         return build.rebuild || !$util.isUpdateToDate(item.dstfilename, item.srcfilename);
                    }),
               async (item) => {
                   try {
                       build.logBuildFile(taskName, item.dstfilename);
                       await $util.fileCopyAsync(item.srcfilename, item.dstfilename);
                    } catch(e) {
                       build.logError("Failed to copy '" + item.srcfilename + "' to '" + item.dstfilename + "': " + e.message);
                    }
               },
               8);
}
