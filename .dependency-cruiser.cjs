/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // Plugins must not import from other plugins
    {
      name: 'no-cross-plugin-imports',
      severity: 'error',
      comment: 'Plugins must not import from other plugins. Use shared/ for cross-cutting concerns.',
      from: {
        path: '^src/plugins/([^/]+)/',
      },
      to: {
        path: '^src/plugins/',
        pathNot: [
          '^src/plugins/index\\.ts$', // Plugin index for re-exports
          '^src/plugins/$1/', // Own plugin directory (backreference)
        ],
      },
    },
    // Plugins can only import from their own directory or shared/
    {
      name: 'plugins-import-restrictions',
      severity: 'error',
      comment: 'Plugins can only import from their own directory, shared/, or external modules.',
      from: {
        path: '^src/plugins/([^/]+)/',
      },
      to: {
        path: '^src/',
        pathNot: [
          '^src/plugins/$1/', // Own plugin directory (backreference)
          '^src/plugins/index\\.ts$', // Plugin index for re-exports
          '^src/shared/', // Shared utilities
        ],
      },
    },
    // Circular dependencies is allowed only for type-only dependencies
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are allowed only for type-only dependencies.',
      from: {},
      to: {
        circular: true,
        dependencyTypesNot: ['type-only'],
      },
    },
    // Shared code is allowed to import only types from plugins
    {
      name: 'shared-no-plugin-imports',
      severity: 'error',
      comment: 'Shared can import only types from plugins.',
      from: {
        path: '^src/shared/',
      },
      to: {
        path: '^src/plugins/',
        dependencyTypesNot: ['type-only'],
      },
    },
    // Report generator should not import from plugins
    {
      name: 'report-generator-no-plugin-imports',
      severity: 'error',
      comment: 'Report generator must not import from plugins.',
      from: {
        path: '^src/report-generator/',
      },
      to: {
        path: '^src/plugins/',
      },
    },
    // Report generator can only import from shared/ and its own directory
    {
      name: 'report-generator-import-restrictions',
      severity: 'error',
      comment: 'Report generator can only import from shared/ and its own directory.',
      from: {
        path: '^src/report-generator/',
      },
      to: {
        path: '^src/',
        pathNot: [
          '^src/report-generator/', // Own directory
          '^src/shared/', // Shared utilities
        ],
      },
    },
    // UI run-report can import from ui/shared/, shared/, and report-generator/
    {
      name: 'ui-run-report-import-restrictions',
      severity: 'error',
      comment: 'UI run-report can only import from ui/shared/, shared/, and report-generator/.',
      from: {
        path: '^src/ui/run-report/',
      },
      to: {
        path: '^src/',
        pathNot: [
          '^src/ui/run-report/', // Own directory
          '^src/ui/shared/', // Shared UI components
          '^src/shared/', // Shared utilities
          '^src/report-generator/', // Report generator types/logic
        ],
      },
    },
    // UI decomp-atlas can import from ui/shared/ and shared/
    {
      name: 'ui-decomp-atlas-import-restrictions',
      severity: 'error',
      comment: 'UI decomp-atlas can only import from ui/shared/ and shared/.',
      from: {
        path: '^src/ui/decomp-atlas/',
      },
      to: {
        path: '^src/',
        pathNot: [
          '^src/ui/decomp-atlas/', // Own directory
          '^src/ui/shared/', // Shared UI components
          '^src/shared/', // Shared utilities
        ],
      },
    },
    // Run-report UI and decomp-atlas UI cannot import from each other
    {
      name: 'no-cross-ui-app-imports',
      severity: 'error',
      comment: 'UI apps cannot import from each other.',
      from: {
        path: '^src/ui/(run-report|decomp-atlas)/',
      },
      to: {
        path: '^src/ui/(run-report|decomp-atlas)/',
        pathNot: ['^src/ui/$1/'], // Only own directory allowed
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
