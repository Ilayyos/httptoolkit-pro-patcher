<h1 align="center">HTTP Toolkit Pro Patcher</h1>

## Modular, Version-Agnostic Patching System

This patcher now supports a modular, robust patching system using both AST-based and flexible regex-based patching. Each patch is a separate file in the `patches/` directory, making it easy to add, remove, or update patches for new versions of HTTP Toolkit.

## How It Works

- **patch.js** is the patch loader and applier. It loads all `.js` files in the `patches/` directory and applies them in order to the target file.
- Each patch receives the source code and a context object (with logger and version info), and returns the patched code.
- Patches can use AST tools ([recast](https://www.npmjs.com/package/recast), [@babel/parser](https://www.npmjs.com/package/@babel/parser)) for robust, version-agnostic code manipulation, or use flexible regex for simple cases.
- All patches include error handling and fallbacks: if a patch fails, the patcher logs the error and continues with the next patch.

## Usage

1. Clone this repository using `git clone https://github.com/IPTVmanreal/httptoolkit-pro-patcher.git`
2. cd into the directory using `cd httptoolkit-pro-patcher`
3. Run `npm install` or whatever package manager you use
4. Run `node . patch` to patch the HTTP Toolkit

That's it! The HTTP Toolkit should now have the Pro features enabled.

***Tip**: You can also run `node . restore` to restore the original HTTP Toolkit.*

**Note**: You may need to run the patcher again after updating the HTTP Toolkit.

## CLI Usage

```sh
Usage: node . <command> [options]

Commands:
  patch    Patch HTTP Toolkit
  restore  Restore HTTP Toolkit
  start    Start HTTP Toolkit with debug logs enabled

Options:
      --version  Show version number                                   [boolean]
  -p, --proxy    Specify a global proxy (only http/https supported)     [string]
  -P, --path     Specify the path to the HTTP Toolkit folder (auto-detected by d
                 efault)                                                [string]
  -h, --help     Show this help message                                [boolean]

You need at least one command before moving on
```

## Using with Proxy

If you want to add a proxy to the patcher, you can set the use the `--proxy` option. For example, `node . patch --proxy http://x.x.x.x:8080`.

You can also set the `PROXY` environment variable to use a proxy. For example, `PROXY=http://x.x.x.x:8080 node . start`.

**Note**: The proxy must be an HTTPS/HTTP proxy. SOCKS proxies are not supported.

**Note**: `Proxy` is only used for the patcher. The HTTP Toolkit itself will not use the proxy, so you will need to configure the HTTP Toolkit to use the proxy if you want to use it.

![HTTP Toolkit Proxy Settings](https://i.imgur.com/Ti2vIgb.png)

## Example Patch: Pro Plan Injection

See `patches/patch-pro-plan.js` for an example of using AST to inject a static property into a class.

## Error Handling & Fallbacks

- If a patch throws an error, it is logged and the patcher continues with the next patch.
- If a patch cannot find the code to patch, it logs a warning and returns the original source.

## Context Object

Each patch receives a `context` object:
- `context.logger`: Logging methods (`info`, `warn`, `error`)
- `context.version`: Detected version of the target file (if available)

## Why Modular & AST-Based?

- **Version-agnostic:** Patches are robust to code changes between versions.
- **Easy to extend:** Add new patches for new features or versions without touching the core patcher.
- **Safe:** Errors in one patch do not break the patching process.

## Advanced: Writing AST Patches

- Use [recast](https://www.npmjs.com/package/recast) and [@babel/parser](https://www.npmjs.com/package/@babel/parser) to parse, traverse, and modify JavaScript code as an AST.
- See `patches/patch-pro-plan.js` and `patches/patch-bypass-telemetry.js` for examples.

## Patch Management Best Practices

- **Test patches on a staging copy before deploying to production.**
- **Keep backups of original files.**
- **Document each patch's purpose and logic.**
- **Monitor for new versions and update patches as needed.**

For more on patch management process, see [Puppet's Patch Management Process Guide](https://www.puppet.com/blog/patch-management-process).

## Requirements

- [Node.js](https://nodejs.org) (v15 or higher) (with npm 7 at least)

## Compatibility

- **Windows**: ✔
- **Linux**: ✔
- **macOS**: ✔

## Known Issues

- **Linux**: Try using `sudo` if you get permission errors
- If you get an error like `No internet connection and file is not cached`, it means the patcher is unable to connect to the internet. Make sure you have an active internet connection and try again. If you are using a proxy, make sure proxy is working well.
- If HTTP Toolkit does not start after patching, try updating your Node.js version to the latest version.
- **macOS**: You may need to enable "App Management" for your terminal emulator in Privacy & Security if you get permission errors.

## Screenshot

![Screenshot](https://i.imgur.com/eAmDmZF.png)
<small>Background: [Doki Theme](https://github.com/doki-theme/doki-theme-vscode)</small>

## License

This project is licensed under the [MIT License](LICENSE).

## Disclaimer

This project is for educational purposes only. I do not condone piracy or any illegal activities. Use at your own risk.

## Credits

- [HTTP Toolkit](https://httptoolkit.com) for the awesome app
- [Titoot](https://github.com/Titoot) for the creating the [httptoolkit-interceptor](https://github.com/Titoot/httptoolkit-interceptor)
- [XielQ](https://github.com/XielQs) for the creator of the original patcher

## ⭐️ Show Your Support

If you found this project helpful or interesting, please give it a star! 🌟

[![Star History Chart](https://api.star-history.com/svg?repos=IPTVmanreal/httptoolkit-pro-patcher&type=Date)](https://star-history.com/#IPTVmanreal/httptoolkit-pro-patcher&Date)
