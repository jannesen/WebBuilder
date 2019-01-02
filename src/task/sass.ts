import * as $main from "../main";
import * as $lib from "../lib/lib.js";
import * as $util from "../lib/util.js";

export interface ISassItem
{
    src:        string;
    dst:        string;
    reference?: string[];
    options:    $main.ISassOptions;
}

export function run(build:$util.Build, config:$main.IBuildSass[]) {
    const   items:ISassItem[] = [];

    for (const config_item of config) {
        const dst = build.dst(config_item);

        if (dst.endsWith("/")) {
            for (const file of build.src(config_item)) {
                items.push({
                                src:     file.path,
                                dst:     $util.rename_extension(dst + file.name, ".css"),
                                options: config_item.options
                            });
            }
        } else {
            if (typeof config_item.src !== "string" || $util.isGlob(config_item.src)) {
                throw new Error("Invalid dst '" + config_item.dst + "': must by a directory.");
            }

            items.push({
                            src:     config_item.src,
                            dst:     dst,
                            options: config_item.options
                        });
        }
    }

    items.sort((i1, i2) => ( i1.dst < i2.dst ? -1 : i1.dst > i2.dst ? 1 : 0 ) );

    let statemap:$lib.Map<ISassItem>;

    if (!build.rebuild) {
        statemap = $lib.createMap<ISassItem>();
        for (const s of build.getState<ISassItem>()) {
            statemap[s.dst] = s;
        }
    }

    const   state:ISassItem[] = [];

    for (const item of items) {
        build.define_dstfile(item.dst, (build.sourcemap && !build.release ? item.dst + ".map" : undefined));

        if (statemap) {
            const s = statemap[item.dst];

            if (s && s.src[0] === item.src[0] && $lib.compare_recursive(item.options, s.options) && $util.isUpdateToDate(s.dst, s.src, s.reference)) {
                state.push(s);
                continue;
            }
        }

        require("./sass-build").build_sass(build, item);
        state.push(item);
    }

    build.setState(state);
}
