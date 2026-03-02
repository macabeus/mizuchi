/**
 * Codebase Indexer
 *
 * Scans a decompilation project to build a MizuchiDbDump:
 *  - Phase 1: Scan matched C functions (findInFiles + Objdiff)
 *  - Phase 2: Scan unmatched assembly functions (glob + asm-utils)
 *  - Phase 3: Incremental diff (content hashing)
 */
import { findInFiles } from '@ast-grep/napi';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import type { PipelineConfig, PlatformTarget } from '~/shared/config';
import { parseMapFile, resolveObjectPath, resolveObjectPathFromSourceFile } from '~/shared/map-file/map-file';
import { type DecompFunctionDoc, MIZUCHI_DB_VERSION, type MizuchiDbDump } from '~/shared/mizuchi-db/mizuchi-db';
import { Objdiff } from '~/shared/objdiff';
import { registerClangLanguage } from '~/shared/prompt-builder/ast-grep-utils';

import {
  countBodyLinesFromAsmFunction,
  extractFunctionCallsFromAssembly,
  listFunctionsFromAsmModule,
} from './asm-utils';

export interface IndexCodebaseOptions {
  config: PipelineConfig;
  objdiffDiffSettings: Record<string, string>;
  onProgress?: (progress: IndexProgress) => void;
}

export interface IndexProgress {
  phase: 'scanning-c' | 'scanning-asm' | 'diffing' | 'writing';
  current: number;
  total: number;
  message: string;
}

export interface IndexResult {
  dump: MizuchiDbDump;
  stats: {
    matchedFunctions: number;
    unmatchedFunctions: number;
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    removedCount: number;
  };
}

/**
 * Clean up extracted C function text from ast-grep.
 *
 * Tree-sitter doesn't run the C preprocessor, so macros like END_NONMATCH
 * (which expand to nothing) get parsed as the function's return type.
 * This results in node.text() including the macro text before the actual function.
 *
 * Strip known macro artifacts from the beginning of function text.
 */
export function cleanFunctionText(text: string): string {
  return text.replace(/^END_NONMATCH\s*/, '');
}

/**
 * Compute a content hash for a function's code.
 * Used for incremental indexing — if the hash hasn't changed, we skip re-embedding.
 */
function contentHash(asmCode: string, cCode?: string): string {
  return crypto
    .createHash('sha256')
    .update(asmCode)
    .update(cCode ?? '')
    .digest('hex');
}

/**
 * Index a decompilation project codebase.
 *
 * Scans for matched (C) and unmatched (assembly-only) functions,
 * performs incremental diffing against an existing database if available,
 * and returns the updated MizuchiDbDump.
 */
