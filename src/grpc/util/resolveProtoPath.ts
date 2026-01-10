import fs from "fs";
import path from "path";

function findUpProto(filename: string, startDir: string): string | null {
  let dir = startDir;
  let safety = 0;
  while (dir && safety < 10) {
    const candidate = path.join(dir, "protos", filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    safety++;
  }
  return null;
}

export function resolveProtoPath(filename: string, envOverride?: string): { path: string | null; tried: string[] } {
  const tried: string[] = [];

  if (envOverride) {
    tried.push(envOverride);
    if (fs.existsSync(envOverride)) return { path: envOverride, tried };
  }

  const fromCwd = path.resolve(process.cwd(), "protos", filename);
  tried.push(fromCwd);
  if (fs.existsSync(fromCwd)) return { path: fromCwd, tried };

  const upFromCwd = findUpProto(filename, process.cwd());
  if (upFromCwd) return { path: upFromCwd, tried };

  const fromHere = path.resolve(__dirname, "../../../protos", filename);
  tried.push(fromHere);
  if (fs.existsSync(fromHere)) return { path: fromHere, tried };

  const upFromHere = findUpProto(filename, path.resolve(__dirname, "../../../"));
  if (upFromHere) return { path: upFromHere, tried };

  const local = path.resolve(__dirname, filename);
  tried.push(local);
  if (fs.existsSync(local)) return { path: local, tried };

  return { path: null, tried };
}





