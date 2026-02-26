import type { PlatformTarget } from '~/shared/config.js';
import type { KappaDb } from '~/shared/kappa-db/kappa-db.js';

import { getFuncContext } from './codebase-context.js';
import { craftPrompt } from './craft-prompt.js';

export async function createDecompilePrompt(params: {
  db: KappaDb;
  functionId: string;
  projectPath: string;
  platform: PlatformTarget;
}): Promise<string> {
  const { db, functionId, projectPath, platform } = params;

  const func = db.getFunctionById(functionId);
  if (!func) {
    throw new Error(`Function not found: ${functionId}`);
  }

  const { asmDeclaration, calledFunctionsDeclarations, sampling, typeDefinitions } = await getFuncContext(
    db,
    functionId,
    projectPath,
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
