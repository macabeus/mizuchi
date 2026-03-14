import { SgNode, findInFiles } from '@ast-grep/napi';

import type { MizuchiDb } from '~/shared/mizuchi-db/mizuchi-db.js';

import { getFirstParentWithKind, registerClangLanguage } from './ast-grep-utils.js';

export type DecompFuncContext = {
  asmDeclaration?: string;
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
  typeDefinitions: string[];
};

export type SamplingCFunction = {
  name: string;
  cCode: string;
  asmCode: string;
  callsTarget: boolean;
};

type CodebaseContext = {
  asmDeclaration?: string;
  calledFunctionsDeclarations: { [functionName: string]: string };
  typeDefinitions: string[];
};

async function getCodebaseContext(
  functionName: string,
  calledFunctionNames: string[],
  projectRoot: string,
): Promise<CodebaseContext> {
  registerClangLanguage();

  const allFunctionsName = [functionName, ...calledFunctionNames];

  const typeDefinitionsAddedNames = new Set<string>();
  const result: CodebaseContext = {
    calledFunctionsDeclarations: {},
    typeDefinitions: [],
  };

  const declarationsNode: SgNode[] = [];

  // Phase 1: Find function declarations
  await findInFiles(
    'c',
    {
      paths: [projectRoot],
      matcher: {
        rule: {
          kind: 'identifier',
          regex: allFunctionsName.map((name) => `^(${name})$`).join('|'),
          inside: {
            kind: 'function_declarator',
          },
        },
      },
      languageGlobs: ['*.c', '*.h'],
    },
    (err, nodes) => {
      if (err) {
        console.warn('Error finding function declarations:', err);
      }

      for (const node of nodes) {
        const declarationNode = getFirstParentWithKind(node, 'declaration');
        if (!declarationNode) {
          continue;
        }

        declarationsNode.push(declarationNode);

        if (node.text() === functionName) {
          result.asmDeclaration = declarationNode.text();
        } else {
          result.calledFunctionsDeclarations[node.text()] = declarationNode.text();
        }
      }
    },
  );

  // Phase 2: Find type definitions for custom types used in declarations
  if (declarationsNode.length) {
    const ignoreTypes = new Set(['u8', 'u16', 'u32', 'u64', 's8', 's16', 's32', 's64']);

    const typesFromDeclarations = new Set<string>();
    for (const declaration of declarationsNode) {
      declaration.findAll({ rule: { kind: 'type_identifier' } }).forEach((typeNode) => {
        const typeName = typeNode.text();

        if (ignoreTypes.has(typeName)) {
          return;
        }

        typesFromDeclarations.add(typeName);
      });
    }

    if (typesFromDeclarations.size > 0) {
      await findInFiles(
        'c',
        {
          paths: [projectRoot],
          matcher: {
            rule: {
              kind: 'type_identifier',
              regex: [...typesFromDeclarations].map((name) => `^(${name})$`).join('|'),
              inside: {
                kind: 'type_definition',
              },
            },
          },
          languageGlobs: ['*.c', '*.h'],
        },
        (err, nodes) => {
          if (err) {
            console.warn('Error finding type definitions:', err);
          }

          for (const node of nodes) {
            const typeDefinitionNode = getFirstParentWithKind(node, 'type_definition');
            if (!typeDefinitionNode) {
              continue;
            }

            if (!typeDefinitionsAddedNames.has(node.text())) {
              typeDefinitionsAddedNames.add(node.text());
              result.typeDefinitions.push(typeDefinitionNode.text());
            }
          }
        },
      );
    }
  }

  return result;
}

export async function getFuncContext(
  db: MizuchiDb,
  functionId: string,
  projectRoot: string,
): Promise<DecompFuncContext> {
  const func = db.getFunctionById(functionId);
  if (!func) {
    throw new Error(`Function not found: ${functionId}`);
  }

  // Resolve called function IDs to names
  const calledFunctionNames: string[] = [];
  for (const calledId of func.callsFunctions) {
    const calledFunc = db.getFunctionById(calledId);
    if (calledFunc) {
      calledFunctionNames.push(calledFunc.name);
    }
  }

  const context = await getCodebaseContext(func.name, calledFunctionNames, projectRoot);

  const result: DecompFuncContext = {
    asmDeclaration: context.asmDeclaration,
    calledFunctionsDeclarations: context.calledFunctionsDeclarations,
    sampling: [],
    typeDefinitions: context.typeDefinitions,
  };

  // Similar functions from vector search — filter to those with cCode
  const similarResults = db.findSimilar(functionId, 50);
  for (const similar of similarResults) {
    if (!similar.function.cCode) {
      continue;
    }
    result.sampling.push({
      name: similar.function.name,
      cCode: similar.function.cCode,
      asmCode: similar.function.asmCode,
      callsTarget: similar.function.callsFunctions.includes(functionId),
    });
  }

  // Functions that call the target — filter to those with cCode
  const callers = db.getCalledBy(functionId);
  for (const caller of callers) {
    if (!caller.cCode) {
      continue;
    }
    // Avoid duplicates if already added from similarity search
    if (result.sampling.some((s) => s.name === caller.name)) {
      continue;
    }
    result.sampling.push({
      name: caller.name,
      cCode: caller.cCode,
      asmCode: caller.asmCode,
      callsTarget: true,
    });
  }

  return result;
}
