/**
 * Utility module that re-exports all utility functions and constants.
 *
 * Available as the global `Utils` object at runtime, or can be imported
 * directly for tree-shaking.
 *
 * @module
 */
import GLib from 'gi://GLib';
import * as Exec from './utils/exec.js';
import * as File from './utils/file.js';
import * as Etc from './utils/etc.js';
import * as Timeout from './utils/timeout.js';
import * as Fetch from './utils/fetch.js';
import * as Notify from './utils/notify.js';
import * as Pam from './utils/pam.js';
import * as Gobject from './utils/gobject.js';
import * as Binding from './utils/binding.js';
import * as System from './utils/system.js';

/** The current system user's login name. */
export const USER = GLib.get_user_name();
/** The current user's home directory path. */
export const HOME = GLib.get_home_dir();
/** The AGS cache directory path (e.g., `~/.cache/ags`). */
export const CACHE_DIR = `${GLib.get_user_cache_dir()}/${pkg.name.split('.').pop()}`;

export const { exec, execAsync, subprocess } = Exec;

export const { readFile, readFileAsync, writeFile, writeFileSync, monitorFile } = File;

export const { timeout, interval, idle, onFrame } = Timeout;

export const { loadInterfaceXML, bulkConnect, bulkDisconnect, ensureDirectory, lookUpIcon } = Etc;

export const { authenticate, authenticateUser } = Pam;

export const { fetch } = Fetch;
export const { notify } = Notify;

export const { kebabify, pspec, registerGObject } = Gobject;

export const { merge, derive, watch } = Binding;

export const { cpuUsage, memUsage, temperature, uptime, networkRates, diskUsage } = System;

export default {
    USER,
    HOME,
    CACHE_DIR,

    exec,
    execAsync,
    subprocess,

    readFile,
    readFileAsync,
    writeFile,
    writeFileSync,
    monitorFile,

    timeout,
    interval,
    idle,
    onFrame,

    loadInterfaceXML,
    bulkConnect,
    bulkDisconnect,
    ensureDirectory,
    lookUpIcon,

    fetch,
    notify,

    authenticate,
    authenticateUser,

    kebabify,
    pspec,
    registerGObject,

    merge,
    derive,
    watch,

    cpuUsage,
    memUsage,
    temperature,
    uptime,
    networkRates,
    diskUsage,
};
