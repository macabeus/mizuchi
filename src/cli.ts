#!/usr/bin/env node
import Pastel from 'pastel';

const app = new Pastel({
  importMeta: import.meta,
  name: 'Mizuchi',
  description: 'Matching Decompilation Pipeline Runner',
});

await app.run();
