export declare class Overlay {
	/**
	 * Can be used to send events to Broadcast Overlays. This method is available in any Event Handler.
	 * @param eventName Name of the event to emit.
	 * @param data Data to send with the event.
	 */
	emit(eventName: string, data: any): void;

	/**
	 * Can be used to receive events in Broadcast Overlays. This method is available only in Broadcast Overlay JS.
	 * @param eventName Name of the event to listen for.
	 * @param callback Callback function to execute when the event is received.
	 * @param delay If set, will ensure that no other events of this type are processed for the given time period. This gives the callback time to execute before the next event is processed in order to (for example) play an animation.
	 */
	on(eventName: string, callback: (data: any) => void, delay?: number): void;
}

export declare const $overlay: Overlay;