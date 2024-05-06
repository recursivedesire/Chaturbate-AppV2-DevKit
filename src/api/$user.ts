/**
 * Holds information about the user that triggered an event.
 */
export declare class User {
    /**
     * A string indicating the user's color group.
     * Possible values: o, m, f, l. p. tr, t. g
     */
    readonly colorGroup: "o"|"m"|"f"|"l"|"p"|"tr"|"t"|"g";

    /**
     * A string describing the user's gender.
     * Possible values: m, f, c, t
     */
    readonly gender: "m"|"f"|"c"|"t";

    /** True if the user has dark mode. */
    readonly hasDarkMode: boolean;

    /** True if the user has at least 1 token. */
    readonly hasTokens: boolean;

    /** True if the user is a fanclub member. */
    readonly inFanclub: boolean;

    /** True if user's fanclub membership is a recurring subscription. */
    readonly fcAutoRenew: boolean;

    /** True if the user is in broadcaster's private show. */
    readonly inPrivateShow: boolean;

    /** True if the user is currently broadcasting. */
    readonly isBroadcasting: boolean;

    /** True if the user is a follower. */
    readonly isFollower: boolean;

    /** True if the user is a moderator. */
    readonly isMod: boolean;

    /** True if the user is the owner of the room. */
    readonly isOwner: boolean;

    /** True if the user is silenced. */
    readonly isSilenced: boolean;

    /** True if the user is spying. */
    readonly isSpying: boolean;

    /**
     * User's preferred language.
     * Possible values: de, en, es, fr, it, ja, ko, pl, pt, ru, zh
     */
    readonly language: "de"|"en"|"es"|"fr"|"it"|"ja"|"ko"|"pl"|"pt"|"ru"|"zh";

    /**
     * String describing how much the user has tipped recently.
     * Possible values: none, few, some, lots, tons
     */
    readonly recentTips: "none"|"few"|"some"|"lots"|"tons";

    /**
     * A string describing the user's subgender. Subgenders are only available when $user.gender is trans. If $user.gender is not trans, an empty string will be returned.
     * Possible values: "", tf, tm, tn
     */
    readonly subgender: ""|"tf"|"tm"|"tn";

    /** User's username. */
    readonly username: string;
}

export declare const $user: User;
