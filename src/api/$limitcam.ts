/**
 * Limitcam attributes and methods let you manage Limitcam shows.
 * It allows apps to hide the video feed from some or all users in a room,
 * and then conditionally letting them see the video feed again,
 * by adding them to the Limitcam allow-list.
 * You can use this to create pay-for-access type room features.
 */
export declare class Limitcam {
    /** Check if a Limitcam session is currently active. */
    readonly active: boolean;
    /** An array of usernames as strings, of all users that have been added to the Limitcam allow-list. */
    readonly users: string[];

    /**
     * Add users to the allow-list.
     * @param users An array of usernames that should be added to the allow-list of users who can see the cam during a Limitcam session.
     */
    add(users: string[]);

    /**
     * Check if a user is in the allow-list.
     * @param username The username that you want to check.
     */
    hasAccess(username: string): boolean;

    /**
     * Remove users from the allow-list.
     * @param users An array of usernames that should be removed from the allow-list of users who can see the cam during a Limitcam session.
     */
    remove(users: string[]);

    /** Remove all users from the allow-list. */
    removeAll();

    /**
     * Start the Limitcam show.
     * @param message A message displayed on the cam for users that can't see it, eg "Limitcam session in progress".
     * @param users An array of usernames that should be able to see the cam during the Limitcam session. Defaults to [].
     */
    start(message: string, users?: string[]);

    /** Stop the Limitcam show. */
    stop();
}

export declare const $limitcam: Limitcam;
