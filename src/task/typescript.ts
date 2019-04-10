import * as $fs from "fs";
import * as $main from "../main";
import * as $lib from "../lib/lib.js";
import * as $util from "../lib/util.js";

interface ITypeScriptStep
{
    items:          ITypeScriptItem[];
    singleFile:     boolean;
    tsconfig:       string|Object|undefined;
    tslint:         string|Object|undefined;
    options:        $main.ITypeScriptOptions|undefined;
}

export interface ITypeScriptItem
{
    src:        string|string[];
    dst:        string;
    reference?: string[];
    options?:   $main.ITypeScriptOptions;
}

export function run(build:$util.Build, config:$main.IBuildTypeScript[]) {
    const   steps:ITypeScriptStep[] = [];

    for (const config_item of config) {
        const dst = build.dst(config_item);

        let tsconfig = config_item.tsconfig;
        let tslint   = config_item.tslint;

        if (tsconfig === undefined) {
            if (!$fs.existsSync(tsconfig = build.src_path + "/tsconfig.json")) {
                tsconfig = undefined;
            }
        } else if (typeof tsconfig === "string") {
            if (!$fs.existsSync(tsconfig = build.src_path + "/" + tsconfig)) {
                throw new Error("Unknown tsconfig '" + tsconfig + "'.");
            }
        } else if (!(tsconfig instanceof Object)) {
            tsconfig = undefined;
        }

        if (tslint === undefined) {
            if (!$fs.existsSync(tslint = build.src_path + "/tslint.json")) {
                tslint = undefined;
            }
        } else if (typeof tslint === "string") {
            if (!$fs.existsSync(tslint = build.src_path + "/" + tslint)) {
                throw new Error("Unknown tslint '" + tslint + "'.");
            }
        } else if (!(tslint instanceof Object)) {
            tslint = undefined;
        }
        if (dst.endsWith("/")) {
            const   items:ITypeScriptItem[] = [];

            for (const file of build.src(config_item)) {
                if (!file.name.endsWith(".d.ts")) {
                    items.push({
                                    src:        file.path,
                                    dst:        $util.rename_extension(dst + file.name, ".js"),
                                    options:    config_item.options
                                });
                }
            }

            if (items.length > 0) {
                steps.push({
                                items:      items,
                                singleFile: false,
                                tsconfig:   tsconfig,
                                tslint:     tslint,
                                options:    config_item.options
                            });
            }
        } else {
            steps.push({
                        items:      [
                                        {
                                            src:        build.src(config_item).map(function(file) { return file.path; } ),
                                            dst:        dst,
                                            options:    config_item.options
                                        }
                                    ],
                        singleFile: true,
                        options:    config_item.options,
                        tsconfig:   tsconfig,
                        tslint:     tslint
                    });
        }
    }

    let statemap:Map<string, ITypeScriptItem>|undefined;

    if (!build.rebuild) {
        statemap = new Map<string, ITypeScriptItem>();

        for (const s of build.getState<ITypeScriptItem>()) {
            statemap.set(s.dst, s);
        }
    }

    const   state:ITypeScriptItem[] = [];

    for (const step of steps) {
        const   items:ITypeScriptItem[] = [];

        for (const item of step.items) {
            build.define_dstfile(item.dst,
                                  (build.sourcemap                          ? item.dst + ".map"                         : undefined),
                                  (item.options && item.options.declaration ? $util.rename_extension(item.dst, ".d.ts") : undefined));

            if (statemap) {
                const s = statemap.get(item.dst);

                if (s && s.dst === item.dst &&
                    $lib.compare_recursive(s.src, item.src) &&
                    $lib.compare_recursive(s.options, item.options) &&
                    $util.isUpdateToDate(item.dst, item.src, s.reference, (typeof step.tsconfig === "string" ? step.tsconfig : undefined)))
                {
                    state.push(s);
                    continue;
                }
            }

            items.push(item);
        }

        if (items.length > 0) {
            require("./typescript-build").build_typescript(build, step.tsconfig, step.tslint, step.options, items, step.singleFile);

            for (const item of items) {
                state.push(item);
            }
        }
    }

    build.setState(state);
}
