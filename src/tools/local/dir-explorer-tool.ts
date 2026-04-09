import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { Tool, ToolResult } from "../types";

// ─── Hard limits ──────────────────────────────────────────────────────────────

/** Absolute maximum walk depth regardless of user input. Prevents runaway recursion. */
const MAX_WALK_DEPTH = 50;
/** Cap on tree rows emitted. Prevents massive token output. */
const MAX_TREE_NODES = 500;
/**
 * Resolved paths must start with this prefix.
 * Set to "" to disable jailing (default: unrestricted).
 */
const PATH_JAIL = "";
/**
 * Directory names excluded from both the walk and the tree by default.
 * The agent/model can pass `exclude: []` to opt out, or extend the list.
 */
const DEFAULT_EXCLUDE = new Set([
    "node_modules", ".git", ".svn", ".hg",
    "dist", "build", "out", ".next", ".nuxt",
    ".cache", ".turbo", ".parcel-cache",
    "coverage", ".nyc_output",
    "__pycache__", ".venv", "venv",
    ".DS_Store",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirStats {
    absolutePath: string;
    // Counts (recursive)
    totalFiles: number;
    totalSubdirs: number;
    totalSymlinks: number;
    // Size
    totalSizeBytes: number;
    totalSizeHuman: string;
    largestFile: { path: string; sizeBytes: number } | null;
    // Extensions sorted by count desc
    extensionCounts: Record<string, number>;
    // Root dir metadata
    createdAt: string;
    modifiedAt: string;
    permissions: string; // e.g. "drwxr-xr-x"
    ownerUid: number;
    // Depth info
    maxDepthFound: number;
    treeMaxDepth: number;
    treeTruncated: boolean;
    tree: string;
    excludedDirs: string[]; // dir names skipped during walk + tree
}

interface WalkAccum {
    files: number;
    dirs: number;
    symlinks: number;
    sizeBytes: number;
    largestPath: string;
    largestSize: number;
    extCounts: Record<string, number>;
    maxDepth: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

function symbolicMode(mode: number): string {
    const typeMap: Record<number, string> = {
        0o140000: "s", 0o120000: "l", 0o100000: "-",
        0o060000: "b", 0o040000: "d", 0o020000: "c", 0o010000: "p",
    };
    const t = typeMap[mode & 0o170000] ?? "?";
    const rwx = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
    return t + rwx[(mode >> 6) & 7] + rwx[(mode >> 3) & 7] + rwx[mode & 7];
}

/**
 * Resolve and validate the target path.
 * Throws a descriptive Error on any invalid input.
 */
function resolveSafe(rawPath: string, isAbsolute: boolean): string {
    if (typeof rawPath !== "string" || rawPath.trim() === "") {
        throw new Error("path must be a non-empty string");
    }
    // Null-byte injection guard
    if (rawPath.includes("\0")) {
        throw new Error("path contains null bytes");
    }

    const resolved = isAbsolute
        ? path.normalize(rawPath)
        : path.resolve(process.cwd(), rawPath);

    // Optional jail — keeps traversal inside an allowed prefix
    if (PATH_JAIL && !resolved.startsWith(PATH_JAIL)) {
        throw new Error(`path escapes allowed root: "${PATH_JAIL}"`);
    }

    return resolved;
}

// ─── Recursive walk ───────────────────────────────────────────────────────────

function walkDir(dirPath: string, depth: number, acc: WalkAccum, exclude: Set<string>): void {
    if (depth > MAX_WALK_DEPTH) return;

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return; // unreadable dir — skip silently
    }

    for (const entry of entries) {
        // Dirent.isSymbolicLink uses lstat semantics — no symlink following
        if (entry.isSymbolicLink()) {
            acc.symlinks++;
            continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            if (exclude.has(entry.name)) continue; // skip excluded dirs entirely
            acc.dirs++;
            acc.maxDepth = Math.max(acc.maxDepth, depth + 1);
            walkDir(fullPath, depth + 1, acc, exclude);
        } else if (entry.isFile()) {
            acc.files++;
            try {
                // lstatSync: Dirent already confirmed it's a regular file, safe to stat
                const s = fs.lstatSync(fullPath);
                acc.sizeBytes += s.size;
                if (s.size > acc.largestSize) {
                    acc.largestSize = s.size;
                    acc.largestPath = fullPath;
                }
            } catch {
                /* unreadable — count the file but skip size */
            }
            const ext = path.extname(entry.name).toLowerCase() || "(none)";
            acc.extCounts[ext] = (acc.extCounts[ext] ?? 0) + 1;
        }
    }
}

// ─── Tree renderer ────────────────────────────────────────────────────────────

/**
 * Produces a tree string.
 * Fast-path: spawnSync (not execSync/shell) — argv array, zero injection risk.
 * Fallback: pure-JS renderer, also injection-free.
 * Both paths cap output at MAX_TREE_NODES rows.
 */
function buildTree(
    dirPath: string,
    maxDepth: number,
    exclude: Set<string>
): { output: string; truncated: boolean } {
    // spawnSync passes args as an array — no shell, no injection
    // Pass each excluded name as -I pattern (tree supports glob patterns per -I flag)
    const ignoreArgs = [...exclude].flatMap(name => ["-I", name]);
    const r = spawnSync("tree", ["-L", String(maxDepth), "--noreport", ...ignoreArgs, dirPath], {
        timeout: 8_000,
        encoding: "utf-8",
    });

    if (r.status === 0 && r.stdout) {
        const lines = r.stdout.trimEnd().split("\n");
        if (lines.length <= MAX_TREE_NODES) {
            return { output: r.stdout.trimEnd(), truncated: false };
        }
        return {
            output: lines.slice(0, MAX_TREE_NODES).join("\n") + "\n… (truncated)",
            truncated: true,
        };
    }

    // Pure-JS fallback
    const lines: string[] = [dirPath];
    let truncated = false;

    function render(dir: string, prefix: string, depth: number): void {
        if (depth >= maxDepth || truncated) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
                .filter(e => !(e.isDirectory() && exclude.has(e.name)))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch {
            return;
        }
        entries.forEach((entry, i) => {
            if (lines.length >= MAX_TREE_NODES) { truncated = true; return; }
            const last = i === entries.length - 1;
            lines.push(prefix + (last ? "└── " : "├── ") + entry.name);
            if (entry.isDirectory()) {
                render(
                    path.join(dir, entry.name),
                    prefix + (last ? "    " : "│   "),
                    depth + 1
                );
            }
        });
    }

    render(dirPath, "", 0);
    if (truncated) lines.push("… (truncated)");
    return { output: lines.join("\n"), truncated };
}

// ─── Tool definition ──────────────────────────────────────────────────────────

export const dirExplorerTool: Tool = {
    name: "explore_directory",
    description:
        "Returns metadata for a directory: recursive file/subdir/symlink counts, " +
        "total size, largest file, extension breakdown, permissions, timestamps, " +
        "nesting depth, and a visual tree (default depth 3, capped at 500 nodes).",
    inputSchema: {
        type: "object",
        properties: {
            absolute: {
                type: "boolean",
                description: "true → path is absolute; false → path is relative to cwd. Ignored when path is omitted.",
            },
            path: {
                type: "string",
                description: "Directory to explore. Omit to explore the current working directory.",
            },
            maxDepth: {
                type: "number",
                description: "Max depth for the tree view. Default 3, clamped to 20.",
            },
            exclude: {
                type: "array",
                items: { type: "string" },
                description:
                    "Directory names to skip in both the walk and the tree. " +
                    "Defaults to common noise dirs (node_modules, .git, dist, build, …). " +
                    "Pass [] to disable all exclusions.",
            },
        },
        required: [],
        additionalProperties: false,
    },
    metadata: { source: "local", version: "2.0.0" },

    async execute(input: Record<string, unknown>): Promise<ToolResult> {
        // ── Input validation ──────────────────────────────────────────────────────
        let resolvedPath: string;
        const rawPath = input.path as string | undefined;

        if (!rawPath) {
            // No path provided — default to cwd (already absolute, skip validation)
            resolvedPath = process.cwd();
        } else {
            try {
                resolvedPath = resolveSafe(rawPath, Boolean(input.absolute));
            } catch (err) {
                return {
                    success: false,
                    output: null,
                    error: `Invalid path: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }

        // ── Exclusion set ────────────────────────────────────────────────────────
        const excludeInput = input.exclude;
        const exclude: Set<string> =
            Array.isArray(excludeInput)
                ? new Set((excludeInput as unknown[]).filter((x): x is string => typeof x === "string"))
                : new Set(DEFAULT_EXCLUDE);

        const treeMaxDepth =
            typeof input.maxDepth === "number" && input.maxDepth > 0
                ? Math.min(Math.floor(input.maxDepth), 20)
                : 3;

        // ── Single lstat call — no TOCTOU race ───────────────────────────────────
        let rootStat: fs.Stats;
        try {
            rootStat = fs.lstatSync(resolvedPath);
        } catch (err) {
            return {
                success: false,
                output: null,
                error: `Cannot access path: ${err instanceof Error ? err.message : String(err)}`,
            };
        }

        if (!rootStat.isDirectory()) {
            return {
                success: false,
                output: null,
                error: `Not a directory: "${resolvedPath}"`,
            };
        }

        // ── Walk ──────────────────────────────────────────────────────────────────
        const acc: WalkAccum = {
            files: 0, dirs: 0, symlinks: 0,
            sizeBytes: 0,
            largestPath: "", largestSize: 0,
            extCounts: {},
            maxDepth: 0,
        };
        walkDir(resolvedPath, 1, acc, exclude);

        // ── Tree ──────────────────────────────────────────────────────────────────
        const { output: tree, truncated: treeTruncated } = buildTree(resolvedPath, treeMaxDepth, exclude);

        // ── Output — no redundant / always-true fields ────────────────────────────
        const out: DirStats = {
            absolutePath: resolvedPath,

            totalFiles: acc.files,
            totalSubdirs: acc.dirs,
            totalSymlinks: acc.symlinks,

            totalSizeBytes: acc.sizeBytes,
            totalSizeHuman: humanSize(acc.sizeBytes),
            largestFile: acc.largestPath
                ? { path: acc.largestPath, sizeBytes: acc.largestSize }
                : null,

            extensionCounts: Object.fromEntries(
                Object.entries(acc.extCounts).sort((a, b) => b[1] - a[1])
            ),

            createdAt: rootStat.birthtime.toISOString(),
            modifiedAt: rootStat.mtime.toISOString(),
            permissions: symbolicMode(rootStat.mode),
            ownerUid: rootStat.uid,

            maxDepthFound: acc.maxDepth,
            treeMaxDepth,
            treeTruncated,
            tree,
            excludedDirs: [...exclude].sort(),
        };

        return { success: true, output: out };
    },
};