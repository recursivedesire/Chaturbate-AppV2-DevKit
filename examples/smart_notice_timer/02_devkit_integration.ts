import {SmartNoticeTimer} from '@lib/smart_notice_timer';

// ============================================================
// shared_code.ts  --  configure, create, and export once
// ============================================================
const notices = new SmartNoticeTimer({
  namespace: 'notices',
  callbackDelaySec: 1,
});

notices.configureChannel('rules', {
  maxPending: 1,
  activeConflict: 'wait',
  pendingOverflow: 'replace_all',
});

notices.configureChannel('system', {
  maxPending: 1,
  activeConflict: 'cancel_active_if_higher_priority',
  pendingOverflow: 'replace_lower_priority',
});

notices.configureChannels({
  menu: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
  goal: { maxPending: 2, activeConflict: 'cancel_active_if_higher_priority', pendingOverflow: 'drop_oldest' },
});

export {notices};

// ============================================================
// app_start.ts  --  schedule the repeating platform callback
// ============================================================
notices.onAppStart();

// ============================================================
// callback.ts  --  platform fires this every callbackDelaySec
// ============================================================
notices.onCallback();

// ============================================================
// user_enter.ts  --  user enters the room
// ============================================================
notices.onUserEnter();

// ============================================================
// user_leave.ts  --  user leaves the room
// ============================================================
notices.onUserLeave();

// ============================================================
// chat_message.ts  --  user sends a chat message
// ============================================================
notices.onChatMessage();

// ============================================================
// managed notice via enqueue (queue + campaign delivery):
// ============================================================
notices.enqueue('Welcome!', {color: '#00AAFF'}, {channel: 'custom'});
notices.enqueue('Read the rules', {color: '#FF0000'}, {channel: 'rules'});

// ============================================================
// immediate unmanaged notice (counted, no queue):
// ============================================================
notices.sendNotice('Flash sale!', {color: '#FFD700', fontWeight: 'bold'}, {
  channel: 'custom',
  params: {},
  affectCooldown: false,
});

// ============================================================
// cancel / dequeue if needed:
// ============================================================
notices.dequeue('menu');       // remove pending menu notices
notices.cancelActive('goal');  // cancel active goal campaign
