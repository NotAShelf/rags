import './overrides.js';
import GLib from 'gi://GLib';
import app from './app.js';
import { parsePath } from './utils/init.js';
import { AgsConfigError } from './utils/errors.js';

const parts = pkg.name.split('.');
const BIN_NAME = parts[parts.length - 1];
if (!BIN_NAME) {
    throw new AgsConfigError('Invalid package name format', {
        packageName: pkg.name,
    });
}
const APP_BUS = (name: string) => `${pkg.name}.${name}`;
const APP_PATH = (name: string) => `/${pkg.name.split('.').join('/')}/${name}`;
const DEFAULT_CONF = `${GLib.get_user_config_dir()}/${BIN_NAME}/config.js`;

function nextArg(args: string[], i: number, flag: string): string {
    if (i + 1 >= args.length) {
        console.error(`${flag} requires an argument`);
        return '';
    }
    return args[i + 1];
}

export async function main(args: string[]) {
    const flags = {
        busName: BIN_NAME,
        config: DEFAULT_CONF,
        inspector: false,
        runJs: '',
        runFile: '',
        toggleWindow: '',
    };

    for (let i = 1; i < args.length; ++i) {
        switch (args[i]) {
            case '-b':
            case '--bus-name':
                flags.busName = nextArg(args, i, args[i]);
                ++i;
                break;

            case '-c':
            case '--config':
                flags.config = parsePath(nextArg(args, i, args[i]));
                ++i;
                break;

            case '-i':
            case '--inspector':
                flags.inspector = true;
                break;

            case '-r':
            case '--run-js':
                flags.runJs = nextArg(args, i, args[i]);
                ++i;
                break;

            case '-f':
            case '--run-file':
                flags.runFile = parsePath(nextArg(args, i, args[i]));
                ++i;
                break;

            case '-t':
            case '--toggle-window':
                flags.toggleWindow = nextArg(args, i, args[i]);
                ++i;
                break;

            default:
                if (!args[i].startsWith('-')) flags.config = parsePath(args[i]);
                else console.error(`unknown option: ${args[i]}`);
                break;
        }
    }

    const configDir = flags.config.split('/').slice(0, -1).join('/');
    const bus = APP_BUS(flags.busName);
    const path = APP_PATH(flags.busName);

    app.setup(bus, path, configDir, flags.config);
    app.connect('config-parsed', () => {
        if (flags.toggleWindow) app.ToggleWindow(flags.toggleWindow);
        if (flags.runJs) app.RunJs(flags.runJs);
        if (flags.runFile) app.RunFile(flags.runFile);
        if (flags.inspector) app.Inspector();
    });

    // @ts-expect-error missing type declaration
    return app.runAsync(null);
}
