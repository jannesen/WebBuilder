﻿import * as $lib from "../lib/lib";
import * as $util from "../lib/util";
import * as $workbox from "workbox-build";

const taskName = "workbox";

interface IWorkBoxFile {
    dst: string;
    cache: IFileInfo[];
}

interface IFileInfo {
    fn: string;
    ts: number;
}

export async function runAsync(build:$util.Build, config:$workbox.GenerateSWConfig[]) {
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

        // Set up new state
        const newState = {
            dst: build.dst_path,
            cache: cache_files.map((fn) => ({ fn: fn, ts: $util.file_stat(fn)!.mtime.getTime() }))
        };

        // find workbox files
        const workBoxFiles = build.glob(build.dst_path, [ "*.js", "*.map"]);

        // Check if service worker should be generated again.
        if (!(statemap && $lib.compare_recursive(statemap.get(build.dst_path), newState))) {
            await $workbox.generateSW(config_item).then((val) => {
                for (const url of val.filePaths) {
                    build.define_dstfile(url);
                }
            });
        } else {
            for (const url of workBoxFiles) {
                build.define_dstfile(url);
            }
        }

        state.push(newState);
    }

    build.setState(taskName, state);
}
