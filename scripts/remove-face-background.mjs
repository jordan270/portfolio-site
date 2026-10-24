import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { removeBackground } from '@imgly/background-removal-node';

const [photoPath, cutoutPath] = process.argv.slice(2);
if (!photoPath || !cutoutPath) throw new Error('Usage: node scripts/remove-face-background.mjs <photo> <cutout.png>');

console.log('Removing the background with @imgly/background-removal-node...');
try {
  const blob = await removeBackground(pathToFileURL(photoPath).href, {
    model: 'small',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      const percent = total > 0 ? `${Math.round(current / total * 100)}%` : `${current}`;
      console.log(`[background removal] ${key}: ${percent}`);
    },
  });
  await writeFile(cutoutPath, Buffer.from(await blob.arrayBuffer()));
} catch (error) {
  console.error('Background-removal model download or inference failed. Check network access, then rerun the build command.');
  throw error;
}
