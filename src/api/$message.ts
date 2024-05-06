/**
 * Contains information about a room message in the Chat Message event handler, and additionally,
 * methods for transforming the message in the Chat Message Transform event handler.
 */
export declare class Message {
    /** Background color (any valid hexadecimal color or CSS color name). */
    bgColor: string;

    /** The body (text) of the message. */
    body: string;

    /** Message color (any valid hexadecimal color or CSS color name). */
    color: string;

    /**
     * Message font.
     * Possible values: Default, Arial, Bookman Old Style, Comic Sans, Courier, Lucida, Palantino, Tahoma, Times New Roman
     */
    font: "Default"|"Arial"|"Bookman Old Style"|"Comic Sans"|"Courier"|"Lucida"|"Palantino"|"Tahoma"|"Times New Roman";

    /** Whether the message is marked as spam. If true, the message will not be shown in the chat. */
    isSpam: boolean;

    /** The original message body before any message transformations. */
    orig: string;

    /**
     * Set message background color.
     * @param color Any valid hexadecimal color or any valid CSS color name
     */
    setBgColor(color: string);

    /**
     * Set body (text) of the message.
     * @param body The text of the message.
     */
    setBody(body: string);

    /**
     * Set message color.
     * @param color Any valid hexadecimal color or any valid CSS color name
     */
    setColor(color: string);

    /**
     * Set message font.
     * @param font Any valid available font.
     *     Possible values: Default, Arial, Bookman Old Style, Comic Sans, Courier, Lucida, Palantino, Tahoma, Times New Roman
     */
    setFont(font: "Default"|"Arial"|"Bookman Old Style"|"Comic Sans"|"Courier"|"Lucida"|"Palantino"|"Tahoma"|"Times New Roman");

    /**
     * Set whether the message is marked as spam.
     * @param isSpam Boolean indicating if message is spam.
     */
    setSpam(isSpam: boolean);
}

export declare const $message: Message;
