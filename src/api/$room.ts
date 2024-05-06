export declare class RoomNoticeOptions {
    /** Recipient's username. */
    toUsername?: string;

    /** Text color. Any valid CSS color, e.g. #00AA00 or rgb(0,200,0). Default is #000000. */
    color?: string;

    /** Background color. Any valid CSS color, or linear-gradient. Default is #FFFFFF. */
    bgColor?: string;

    /** Valid options are normal, bold or bolder. Default is normal. */
    fontWeight?: "normal"|"bold"|"bolder";

    /**
     * Send message to users belonging to this color group.
     * Valid options are red, green, darkblue, lightpurple, darkpurple, lightblue.
     */
    toColorGroup?: "red"|"green"|"darkblue"|"lightpurple"|"darkpurple"|"lightblue";
}

export declare class RoomTipOptions {
    /** The main label of your options, displayed above the options dropdown menu. */
    label: string;

    /** The optionsList array */
    options: { label: string }[];
}

/**
 * This object holds attributes belonging to the room the app is running in, and offers methods for manipulating the room.
 */
export declare class Room {
    /** Number of anonymous users in the room. */
    readonly anonCount: number;

    /**
     * A string describing which users can chat in the room.
     * Possible values: all, tip_recent, tip_anytime, tokens
     */
    readonly chatAllowedBy: "all"|"tip_recent"|"tip_anytime"|"tokens";

    /** Price (in tokens) for joining the room's fanclub. */
    readonly fanclubPrice: number;

    /** Number of followers the room has. */
    readonly followerCount: number;

    /**
     * Array of 1-4 strings representing the genders that can see the room.
     * Possible values: m, f, c, t
     */
    readonly genders: ("m"|"f"|"c"|"t")[];

    /** Room username (broadcaster). */
    readonly owner: string;

    /** Shows if the room allows private shows. True if the room allows private shows, false if not. */
    readonly psEnabled: boolean;

    /** Minimum amount of tokens a user must have to request a private show. */
    readonly psMinBalance: number;

    /** Minimum number of minutes a private show will last. */
    readonly psMinTime: number;

    /** Amount of tokens per minute a private show costs. */
    readonly psPrice: number;

    /** Shows if the room allows private shows to be recorded. True if the room allows private shows to be recorded, false if not. */
    readonly psRecEnabled: boolean;

    /** Amount of tokens per minute spying on a private show costs. */
    readonly psSpyPrice: number;

    /**
     * A string describing the room status.
     * Possible values: public, private, hidden, away, offline, password protected
     */
    readonly status: "public"|"private"|"hidden"|"away"|"offline"|"password protected";

    /** Room subject. */
    readonly subject: string;

    /**
     * An array of arrays, each with three strings inside: username, color group and gender.
     * Possible values for Color Groups: o, m, f, l, p, tr, t, g
     * Possible values for Gender: m, f, c, t
     */
    readonly users: [string, "o"|"m"|"f"|"l"|"p"|"tr"|"t"|"g", "m"|"f"|"c"|"t"][];

    /**
     * Trigger all users in the room to reload their broadcast panels.
     * Note, broadcast panel contents are set in the Broadcast Panel Update event handler.
     */
    reloadPanel();

    /**
     * Send a message to the room, or to a specific user in the room.
     * @param message The message string.
     * @param options The options object, described below. Each object value is optional. Defaults to {}.
     */
    sendNotice(message: string, options?: RoomNoticeOptions);

    /**
     * Set the contents of a user’s broadcast panel.
     * TODO: add options class
     * @param options The Options object, described below. Each object value is optional. Defaults to {}.
     */
    setPanelTemplate(options: object): boolean;

    /**
     * Set the subject in the room.
     * @param subject The new subject as a string. The max length is 200 characters.
     */
    setSubject(subject: string);

    /**
     * Set tip options that appear in the tip dialog for users in this room.
     * @param options The Options object.
     */
    setTipOptions(options: RoomTipOptions);
}

export declare const $room: Room;
