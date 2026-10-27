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
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'vendor-three';
          if (id.includes('/node_modules/gsap/')) return 'vendor-gsap';
        },
      },
    },
  },
});

