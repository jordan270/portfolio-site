import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const sourcePath = fileURLToPath(new URL('../private/f1.png', import.meta.url));
const sourceBytes = await readFile(sourcePath);
const sourceDataUrl = `data:image/png;base64,${sourceBytes.toString('base64')}`;
const browser = await chromium.launch({ headless: true });
let encoded;
let dimensions;
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const inputCanvas = document.createElement('canvas');
    inputCanvas.width = image.naturalWidth;
    inputCanvas.height = image.naturalHeight;
    const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
    if (!inputContext) throw new Error('Canvas 2D is unavailable');
    inputContext.drawImage(image, 0, 0);
    const input = inputContext.getImageData(0, 0, inputCanvas.width, inputCanvas.height);

    let minX = input.width, minY = input.height, maxX = -1, maxY = -1;
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const offset = (y * input.width + x) * 4;
        const luminance = input.data[offset] * 0.2126 + input.data[offset + 1] * 0.7152 + input.data[offset + 2] * 0.0722;
        if (luminance < 128 || input.data[offset + 3] === 0) {
          input.data[offset] = input.data[offset + 1] = input.data[offset + 2] = input.data[offset + 3] = 0;
          continue;
        }
        input.data[offset] = input.data[offset + 1] = input.data[offset + 2] = 255;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) throw new Error('private/f1.png has no visible pixels');

    const boundsWidth = maxX - minX + 1, boundsHeight = maxY - minY + 1;
    const padding = Math.round(Math.max(boundsWidth, boundsHeight) * 0.045);
    const width = boundsWidth + padding * 2, height = boundsHeight + padding * 2;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('Canvas 2D is unavailable');
    const cropped = outputContext.createImageData(width, height);
    for (let y = 0; y < boundsHeight; y++) {
      const sourceStart = ((minY + y) * input.width + minX) * 4;
      const destinationStart = ((y + padding) * width + padding) * 4;
      cropped.data.set(input.data.subarray(sourceStart, sourceStart + boundsWidth * 4), destinationStart);
    }
    outputContext.putImageData(cropped, 0, 0);
    return { dataUrl: outputCanvas.toDataURL('image/png'), width, height };
  }, sourceDataUrl);
  encoded = Buffer.from(result.dataUrl.slice('data:image/png;base64,'.length), 'base64');
  dimensions = { width: result.width, height: result.height };
} finally {
  await browser.close();
}

for (const outputPath of ['../assets/f1.png', '../public/assets/f1.png']) {
  await writeFile(fileURLToPath(new URL(outputPath, import.meta.url)), encoded);
}
console.log(`Processed ${sourcePath} to a padded ${dimensions.width}x${dimensions.height} white alpha mask.`);
