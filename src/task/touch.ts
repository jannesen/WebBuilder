import * as $util           from "../lib/util";
import type * as $buildconfig    from "../buildconfig";

const taskName = "touch";

export function runAsync(build:$util.Build, config:$buildconfig.Touch)
{
    for (const fn of build.glob(build.dst_path, config)) {
        build.logBuildFile(taskName, fn);
        $util.touch(fn);
    }

    return Promise.resolve();
}
