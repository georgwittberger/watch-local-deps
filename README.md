# watch-local-deps

CLI to automatically reinstall local dependencies on changes. This tool watches the local directories of specified packages that your project depends on and reinstalls them whenever changes are detected, streamlining local development workflows.

A typical use case is the development of applications which depend on a shared library. Imagine you want to test some new feature developed in that library in one dependent application. Approaches like using `npm link` have downsides when it comes to dependency management and hot module reloading.

This tool automatically reinstalls the library as a normal NPM package in your application when changes are detected in the library's local directory by executing the following steps:

1. Create tarball using `npm pack` in the library project. The tarball is stored in a temporary directory.
2. Install the tarball in your application project using `npm install --no-save`.

## Configuration File

Create a `watch-local-deps.json` file in the root directory of the project which depends on packages you want to watch. The configuration must follow the schema defined in [`config-schema.json`](./config-schema.json).

**Example configuration:**

```json
{
  "$schema": "https://raw.githubusercontent.com/georgwittberger/watch-local-deps/refs/tags/v1.0.0/config-schema.json",
  "packages": {
    "my-library": {
      "localDir": "../my-library",
      "watchDirs": ["dist"],
      "installDebounceMs": 1000
    },
    "another-package": {
      "localDir": "../another-package",
      "watchDirs": ["out", "public"]
    }
  }
}
```

- `localDir`: Path to the local package directory (absolute or relative to configuration file). This is the directory from which the tarball is created on changes.
- `watchDirs`: Array of directories (relative to `localDir`) to watch for changes inside the package directory. If the watched package has a build script you should only watch the directories containing the build output.
- `installDebounceMs`: (Optional) Debounce time in milliseconds before package is reinstalled in your project (default: 500). Increase this time if the build process of the watched package takes longer between individual files. Ensures that package is only reinstalled after build is complete.

## Global Usage

Install the CLI globally:

```bash
npm install --global @georgwittberger/watch-local-deps
```

Run the watcher in your project directory:

```bash
watch-local-deps
```

## Local Usage in NPM Scripts

Install as a development dependency:

```bash
npm install --save-dev @georgwittberger/watch-local-deps
```

Add a script to your `package.json`:

```json
{
  "scripts": {
    "watch-local-deps": "watch-local-deps"
  }
}
```

Run via npm in your project directory:

```bash
npm run watch-local-deps
```

## License

This project is licensed under the [MIT License](./LICENSE).
