/**
 * Holds information about fanclub membership that has been purchased by a user.
 * Available only on the Fanclub Join event handler.
 */
export declare class Fanclub {
    /** Whether the user is a new fanclub user. False means the user is extending their existing membership. */
    readonly isNew: boolean;
}

export declare const $fanclub: Fanclub;
