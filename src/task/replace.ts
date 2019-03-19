import * as $fs from "fs";
import * as $main from "../main";
import * as $lib from "../lib/lib";
import * as $util from "../lib/util";

interface IReplaceItem
{
    src:        string;
    dst:        string;
    replace:    $main.IReplacer[];
}

export function run(build:$util.Build, config:$main.IBuildReplace[])
{
    const   items:IReplaceItem[] = [];

    for (const config_item of config) {
        if (!Array.isArray(config_item.replace))
            throw new Error("Invalid replace: missing array.");

        const dst = build.dst(config_item);

        if (dst.endsWith("/")) {
            for (const file of build.src(config_item)) {
                items.push({
                                src:        file.path,
                                dst:        dst + file.name,
                                replace:    config_item.replace
                        });
            }
        } else {
            if (typeof config_item.src !== "string" || $util.isGlob(config_item.src)) {
                throw new Error("Invalid dst '" + config_item.dst + "': must by a directory.");
            }

            items.push({
                            src:        $util.path_join(build.src_path, config_item.src),
                            dst:        dst,
                            replace:    config_item.replace
                        });
        }
    }

    items.sort((i1, i2) => ( i1.dst < i2.dst ? -1 : i1.dst > i2.dst ? 1 : 0 ) );

    let statemap:$lib.Map<IReplaceItem>|undefined;

    if (!build.rebuild) {
        statemap = $lib.createMap<IReplaceItem>();
        for (const s of build.getState<IReplaceItem>()) {
            statemap[s.dst] = s;
        }
    }

    const   state:IReplaceItem[] = [];

    for (const item of items) {
        try {
            build.define_dstfile(item.dst);

            if (statemap) {
                const s = statemap[item.dst];

                if (s && s.src[0] === item.src[0] && $lib.compare_recursive(item.replace, s.replace) && $util.isUpdateToDate(s.dst, s.src)) {
                    state.push(s);
                    continue;
                }
            }

            build_replace(build, item);
            state.push(item);
        } catch(e) {
            build.logError("Failed to replace '" + item.src + "' to '" + item.dst + "': " + e.message);
        }
    }

    build.setState(state);
}

function build_replace(build:$util.Build, item:IReplaceItem)
{
    build.logBuildFile(item.dst);

    let data = $fs.readFileSync(item.src, "utf8");

    for (const r of item.replace) {
        while (data.indexOf(r.from) >= 0) {
            data = data.replace(r.from, r.to);
        }
    }
    $util.write_file(item.dst, data);
}
