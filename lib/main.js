"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeTextFile = exports.build = exports.args = void 0;
const $util = require("./lib/util");
exports.args = new $util.Args();
try {
    if (!exports.args.parse(process.argv)) {
        process.exit(1);
    }
}
catch (e) {
    console.error("Parse args failed.", e);
    process.exit(1);
}
async function build(...buildconfig) {
    try {
        const start = (new Date()).getTime();
        let errors = 0;
        for (const bc of buildconfig) {
            const build = new $util.Build(bc.global);
            for (const name of ["css", "sass", "js", "typescript", "replace", "copy", "appcache", "workbox", "touch"]) {
                if (bc[name]) {
                    await build.runTaskAsync(name, bc[name]);
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
    }
    catch (e) {
        console.error("Build failed.", e);
        process.exit(1);
    }
}
exports.build = build;
function writeTextFile(fn, data) {
    return $util.writeTextFileSync(fn, data, true);
}
exports.writeTextFile = writeTextFile;
//# sourceMappingURL=main.js.map