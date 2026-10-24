import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      ...(!fs.existsSync(path.resolve(import.meta.dirname, 'src/engine'))
        ? [
            {
              find: /^(\.\/engine|\.\.\/engine|@\/engine|src\/engine)$/,
              replacement: path.resolve(import.meta.dirname, 'src/ui/engineStub.ts'),
            },
          ]
        : []),
    ],
  },
});
