import type { PlatformTarget } from '~/shared/config.js';
import type { MizuchiDb } from '~/shared/mizuchi-db/mizuchi-db.js';

import { getFuncContext } from './codebase-context.js';
import { craftPrompt } from './craft-prompt.js';

export async function createDecompilePrompt(params: {
  db: MizuchiDb;
  functionId: string;
  projectRoot: string;
  platform: PlatformTarget;
}): Promise<string> {
  const { db, functionId, projectRoot, platform } = params;

  const func = db.getFunctionById(functionId);
  if (!func) {
    throw new Error(`Function not found: ${functionId}`);
  }

  const { asmDeclaration, calledFunctionsDeclarations, sampling, typeDefinitions } = await getFuncContext(
    db,
    functionId,
    projectRoot,
  );

  return craftPrompt({
    platform,
    modulePath: func.asmModulePath,
    asmName: func.name,
    asmDeclaration,
    asmCode: func.asmCode,
    calledFunctionsDeclarations,
    sampling,
    typeDefinitions,
  });
}
