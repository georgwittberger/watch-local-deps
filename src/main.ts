#!/usr/bin/env node

import chokidar from 'chokidar';
import { consola } from 'consola';
import { execa } from 'execa';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exit } from 'node:process';
import packageJson from '../package.json' with { type: 'json' };

consola.box(`watch-local-deps v${packageJson.version}\n\nPress CTRL + C to exit.`);

const configFilename = 'watch-local-deps.json';
const configPath = path.resolve(configFilename);
consola.debug('Configuration file:', configPath);

interface PackageConfig {
  localDir: string;
  watchDirs: string[];
  installDebounceMs?: number;
}

interface Config {
  packages: Record<string, PackageConfig>;
}

let config: Config = { packages: {} };
try {
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configRaw);
} catch (error) {
  consola.error(new Error(`Failed to read or parse "${configFilename}". Make sure this file exists in the current working directory and has valid JSON format.`, { cause: error }));
  exit(1);
}

async function createPackageTarball(packageName: string, packageConfig: PackageConfig, tarballDir: string): Promise<string> {
  const packageLocalPath = path.resolve(packageConfig.localDir);
  consola.debug(`Creating tarball for package "${packageName}" at: ${packageLocalPath}`);

  const { stdout } = await execa`npm pack ${packageLocalPath} --pack-destination ${tarballDir} --json`

  let tarballName;
  try {
    const json = JSON.parse(stdout);
    tarballName =
      Array.isArray(json) && json.length > 0 ? json[0].filename : null;
  } catch (error) {
    throw new Error('Error parsing tarball name from npm pack output.', { cause: error });
  }

  if (!tarballName) {
    throw new Error('Could not determine tarball name from npm pack output.');
  }

  const tarballPath = path.join(tarballDir, tarballName);
  consola.debug(`Tarball created for "${packageName}": ${tarballPath}`);
  return tarballPath;
}

async function installPackageTarball(packageName: string, tarballPath: string): Promise<void> {
  consola.debug(`Installing package "${packageName}" from tarball: ${tarballPath}`);
  await execa`npm install ${tarballPath} --no-save`;
  consola.success(`Package "${packageName}" installed successfully.`);
}

async function installPackage(packageName: string, packageConfig: PackageConfig): Promise<void> {
  let tmpDir = '';
  try {
    consola.info(`Installing package "${packageName}".`);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-local-deps-'));
    const tarballPath = await createPackageTarball(packageName, packageConfig, tmpDir);
    await installPackageTarball(packageName, tarballPath);
  } catch (error) {
    consola.error(new Error(`Failed to install package "${packageName}".`, { cause: error }));
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

const packageInstallTimeouts = new Map<string, NodeJS.Timeout>();
const packageNamesInstalling = new Set<string>();

function handlePackageChange(packageName: string, packageConfig: PackageConfig): void {
  if (packageInstallTimeouts.has(packageName)) {
    clearTimeout(packageInstallTimeouts.get(packageName)!);
    packageInstallTimeouts.delete(packageName);
  }

  const timeout = setTimeout(async () => {
    packageInstallTimeouts.delete(packageName);
    if (packageNamesInstalling.has(packageName)) {
      consola.warn(`Package "${packageName}" is already pending installation. Ignoring this change.`);
      return;
    }

    try {
      packageNamesInstalling.add(packageName);
      await installPackage(packageName, packageConfig);
    } finally {
      packageNamesInstalling.delete(packageName);
    }
  }, packageConfig.installDebounceMs ?? 500);

  packageInstallTimeouts.set(packageName, timeout);
}

function watchPackage(packageName: string, packageConfig: PackageConfig): void {
  if (!packageConfig.localDir || !Array.isArray(packageConfig.watchDirs)) {
    consola.error(new Error(`Invalid configuration for package "${packageName}". Make sure it has "localDir" and "watchDirs" properties.`));
    return;
  }

  const packageLocalPath = path.resolve(packageConfig.localDir);
  consola.info(`Watching package "${packageName}" at: ${packageLocalPath}`);

  if (!fs.existsSync(packageLocalPath)) {
    consola.warn(`Package directory "${packageLocalPath}" does not exist. This may be a configuration error.`);
  }

  chokidar
    .watch(packageConfig.watchDirs, { cwd: packageLocalPath, ignoreInitial: true })
    .on('all', (event, filePath) => {
      if (!filePath) return;
      consola.debug(`File change detected in "${packageName}": ${event} ${filePath}`);
      handlePackageChange(packageName, packageConfig);
    });
}

Object.entries(config.packages).forEach(([packageName, packageConfig]) => {
  watchPackage(packageName, packageConfig);
});
