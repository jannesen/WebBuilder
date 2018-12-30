import * as $path from "path";
import * as $main from "../main";
import * as $util from "../lib/util";

interface ICopyItem
{
    src:        string;
    dst:        string;
}

export function run(build:$util.Build, config:$main.IBuildCopy[])
{
    const   items:ICopyItem[] = [];

    for (const config_item of config) {
        const dst = build.dst(config_item);

        if (dst.endsWith("/")) {
            for (const file of build.src(config_item)) {
                items.push({
                                src: item_src(file.path, config_item),
                                dst: item_rename(config_item.rename, dst + file.name)
                            });
            }
        } else {
            if (typeof config_item.src !== "string" || $util.isGlob(config_item.src)) {
                throw new Error("Invalid dst '" + config_item.dst + "': must by a directory.");
            }

            items.push({
                            src: item_src($util.path_join(build.src_path, config_item.src), config_item),
                            dst: dst
                        });
        }
    }

    items.sort((i1, i2) => ( i1.dst < i2.dst ? -1 : i1.dst > i2.dst ? 1 : 0 ) );

    for (const item of items) {
        try {
            build.define_dstfile(item.dst);

            if (!build.rebuild && $util.isUpdateToDate(item.dst, item.src)) {
                continue;
            }

            build.logBuildFile(item.dst);
            $util.file_copy(item.src, item.dst);
        } catch(e) {
            build.logError("Failed to copy '" + item.src + "' to '" + item.dst + "': " + e.message);
        }
    }
}

function item_src(src:string, config:$main.IBuildCopy)
{
    if (config.allow_user) {
        if ($util.isFile(src + ".user")) {
            src += ".user";
        }
    }
    return src;
}

function item_rename(r:$main.ICopyRename, n:string):string
{
    if (r) {
        const extname  = $path.extname(n);
        const parts = {
                        dirname:   $path.dirname(n),
                        basename:  $path.basename(n, extname),
                        extname:   extname
                    };

        [ "dirname", "basename", "extname" ]
            .forEach((p) =>
            {
                const f = ((r as any)[p] as $main.CopyRenamer);

                if (typeof f === "string") {
                    (parts as any)[p] = f;
                } else if (typeof f === "function") {
                    (parts as any)[p] = f((parts as any)[p]);

                    if (typeof (parts as any)[p] !== "string") {
                        throw new Error("Invalid return from rename function.");
                    }
                }
            });

        n = parts.dirname + "/" + parts.basename + parts.extname;
    }

    return n;
}
