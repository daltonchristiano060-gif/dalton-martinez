import { appendFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.env.INIT_CWD || process.cwd();
try {
  appendFileSync(
    join(cwd, "martinez-package-install.log"),
    "my package installed.\n",
    { flag: "a" }
  );
} catch {
  // ignore permissions / read-only cwd, etc.
}
