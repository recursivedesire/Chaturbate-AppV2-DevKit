import {SmartNoticeTimer} from '@lib/smart_notice_timer';
import {$room} from '@api/$room';
import {$user} from '@api/$user';
import {publishExample, readExample} from '../command_system/publish_example';

const timer = new SmartNoticeTimer({
  namespace: 'snt_demo',
  defaultVisibleRows: 10,
  defaultCharsPerRow: 45,
  slotCount: 10,
});

timer.enqueue('Menu notice', undefined, {category: 'menu'});

timer.enqueue('Goal update!', {color: '#FFD700', fontWeight: 'bold'}, {
  category: 'goal', priority: 5,
});

timer.enqueue('Welcome!', {color: '#00AAFF'}, {category: 'custom'});

timer.onUserMessage($user, 'hello chat');

timer.processForUser($user);

const state = timer.getState();
const userState = timer.getUserState($user.username);

publishExample('__EXAMPLE_SMART_NOTICE_TIMER_01__', {
  user: $user.username,
  pendingCategories: Object.keys(state.pendingByCategory).sort(),
  activeCount: Object.values(state.activeByCategory).filter(Boolean).length,
  ledgerSize: Object.keys(state.ledger).length,
  userSlot: userState?.slot,
  noticesSent: $room.__notices?.length ?? 0,
});
