import * as $fs from "fs";
import * as $path from "path";
import * as $crypto from "crypto";
import * as $main from "../main";
import * as $lib from "../lib/lib";
import * as $util from "../lib/util";

interface IAppCacheFile
{
    dst:        string;
    cache:      IFileInfo[];
}

interface IFileInfo
{
    fn:     string;
    ts:     number;
}

export function run(build:$util.Build, config:$main.IBuildAppCache[])
{
    let statemap:$lib.Map<IAppCacheFile>;

    if (!build.rebuild) {
        statemap = $lib.createMap<IAppCacheFile>();
        for (const s of build.getState<IAppCacheFile>()) {
            statemap[s.dst] = s;
        }
    }

    const   state:IAppCacheFile[] = [];

    for (const config_item of config) {
        const dst  = $util.path_join(build.dst_path, config_item.dst);
        const cwd  = $path.dirname(dst);
        const cache_files = build.glob(cwd, config_item.cache);

        const   newState = {
                                dst:    dst,
                                cache:  cache_files.map((fn) => ({ fn:fn, ts:$util.file_stat(fn).mtime.getTime() }))
                            };

        build.define_dstfile(dst);

        if (!(statemap && $lib.compare_recursive(statemap[dst], newState))) {
            build.logBuildFile(dst);
            const   md5sum = $crypto.createHash("sha256");

            for (const fn of cache_files) {
                md5sum.update($fs.readFileSync(fn, null));
            }

            const data = "CACHE MANIFEST\n\n" +
                         "CACHE:\n" +
                         cache_files.map((f) => $path.relative(cwd, f).replace(/\\/g, "/")).join("\n") + "\n\n" +
                         "NETWORK:\n" +
                         "*\n\n" +
                         "#HASH: " + md5sum.digest("hex").toUpperCase();

            $util.write_file(dst, data);
        }

        state.push(newState);
    }

    build.setState(state);
}
