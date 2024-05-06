/**
 * Holds information about media sets that have been purchased by a user. Available only on the Media Purchase event handler.
 */
export declare class Media {
    /** The ID of media set purchased */
    readonly id: string;

    /** Name of the media set. */
    readonly name: string;

    /** Amount of tokens spent. */
    readonly tokens: number;

    /**
     * A string describing the media type.
     * Possible values: photos, video, socialMedia
     */
    readonly type: "photos"|"video"|"socialMedia";
}

export declare const $media: Media;
