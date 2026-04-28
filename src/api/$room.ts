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

/** Available broadcast panel templates. */
export declare type RoomPanelTemplate =
    | "3_rows_of_labels"
    | "3_rows_11_21_31"
    | "3_rows_12_21_31"
    | "3_rows_12_22_31"
    | "image_template";

/** Templates that use row label/value fields (non-image template). */
export declare type RoomPanelRowsTemplate = Exclude<RoomPanelTemplate, "image_template">;

/** Table column object used by image-template table rows. */
export declare class RoomPanelTemplateTableColumn {
    /** Text value for this column. */
    value?: string;
    /** Text color. */
    color?: string;
    /** Text alignment. */
    "text-align"?: string;
    /** Font weight. */
    "font-weight"?: string;
    /** Font style. */
    "font-style"?: "normal"|"italic"|string;
}

/** One table row in image-template table mode. */
export declare class RoomPanelTemplateTableRow {
    /** Background color for this row. */
    "background-color"?: string;
    /** First column config. */
    col_1?: RoomPanelTemplateTableColumn;
    /** Second column config. */
    col_2?: RoomPanelTemplateTableColumn;
}

/** Table object supported by image_template. */
export declare class RoomPanelTemplateTable {
    /** Table-wide text color. */
    color?: string;
    /** Table-wide background color. */
    "background-color"?: string;
    /** Table-wide text alignment. */
    "text-align"?: string;
    /** Table-wide font weight. */
    "font-weight"?: string;
    /** Table-wide font style. */
    "font-style"?: "normal"|"italic"|string;
    /** Width of the header row in pixels. */
    width?: number;
    /** Row 1 values. */
    row_1?: RoomPanelTemplateTableRow;
    /** Row 2 values. */
    row_2?: RoomPanelTemplateTableRow;
    /** Row 3 values. */
    row_3?: RoomPanelTemplateTableRow;
}

/** Image layer for image_template. */
export declare class RoomPanelTemplateImageLayer {
    type: "image";
    /** ID assigned during image upload (typically `<uuid>.<ext>`). */
    fileID: string;
    /** Pixels from left edge (docs range: -270..270). */
    left?: number;
    /** Pixels from top edge (docs range: -69..69). */
    top?: number;
    /** Opacity (docs range: 0..1.0). */
    opacity?: number;
    /** Optional filename metadata used by editor/testbed. */
    filename?: string;
    /** Optional image URL metadata used by editor/testbed. */
    image_url?: string;
}

/** Text layer for image_template. */
export declare class RoomPanelTemplateTextLayer {
    type: "text";
    /** Text to display. */
    text: string;
    /** Pixels from left edge (docs range: -270..270). */
    left?: number;
    /** Pixels from top edge (docs range: -69..69). */
    top?: number;
    /** Text color. */
    color?: string;
    /** Font family. */
    "font-family"?: string;
    /** Font size in pixels. */
    "font-size"?: number;
    /** Font weight. */
    "font-weight"?: string;
    /** Width in pixels; overflow is hidden with ellipsis. */
    width?: number;
    /** Max-width in pixels; overflow is hidden with ellipsis. */
    "max-width"?: number;
}

/**
 * Optional table layer for image_template.
 * The docs describe table as a dedicated top-level option, but this layer shape
 * is accepted in the official editor typings and mirrors the same fields.
 */
export declare class RoomPanelTemplateTableLayer extends RoomPanelTemplateTable {
    type: "table";
}

/** Layer union for image_template. */
export declare type RoomPanelTemplateLayer =
    | RoomPanelTemplateImageLayer
    | RoomPanelTemplateTextLayer
    | RoomPanelTemplateTableLayer;

/** Options for row-based panel templates. */
export declare class RoomPanelTemplateRowsOptions {
    template: RoomPanelRowsTemplate;
    /** 1st row label, e.g. "Tokens received:". */
    row1_label?: string;
    /** 1st row value, e.g. "15 tokens". */
    row1_value?: string;
    /** 2nd row label. */
    row2_label?: string;
    /** 2nd row value. */
    row2_value?: string;
    /** 3rd row label. */
    row3_label?: string;
    /** 3rd row value. */
    row3_value?: string;
}

/** Options for image_template panel rendering. */
export declare class RoomPanelTemplateImageOptions {
    template: "image_template";
    /**
     * List of image/text/table layers applied in order.
     * Panel dimensions are 270 x 69 pixels.
     */
    layers?: RoomPanelTemplateLayer[];
    /** Optional table object (1-3 rows). */
    table?: RoomPanelTemplateTable;
}

/** Full setPanelTemplate options union. */
export declare type RoomPanelTemplateOptions =
    | RoomPanelTemplateRowsOptions
    | RoomPanelTemplateImageOptions;

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

    /**
     * A string describing the gender of the room owner (broadcaster).
     * Possible values: m, f, c, t
     */
    readonly ownerGender: "m"|"f"|"c"|"t";

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
    reloadPanel(): void;

    /**
     * Send a message to the room, or to a specific user in the room.
     * @param message The message string.
     * @param options The options object, described below. Each object value is optional. Defaults to {}.
     */
    sendNotice(message: string, options?: RoomNoticeOptions): void;

    /**
     * Set the contents of a user’s broadcast panel.
     * @param options The Options object, described below. Each object value is optional. Defaults to {}.
     */
    setPanelTemplate(options: RoomPanelTemplateOptions): boolean;

    /**
     * Set the subject in the room.
     * @param subject The new subject as a string. The max length is 200 characters.
     */
    setSubject(subject: string): void;

    /**
     * Set tip options that appear in the tip dialog for users in this room.
     * @param options The Options object.
     */
    setTipOptions(options: RoomTipOptions): void;
}

export declare const $room: Room;
