import * as $util               from "./lib/util";
import type * as $buildconfig   from "./buildconfig";

export const args = new $util.Args();

try {
    if (!args.parse(process.argv)) {
        process.exit(1);
    }
} catch (e) {
    console.error("Parse args failed.", e);
    process.exit(1);
}


export async function build(...buildconfig:$buildconfig.IBuild[])
{
    try {
        const   start  = (new Date()).getTime();
        let     errors = 0;

        for (const bc of buildconfig) {
            const build = new $util.Build(bc.global);

            for(const name of ["css", "sass", "js", "typescript", "replace", "copy", "appcache", "workbox", "touch"]) {
                if ((bc as any)[name]) {
                    await build.runTaskAsync(name, (bc as any)[name]);
                }
            }

            if (build.errors === 0) {
                build.saveState();
                build.checkTarget();
            }

            errors += build.errors;
        }

        console.log("Build: " + (errors ? "failed" : "done") + " in " + (((new Date()).getTime() - start) / 1000.0).toFixed(3).replace(".", ",") + " sec.");
        process.exit(errors > 0 ? 1 : 0);
    } catch(e) {
        console.error("Build failed.", e);
        process.exit(1);
    }
}

export function writeTextFile(fn: string, data: string) {
    return $util.writeTextFileSync(fn, data, true);
}
