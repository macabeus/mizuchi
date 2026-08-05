import langC from '@ast-grep/lang-c';
import langCpp from '@ast-grep/lang-cpp';
import { SgNode, registerDynamicLanguage } from '@ast-grep/napi';

let registered = false;
export function registerClangLanguage() {
  if (!registered) {
    registerDynamicLanguage({ c: langC, cpp: langCpp });
    registered = true;
  }
}

/** ast-grep language id and file globs for a source language. */
export function astGrepLanguage(language: 'c' | 'cpp'): { id: 'c' | 'cpp'; globs: string[] } {
  return language === 'cpp'
    ? { id: 'cpp', globs: ['*.cpp', '*.cxx', '*.cc', '*.hpp', '*.h'] }
    : { id: 'c', globs: ['*.c', '*.h'] };
}

export function getFirstParentWithKind(node: SgNode, kind: string) {
  let currentNode: SgNode | null = node;

  while (currentNode) {
    if (currentNode.kindToRefine === kind) {
      return currentNode;
    }

    currentNode = currentNode.parent();
  }

  return null;
}
