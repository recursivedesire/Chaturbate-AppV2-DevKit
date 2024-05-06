/**
 * Holds information about a tip that was sent to the room. Available only on the Tip event handler.
 */
export declare class Tip {
    /** Amount of tokens in tip. */
    readonly tokens: number;

    /** Optional tip message. If a tip option was selected, it will be appended to this message. */
    readonly message: string;

    /** Whether the tipping user wishes the tip to be made anonymously. If true, make sure to honor this preference by not publishing the username of the tipper. */
    readonly isAnon: boolean;
}

export declare const $tip: Tip;
