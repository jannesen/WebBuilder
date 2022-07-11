import * as $lib     from "../lib/lib";
import * as $util    from "../lib/util";
import type * as $buildconfig    from "../buildconfig";

const taskName = "workbox";

interface IWorkBoxFile {
    dst: string;
    output: string[];
    cache: IFileInfo[];
}

interface IFileInfo {
    fn: string;
    ts: number;
}

export async function runAsync(build:$util.Build, config:$buildconfig.IWorkbox[]) {
    let statemap:Map<string, IWorkBoxFile> | undefined;

    if (!build.rebuild) {
        statemap = new Map<string, IWorkBoxFile>();
        for (const s of build.getState<IWorkBoxFile>(taskName)) {
            statemap.set(s.dst, s);
        }
    }

    const state:IWorkBoxFile[] = [];

    for (const config_item of config) {
        // Transform globignores to library glob
        const ignores = [];
        if (config_item.globIgnores !== null) {
            for (const ignore of config_item.globIgnores!) {
                ignores.push("!" + ignore);
            }
        }

        // Combine globpatterns and ignores to full list;
        const fullGlob = [...config_item.globPatterns!, ...ignores];

        // Get all files that should be cached.
        const cache_files = build.glob(build.dst_path, fullGlob);

        const curState = statemap && statemap.get(build.dst_path);
        // Set up new state
        const newState = {
            dst: build.dst_path,
            output: curState ? curState.output : [],
            cache: cache_files.map((fn) => ({ fn: fn, ts: $util.file_stat(fn)!.mtime.getTime() }))
        };

        // Check if service worker should be generated again.
        if (!(curState && $lib.compare_recursive(curState, newState))) {
            newState.output = (await (require("workbox-build")).generateSW(config_item)).filePaths;
        }

        // Registrate output files.
        for (const url of newState.output) {
            build.define_dstfile(url);
        }

        state.push(newState);
    }

    build.setState(taskName, state);
}
