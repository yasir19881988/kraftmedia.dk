import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import chokidar from 'chokidar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const htmlDir = path.join(srcDir, 'html');
const scssDir = path.join(srcDir, 'scss');
const jsDir = path.join(srcDir, 'js');
const imagesDir = path.join(srcDir, 'images');
const distDir = path.join(rootDir, 'dist');
const distCssDir = path.join(distDir, 'css');
const distJsDir = path.join(distDir, 'js');
const distImagesDir = path.join(distDir, 'images');
const outputHtmlFile = path.join(rootDir, 'index.html');

const args = new Set(process.argv.slice(2));
const watchMode = args.has('--watch');
const cleanOnly = args.has('--clean');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function copyRecursive(source, destination) {
  await ensureDir(destination);
  const entries = await fs.readdir(source, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(sourcePath, destinationPath);
      return;
    }

    await fs.copyFile(sourcePath, destinationPath);
  }));
}

async function renderTemplate(template, currentDir) {
  const includePattern = /\{\{>\s*([^\s}]+)\s*\}\}/g;
  let result = template;
  let match;

  while ((match = includePattern.exec(template)) !== null) {
    const partialPath = match[1];
    const filePath = path.join(htmlDir, partialPath + '.html');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const rendered = await renderTemplate(fileContent, path.dirname(filePath));
    result = result.replace(match[0], rendered);
  }

  return result;
}

async function buildHtml() {
  const pageTemplate = await fs.readFile(path.join(htmlDir, 'page.html'), 'utf8');
  const html = await renderTemplate(pageTemplate, htmlDir);
  await fs.writeFile(outputHtmlFile, html + (html.endsWith('\n') ? '' : '\n'));
}

async function buildScssEntry(entryName, outputName) {
  const sourceFile = path.join(scssDir, entryName);
  const result = sass.compile(sourceFile, {
    style: 'expanded',
    loadPaths: [scssDir]
  });

  await ensureDir(distCssDir);
  await fs.writeFile(path.join(distCssDir, outputName), result.css);
}

async function buildStyles() {
  await buildScssEntry('style.scss', 'style.css');
  await buildScssEntry('site-overrides.scss', 'site-overrides.css');
}

async function buildScripts() {
  await ensureDir(distJsDir);
  await fs.copyFile(path.join(jsDir, 'main.js'), path.join(distJsDir, 'main.js'));
}

async function buildImages() {
  await copyRecursive(imagesDir, distImagesDir);
}

async function buildAll() {
  await ensureDir(distDir);
  await Promise.all([
    buildHtml(),
    buildStyles(),
    buildScripts(),
    buildImages()
  ]);
}

async function clean() {
  await removeIfExists(distCssDir);
  await removeIfExists(distJsDir);
  await removeIfExists(distImagesDir);
  await removeIfExists(outputHtmlFile);
}

async function main() {
  if (cleanOnly) {
    await clean();
    return;
  }

  await buildAll();

  if (!watchMode) {
    return;
  }

  const watcher = chokidar.watch([
    path.join(htmlDir, '**/*.html'),
    path.join(scssDir, '**/*.scss'),
    path.join(jsDir, '**/*.js'),
    path.join(imagesDir, '**/*')
  ], { ignoreInitial: true });

  const rebuild = async (filePath) => {
    try {
      if (filePath.endsWith('.html')) {
        await buildHtml();
      } else if (filePath.endsWith('.scss')) {
        await buildStyles();
      } else if (filePath.endsWith('.js')) {
        await buildScripts();
      } else {
        await buildImages();
      }
      console.log('Rebuilt after change:', path.relative(rootDir, filePath));
    } catch (error) {
      console.error(error);
    }
  };

  watcher.on('add', rebuild);
  watcher.on('change', rebuild);
  watcher.on('unlink', rebuild);
  watcher.on('unlinkDir', rebuild);

  console.log('Watching for changes...');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
