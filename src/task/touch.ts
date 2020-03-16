import * as $main from "../main";
import * as $util from "../lib/util";

const taskName = "touch";

export async function runAsync(build:$util.Build, config:$main.BuildTouch)
{
    for (const fn of build.glob(build.dst_path, config))    {
        build.logBuildFile(taskName, fn);
        $util.touch(fn);
    }
}
