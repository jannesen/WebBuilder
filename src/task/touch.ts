import * as $main from "../main";
import * as $util from "../lib/util";

export function run(build:$util.Build, config:$main.BuildTouch)
{
    for (const fn of build.glob(build.dst_path, config))    {
        build.logBuildFile(fn);
        $util.touch(fn);
    }
}