export async function indexCodebase(options: IndexCodebaseOptions): Promise<IndexResult> {
  const { config, objdiffDiffSettings, onProgress } = options;
  const { projectPath, mapFilePath, target: platform, nonMatchingAsmFolders } = config;

  // Parse map file
  const mapContent = await fs.readFile(mapFilePath, 'utf-8');
  const symbolMap = parseMapFile(mapContent);

  // Load existing database for incremental indexing
  const existingDump = await loadExistingDb(projectPath);
  const existingHashes = existingDump?.indexMetadata?.contentHashes ?? {};
  const existingVectorsById = new Map((existingDump?.vectors ?? []).map((v) => [v.id, v.embedding]));

  // Phase 1: Scan matched C functions
  onProgress?.({
    phase: 'scanning-c',
    current: 0,
    total: 0,
    message: 'Scanning C files for function definitions...',
  });

  const matchedFunctions = await scanMatchedFunctions(
    projectPath,
    platform,
    symbolMap,
    objdiffDiffSettings,
    onProgress,
  );

  // Phase 2: Scan unmatched assembly functions
  onProgress?.({
    phase: 'scanning-asm',
    current: 0,
    total: 0,
    message: 'Scanning assembly files for unmatched functions...',
  });

  const unmatchedFunctions = await scanUnmatchedFunctions(
    projectPath,
    platform,
    nonMatchingAsmFolders,
    matchedFunctions,
    onProgress,
  );

  // Merge all discovered functions
  const allFunctions = [...matchedFunctions.values(), ...unmatchedFunctions.values()];

  // Phase 3: Incremental diff
  onProgress?.({
    phase: 'diffing',
    current: 0,
    total: allFunctions.length,
    message: 'Computing incremental diff...',
  });

  const newContentHashes: Record<string, string> = {};
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const func of allFunctions) {
    const hash = contentHash(func.asmCode, func.cCode);
    newContentHashes[func.id] = hash;

    if (!(func.id in existingHashes)) {
      newCount++;
    } else if (existingHashes[func.id] !== hash) {
      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  // Count removed functions
  const allIds = new Set(allFunctions.map((f) => f.id));
  const removedCount = Object.keys(existingHashes).filter((id) => !allIds.has(id)).length;

  // Preserve existing embeddings for unchanged functions
  const vectors: Array<{ id: string; embedding: number[] }> = [];
  for (const func of allFunctions) {
    const hash = contentHash(func.asmCode, func.cCode);
    if (existingHashes[func.id] === hash && existingVectorsById.has(func.id)) {
      vectors.push({ id: func.id, embedding: existingVectorsById.get(func.id)! });
    }
    // New/updated functions won't have embeddings until Phase 5 (embedder)
  }

  const dump: MizuchiDbDump = {
    version: MIZUCHI_DB_VERSION,
    platform,
    decompFunctions: allFunctions,
    vectors,
    indexMetadata: {
      contentHashes: newContentHashes,
    },
  };

  onProgress?.({
    phase: 'writing',
    current: allFunctions.length,
    total: allFunctions.length,
    message: `Done. ${matchedFunctions.size} matched, ${unmatchedFunctions.size} unmatched.`,
  });

  return {
    dump,
    stats: {
      matchedFunctions: matchedFunctions.size,
      unmatchedFunctions: unmatchedFunctions.size,
      newCount,
      updatedCount,
      unchangedCount,
      removedCount,
    },
  };
}

/**
 * Load an existing mizuchi-db.json from the project path.
 */
async function loadExistingDb(projectPath: string): Promise<MizuchiDbDump | null> {
  const dbPath = path.join(projectPath, 'mizuchi-db.json');
  try {
    const raw = await fs.readFile(dbPath, 'utf-8');
    const parsed = JSON.parse(raw) as MizuchiDbDump;

    if (parsed.version !== MIZUCHI_DB_VERSION) {
      throw new Error(`Incompatible Mizuchi DB version: expected ${MIZUCHI_DB_VERSION}, got ${parsed.version}`);
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Phase 1: Scan matched C functions using ast-grep.
 *
 * Uses findInFiles to locate all function_definition nodes in C files,
 * then resolves each to its compiled object file via the map file,
 * and extracts assembly via Objdiff.
 */
async function scanMatchedFunctions(
  projectPath: string,
  platform: PlatformTarget,
  symbolMap: Map<string, string>,
  objdiffDiffSettings: Record<string, string>,
  onProgress?: (progress: IndexProgress) => void,
): Promise<Map<string, DecompFunctionDoc>> {
  registerClangLanguage();

  const objdiff = new Objdiff(objdiffDiffSettings);
  const functions = new Map<string, DecompFunctionDoc>();

  // Collect all function definitions from C files
  const cFunctions: Array<{ name: string; cCode: string; cModulePath: string }> = [];

  await findInFiles(
    'c',
    {
      paths: [projectPath],
      matcher: {
        rule: {
          kind: 'function_definition',
        },
      },
      languageGlobs: ['*.c'],
    },
    (err, nodes) => {
      if (err) {
        console.warn('Error scanning C files:', err);
        return;
      }

      for (const node of nodes) {
        // Skip NONMATCH functions — their C code is approximate and doesn't match.
        // Tree-sitter parses NONMATCH(path, decl) as an ERROR node preceding
        // the function_definition.
        const prev = node.prev();
        if (prev && prev.kind() === 'ERROR' && prev.text().includes('NONMATCH(')) {
          continue;
        }

        // Extract function name from the declarator
        const declarator = node.find({ rule: { kind: 'function_declarator' } });
        if (!declarator) {
          continue;
        }
        const identifier = declarator.find({ rule: { kind: 'identifier' } });
        if (!identifier) {
          continue;
        }

        const name = identifier.text();
        const cCode = cleanFunctionText(node.text());
        const filePath = node.getRoot().filename();
        const cModulePath = path.relative(projectPath, filePath);

        cFunctions.push({ name, cCode, cModulePath });
      }
    },
  );

  onProgress?.({
    phase: 'scanning-c',
    current: 0,
    total: cFunctions.length,
    message: `Found ${cFunctions.length} C functions. Extracting assembly...`,
  });

  // For each C function, resolve object path and extract assembly
  let processed = 0;
  for (const { name, cCode, cModulePath } of cFunctions) {
    // Skip if we already found a function with this name
    if (functions.has(name)) {
      processed++;
      continue;
    }

    try {
      // Try map file first, then fall back to resolving from C source path
      // (static functions don't appear in the linker map)
      let objectPath = await resolveObjectPath(name, projectPath, symbolMap);
      if (!objectPath) {
        objectPath = await resolveObjectPathFromSourceFile(cModulePath, projectPath);
      }
      if (!objectPath) {
        continue;
      }

      const parsedObj = await objdiff.parseObjectFile(objectPath);
      const diffResult = await objdiff.runDiff(parsedObj);
      if (!diffResult.left) {
        continue;
      }

      const asmCode = await objdiff.getAssemblyFromSymbol(diffResult.left, name);
      if (!asmCode.trim()) {
        continue;
      }

      const callsFunctions = extractFunctionCallsFromAssembly(platform, asmCode);

      functions.set(name, {
        id: name,
        name,
        cCode,
        cModulePath,
        asmCode,
        asmModulePath: cModulePath.replace(/\.c$/, '.s'),
        callsFunctions,
      });
    } catch {
      // Skip functions we can't process (missing .o, objdiff errors, etc.)
    }

    processed++;
    if (processed % 50 === 0) {
      onProgress?.({
        phase: 'scanning-c',
        current: processed,
        total: cFunctions.length,
        message: `Processing C functions: ${processed}/${cFunctions.length}`,
      });
    }
  }

  return functions;
}

/**
 * Phase 2: Scan unmatched assembly functions from non-matching asm directories.
 *
 * Reads .s/.S/.asm files, parses function boundaries, and records
 * functions that don't have a matched C implementation.
 */
async function scanUnmatchedFunctions(
  projectPath: string,
  platform: PlatformTarget,
  nonMatchingAsmFolders: string[],
  matchedFunctions: Map<string, DecompFunctionDoc>,
  onProgress?: (progress: IndexProgress) => void,
): Promise<Map<string, DecompFunctionDoc>> {
  const functions = new Map<string, DecompFunctionDoc>();
  let totalFiles = 0;
  let processedFiles = 0;

  for (const folder of nonMatchingAsmFolders) {
    const asmDir = path.join(projectPath, folder);

    let asmFiles: string[];
    try {
      asmFiles = await globAsmFiles(asmDir);
    } catch {
      // Directory doesn't exist, skip
      continue;
    }

    totalFiles += asmFiles.length;

    for (const asmFile of asmFiles) {
      try {
        const content = await fs.readFile(asmFile, 'utf-8');
        const asmModulePath = path.relative(projectPath, asmFile);
        const asmFunctions = listFunctionsFromAsmModule(platform, content);

        for (const { name, code } of asmFunctions) {
          // Skip if already matched
          if (matchedFunctions.has(name)) {
            continue;
          }

          // Skip if already found in another asm folder
          if (functions.has(name)) {
            continue;
          }

          // Skip empty functions
          if (countBodyLinesFromAsmFunction(platform, code) === 0) {
            continue;
          }

          const callsFunctions = extractFunctionCallsFromAssembly(platform, code);

          functions.set(name, {
            id: name,
            name,
            asmCode: code,
            asmModulePath,
            callsFunctions,
          });
        }
      } catch {
        // Skip files we can't read/parse
      }

      processedFiles++;
      if (processedFiles % 20 === 0) {
        onProgress?.({
          phase: 'scanning-asm',
          current: processedFiles,
          total: totalFiles,
          message: `Processing assembly files: ${processedFiles}/${totalFiles}`,
        });
      }
    }
  }

  return functions;
}

/**
 * Glob for assembly files (.s, .S, .asm) recursively.
 */
async function globAsmFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const match of fs.glob('**/*.{s,S,asm}', { cwd: dir })) {
    files.push(path.join(dir, match));
  }
  return files;
}

/**
 * Write a MizuchiDbDump to mizuchi-db.json atomically (temp file + rename).
 */
export async function writeMizuchiDb(projectPath: string, dump: MizuchiDbDump): Promise<void> {
  const dbPath = path.join(projectPath, 'mizuchi-db.json');
  const tmpPath = `${dbPath}.tmp`;

  await fs.writeFile(tmpPath, JSON.stringify(dump, null, 2), 'utf-8');
  await fs.rename(tmpPath, dbPath);
}
