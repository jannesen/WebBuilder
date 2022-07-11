import * as $lib    from "../lib/lib";
import * as $util   from "../lib/util";
import type * as $buildconfig    from "../buildconfig";

const taskName = "replace";

interface IReplaceItem
{
    src:        string;
    dst:        string;
    replace:    $buildconfig.IReplacer[];
}

export async function runAsync(build:$util.Build, config:$buildconfig.IReplace[])
{
    let     curStateMap:Map<string, IReplaceItem>|undefined;
    const   newStates:IReplaceItem[] = [];

    if (!build.rebuild) {
        curStateMap = new Map<string, IReplaceItem>();
        for (const s of build.getState<IReplaceItem>(taskName)) {
            curStateMap.set(s.dst, s);
        }
    }

    await build.parallelAsync(
               build.fileitems(config)
                    .filter((item) =>{
                        build.define_dstfile(item.dstfilename);

                        if (curStateMap) {
                            const curState = curStateMap.get(item.dstfilename);

                            if (curState &&
                                curState.src === item.srcfilename &&
                                $lib.compare_recursive(item.item.replace, curState.replace) &&
                                $util.isUpdateToDate(curState.dst, curState.src)) {
                                newStates.push(curState);
                                return false;
                            }
                        }

                        return true;
                    }),
               async (item) => {
                    try {
                        build.logBuildFile(taskName, item.dstfilename);

                        let data = await $util.readFileAsync(item.srcfilename, "utf8");

                        for (const r of item.item.replace) {
                            while (data.indexOf(r.from) >= 0) {
                                data = data.replace(r.from, r.to);
                            }
                        }

                        await $util.writeTextFileAsync(item.dstfilename, data);

                        newStates.push({
                            src:        item.srcfilename,
                            dst:        item.dstfilename,
                            replace:    item.item.replace
                        });
                    } catch(e) {
                        build.logError("Failed to replace '" + item.srcfilename + "' to '" + item.dstfilename + "': " + e.message);
                    }
               },
               8);

    build.setState(taskName, newStates);
}
