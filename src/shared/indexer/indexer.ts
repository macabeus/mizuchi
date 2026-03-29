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
import {
  parseMapFile,
  parseMapFileAddresses,
  resolveObjectPath,
  resolveObjectPathFromSourceFile,
} from '~/shared/map-file/map-file';
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
  const {
    projectRoot,
    mapFilePath,
    target: platform,
    nonMatchingAsmFolders,
    matchingAsmFolders,
    excludeFromScan,
  } = config;

  // Parse map file
  const mapContent = await fs.readFile(mapFilePath, 'utf-8');
  const symbolMap = parseMapFile(mapContent);
  const addressMap = parseMapFileAddresses(mapContent);

  // Load existing database for incremental indexing
  const existingDump = await loadExistingDb(projectRoot);
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
    projectRoot,
    platform,
    symbolMap,
    addressMap,
    objdiffDiffSettings,
    matchingAsmFolders,
    excludeFromScan,
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
    projectRoot,
    platform,
    nonMatchingAsmFolders,
    matchedFunctions,
    addressMap,
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
async function loadExistingDb(projectRoot: string): Promise<MizuchiDbDump | null> {
  const dbPath = path.join(projectRoot, 'mizuchi-db.json');
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
  projectRoot: string,
  platform: PlatformTarget,
  symbolMap: Map<string, string>,
  addressMap: Map<string, number>,
  objdiffDiffSettings: Record<string, string>,
  matchingAsmFolders: string[],
  excludeFromScan: string[],
  onProgress?: (progress: IndexProgress) => void,
): Promise<Map<string, DecompFunctionDoc>> {
  registerClangLanguage();

  const objdiff = new Objdiff(objdiffDiffSettings);
  const functions = new Map<string, DecompFunctionDoc>();
  const errors: Array<{ name: string; cModulePath: string; error: string }> = [];

  // Collect all function definitions from C files
  const cFunctions: Array<{ name: string; cCode: string; cModulePath: string }> = [];

  await findInFiles(
    'c',
    {
      paths: [projectRoot],
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

        const filePath = node.getRoot().filename();
        const cModulePath = path.relative(projectRoot, filePath);

        // Skip files in excluded directories
        if (excludeFromScan.some((dir) => cModulePath.startsWith(dir + '/'))) {
          continue;
        }

        const name = identifier.text();
        const cCode = cleanFunctionText(node.text());

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

  // Build matching assembly lookup from matchingAsmFolders (used as fallback when objdiff fails)
  const matchingAsmLookup = await buildMatchingAsmLookup(projectRoot, platform, matchingAsmFolders);

  // For each C function, resolve object path and extract assembly
  let processed = 0;
  for (const { name, cCode, cModulePath } of cFunctions) {
    // Skip if we already found a function with this name
    if (functions.has(name)) {
      processed++;
      continue;
    }

    // Try objdiff first to extract assembly from the compiled .o file
    let asmCode: string | null = null;
    let asmModulePath = cModulePath.replace(/\.c$/, '.s');
    let objdiffError: string | null = null;

    try {
      // Try map file first, then fall back to resolving from C source path
      // (static functions don't appear in the linker map)
      let objectPath = await resolveObjectPath(name, projectRoot, symbolMap);
      if (!objectPath) {
        objectPath = await resolveObjectPathFromSourceFile(cModulePath, projectRoot);
      }
      if (!objectPath) {
        objdiffError = 'Could not resolve object file path';
      } else {
        const parsedObj = await objdiff.parseObjectFile(objectPath);
        const diffResult = await objdiff.runDiff(parsedObj);
        if (!diffResult.left) {
          objdiffError = `objdiff returned no left side for object: ${objectPath}`;
        } else {
          const asm = await objdiff.getAssemblyFromSymbol(diffResult.left, name);
          if (!asm.trim()) {
            objdiffError = `objdiff returned empty assembly for symbol in: ${objectPath}`;
          } else {
            asmCode = asm;
          }
        }
      }
    } catch (err) {
      objdiffError = err instanceof Error ? err.message : String(err);
    }

    // Fallback: try matching assembly folders
    if (!asmCode) {
      const fallback = matchingAsmLookup.get(name);
      if (fallback) {
        asmCode = fallback.code;
        asmModulePath = fallback.asmModulePath;
      }
    }

    if (!asmCode) {
      errors.push({ name, cModulePath, error: objdiffError ?? 'No assembly found' });
      continue;
    }

    const callsFunctions = extractFunctionCallsFromAssembly(platform, asmCode);
    const romAddress = addressMap.get(name);

    functions.set(name, {
      id: name,
      name,
      ...(romAddress !== undefined && { romAddress }),
      cCode,
      cModulePath,
      asmCode,
      asmModulePath,
      callsFunctions,
    });

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

  if (errors.length > 0) {
    const details = errors.map((e) => `  - ${e.name} (${e.cModulePath}): ${e.error}`).join('\n');
    throw new Error(`Failed to process ${errors.length} C function(s):\n${details}`);
  }

  return functions;
}

/**
 * Build a lookup map from function name → assembly code by scanning matching asm folders.
 *
 * Matching asm folders contain per-function .s files (e.g., asm/matchings/gfx/ReadUnalignedU16.s)
 * with the target assembly for decompiled functions.
 */
async function buildMatchingAsmLookup(
  projectRoot: string,
  platform: PlatformTarget,
  matchingAsmFolders: string[],
): Promise<Map<string, { code: string; asmModulePath: string }>> {
  const lookup = new Map<string, { code: string; asmModulePath: string }>();

  for (const folder of matchingAsmFolders) {
    const asmDir = path.join(projectRoot, folder);

    let asmFiles: string[];
    try {
      asmFiles = await globAsmFiles(asmDir);
    } catch {
      continue;
    }

    for (const asmFile of asmFiles) {
      try {
        const content = await fs.readFile(asmFile, 'utf-8');
        const asmModulePath = path.relative(projectRoot, asmFile);
        const asmFunctions = listFunctionsFromAsmModule(platform, content);

        for (const { name, code } of asmFunctions) {
          if (!lookup.has(name) && countBodyLinesFromAsmFunction(platform, code) > 0) {
            lookup.set(name, { code, asmModulePath });
          }
        }
      } catch {
        // Skip files we can't read/parse
      }
    }
  }

  return lookup;
}

/**
 * Phase 2: Scan unmatched assembly functions from non-matching asm directories.
 *
 * Reads .s/.S/.asm files, parses function boundaries, and records
 * functions that don't have a matched C implementation.
 */
async function scanUnmatchedFunctions(
  projectRoot: string,
  platform: PlatformTarget,
  nonMatchingAsmFolders: string[],
  matchedFunctions: Map<string, DecompFunctionDoc>,
  addressMap: Map<string, number>,
  onProgress?: (progress: IndexProgress) => void,
): Promise<Map<string, DecompFunctionDoc>> {
  const functions = new Map<string, DecompFunctionDoc>();
  let totalFiles = 0;
  let processedFiles = 0;

  for (const folder of nonMatchingAsmFolders) {
    const asmDir = path.join(projectRoot, folder);

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
        const asmModulePath = path.relative(projectRoot, asmFile);
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
          const romAddress = addressMap.get(name);

          functions.set(name, {
            id: name,
            name,
            ...(romAddress !== undefined && { romAddress }),
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
export async function writeMizuchiDb(projectRoot: string, dump: MizuchiDbDump): Promise<void> {
  const dbPath = path.join(projectRoot, 'mizuchi-db.json');
  const tmpPath = `${dbPath}.tmp`;

  await fs.writeFile(tmpPath, JSON.stringify(dump, null, 2), 'utf-8');
  await fs.rename(tmpPath, dbPath);
}
