/**
 * PAM authentication utilities.
 *
 * Wraps GUtils PAM bindings for authenticating users from within AGS.
 * Useful for lock screen implementations.
 *
 * @module
 */
//@ts-expect-error missing types
import GUtils from 'gi://GUtils';
import Gio from 'gi://Gio';

/**
 * Authenticates the current user with the given password via PAM.
 *
 * @param password - The password to verify
 * @returns A promise that resolves on success or rejects on failure
 */
export function authenticate(password: string) {
    return new Promise((resolve, reject) => {
        GUtils.authenticate(password, 0, null, (_: unknown, res: Gio.AsyncResult) => {
            try {
                resolve(GUtils.authenticate_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Authenticates a specific user with the given password via PAM.
 *
 * @param username - The username to authenticate
 * @param password - The password to verify
 * @returns A promise that resolves on success or rejects on failure
 */
export function authenticateUser(username: string, password: string) {
    return new Promise((resolve, reject) => {
        GUtils.authenticate_user(
            username,
            password,
            0,
            null,
            (_: unknown, res: Gio.AsyncResult) => {
                try {
                    resolve(GUtils.authenticate_finish(res));
                } catch (e) {
                    reject(e);
                }
            },
        );
    });
}
