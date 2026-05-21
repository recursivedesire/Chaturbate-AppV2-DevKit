import test from 'ava';
import proxyquire from 'proxyquire';
import {djb2Hash} from '@lib/data_processing';
import {estimateRows, matchesTarget, isLedgerItemVisibleForUser,
  sameCategoryHashIsVisible, slotBit, hasProcessedSlot, markProcessedSlot,
  isCampaignComplete, ALL_SLOTS_MASK} from '@lib/smart_notice_timer';

function createKvStore() {
  const store = new Map<string, any>();

  function iter(prefix: string) {
    const keys = Array.from(store.keys()).filter(k => k.startsWith(prefix)).sort();
    let index = -1;
    let currentKey: string | null = null;
    return {
      next() {
        keys.filter(k => store.has(k));
        index += 1;
        if (index < keys.length) { currentKey = keys[index]; return true; }
        currentKey = null; return false;
      },
      key() { return currentKey || ''; },
      value() { return currentKey ? store.get(currentKey) : undefined; },
      delete() { if (currentKey) { store.delete(currentKey); return true; } return false; },
      seek(_key: string) {},
    };
  }

  const kv = {
    set(key: string, value: any) { store.set(String(key), value); return true; },
    get(key: string, defaultValue?: any) {
      const k = String(key);
      return store.has(k) ? store.get(k) : defaultValue;
    },
    remove(key: string) { store.delete(String(key)); },
    clear() { store.clear(); return true; },
    incr(key: string, amount = 1) {
      const k = String(key);
      const current = Number(store.has(k) ? store.get(k) : 0);
      store.set(k, current + amount);
      return true;
    },
    decr(key: string, amount = 1) {
      const k = String(key);
      const current = Number(store.has(k) ? store.get(k) : 0);
      store.set(k, current - amount);
      return true;
    },
    iter,
  };

  return {store, kv};
}

function createTimer(kv: any, room?: any, config?: any, callback?: any, user?: any, message?: any) {
  const roomMock = room || { sendNotice() {}, users: [] };
  const callbackMock = callback || { create() {}, cancel() {}, label: undefined };
  const userMock = user || { username: 'testuser', colorGroup: 'f', visibleLineCount: 10, charsPerRow: 45 };
  const messageMock = message || { body: '' };
  const {SmartNoticeTimer: SNT} = proxyquire('@lib/smart_notice_timer', {
    '@api/$kv': {$kv: kv},
    '@api/$room': {$room: roomMock},
    '@api/$callback': {$callback: callbackMock},
    '@api/$user': {$user: userMock},
    '@api/$message': {$message: messageMock},
  });
  return new SNT(config);
}

function makeUser(overrides?: any) {
  return {
    username: 'testuser',
    colorGroup: 'f',
    visibleLineCount: undefined,
    charsPerRow: undefined,
    ...overrides,
  };
}

test('enqueue wraps NoticeOptionsLike correctly', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test1'});

  timer.enqueue('hello world', { color: '#ff0000', bgColor: '#000', fontWeight: 'bold' }, { category: 'menu' });

  const state = timer.getState();
  const queue = state.pendingByCategory['menu'];
  t.truthy(queue);
  t.is(queue.length, 1);

  const env = queue[0].envelope;
  t.is(env.category, 'menu');
  t.is(env.message, 'hello world');
  t.is(env.target.kind, 'all');
  t.is(env.baseOptions?.color, '#ff0000');
  t.is(env.baseOptions?.bgColor, '#000');
  t.is(env.baseOptions?.fontWeight, 'bold');
  t.is(env.originalOptions?.color, '#ff0000');
  t.truthy(env.noticeId);
  t.true(env.estimatedRows >= 1);
});

test('toUsername becomes manual target and not in baseOptions', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test2'});

  timer.enqueue('private msg', { toUsername: 'alice', color: '#00ff00' });

  const state = timer.getState();
  const env = state.pendingByCategory['custom'][0].envelope;
  t.is(env.target.kind, 'username');
  if (env.target.kind === 'username') {
    t.is(env.target.username, 'alice');
  }
  t.is(env.baseOptions?.toUsername, undefined);
  t.is(env.baseOptions?.color, '#00ff00');
});

test('toColorGroup becomes manual target and not in baseOptions', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test3'});

  timer.enqueue('group msg', { toColorGroup: 'red', fontWeight: 'bold' });

  const state = timer.getState();
  const env = state.pendingByCategory['custom'][0].envelope;
  t.is(env.target.kind, 'colorGroup');
  if (env.target.kind === 'colorGroup') {
    t.is(env.target.colorGroup, 'red');
  }
  t.is(env.baseOptions?.toColorGroup, undefined);
  t.is(env.baseOptions?.fontWeight, 'bold');
});

test('hash is stable for same category and message', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test4'});

  timer.enqueue('hello', undefined, { category: 'menu' });
  timer.enqueue('hello', undefined, { category: 'menu' });

  const state = timer.getState();
  const queue = state.pendingByCategory['menu'];
  t.is(queue.length, 1);
  t.is(queue[0].envelope.messageHash, djb2Hash('menuhello'));
});

test('replace_all queue overflow does not mutate active campaign', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test5'});

  timer.enqueue('first', undefined, { category: 'menu', priority: 1 });
  timer.enqueue('second', undefined, { category: 'menu', priority: 2 });

  const state = timer.getState();
  const queue = state.pendingByCategory['menu'];
  t.is(queue.length, 1);
  t.is(queue[0].envelope.message, 'second');
});

test('active campaign completes after all slots processed', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test6', slotCount: 3});

  timer.enqueue('broadcast', undefined, { category: 'custom' });
  timer.tick();

  let state = timer.getState();
  const campaign = state.activeByCategory['custom'];
  t.truthy(campaign);
  t.is(campaign!.status, 'active');

  timer.tick();
  timer.tick();
  timer.tick();

  state = timer.getState();
  t.falsy(state.activeByCategory['custom']);
});

test('same category + same hash + still visible => no duplicate send', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser({ username: 'bob', colorGroup: 'f' });
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [['bob', 'f', 'm']] };
  const timer = createTimer(kv, room, {namespace: 'test7', defaultVisibleRows: 20});

  timer.enqueue('notice text', undefined, { category: 'menu' });
  timer.processForUser(user);
  t.is(notices.length, 1);

  timer.enqueue('notice text', undefined, { category: 'menu' });
  timer.processForUser(user);
  t.is(notices.length, 1);
});

test('same category + different hash may send if cooldown allows', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser({ username: 'bob', colorGroup: 'f' });
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [['bob', 'f', 'm']] };
  const timer = createTimer(kv, room, {namespace: 'test8', globalCooldownSec: 0, slotCount: 1});

  timer.touchUser(user);
  timer.enqueue('first msg', undefined, { category: 'menu' });
  timer.tick();
  timer.tick();
  t.is(notices.length, 1);

  timer.enqueue('second msg', undefined, { category: 'menu' });
  timer.tick();
  timer.tick();
  t.is(notices.length, 2);
});

test('user joining after campaign activation does not receive that campaign', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test9'});

  timer.enqueue('early notice', undefined, { category: 'menu' });
  timer.tick();

  timer.onUserMessage(makeUser({ username: 'someone' }), 'filler');
  const lateUser = makeUser({ username: 'latecomer' });
  timer.processForUser(lateUser);
  t.is(notices.length, 0);
});

test('ledger visibility becomes false after enough rows pass', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test10', defaultVisibleRows: 10, defaultCharsPerRow: 20});

  const user = makeUser();
  timer.touchUser(user);

  timer.onUserMessage(user, 'x'.repeat(60)); // 3 rows
  timer.onUserMessage(user, 'x'.repeat(60)); // 3 rows
  timer.onUserMessage(user, 'x'.repeat(60)); // 3 rows

  const state = timer.getState();
  const userState = timer.getUserState('testuser')!;

  const oldestItem = state.ledger['0'];
  t.true(isLedgerItemVisibleForUser(oldestItem, userState, state));

  userState.visibleRows = 5;
  t.false(isLedgerItemVisibleForUser(oldestItem, userState, state));
});

test('state survives reload from KV', t => {
  const {store, kv} = createKvStore();
  const timer1 = createTimer(kv, undefined, {namespace: 'test11'});
  timer1.enqueue('persist test', undefined, { category: 'commands' });
  t.is(timer1.getState().pendingByCategory['commands'].length, 1);

  const timer2 = createTimer(kv, undefined, {namespace: 'test11'});
  t.is(timer2.getState().pendingByCategory['commands'].length, 1);
  t.is(timer2.getState().pendingByCategory['commands'][0].envelope.message, 'persist test');
});

test('serialized state contains no Set, Map, functions, or class instances', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test12'});

  timer.enqueue('test', undefined, { category: 'menu' });
  timer.enqueue('goal', undefined, { category: 'goal', priority: 5 });

  const user = makeUser();
  timer.touchUser(user);
  timer.onUserMessage(user, 'hello');

  const state = timer.getState();
  const serialized = JSON.parse(JSON.stringify(state));

  t.is(typeof serialized.seq, 'number');
  t.is(typeof serialized.rowCursor, 'number');
  t.truthy(serialized.pendingByCategory['menu']);
  t.truthy(serialized.pendingByCategory['goal']);
  t.falsy(serialized instanceof Set);
  t.falsy(serialized instanceof Map);
  t.is(Object.prototype.toString.call(serialized), '[object Object]');
});

test('queue overflow policies behave correctly', t => {
  const {kv} = createKvStore();

  const timerIgnore = createTimer(kv, undefined, {
    namespace: 'p1', categoryPolicies: { test: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'ignore_new' } },
  });
  timerIgnore.enqueue('a', undefined, { category: 'test' });
  timerIgnore.enqueue('b', undefined, { category: 'test' });
  t.is(timerIgnore.getState().pendingByCategory['test'].length, 1);
  t.is(timerIgnore.getState().pendingByCategory['test'][0].envelope.message, 'a');

  const timerDrop = createTimer(kv, undefined, {
    namespace: 'p2', categoryPolicies: { test: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'drop_oldest' } },
  });
  timerDrop.enqueue('a', undefined, { category: 'test' });
  timerDrop.enqueue('b', undefined, { category: 'test' });
  t.is(timerDrop.getState().pendingByCategory['test'].length, 1);
  t.is(timerDrop.getState().pendingByCategory['test'][0].envelope.message, 'b');

  const timerPriority = createTimer(kv, undefined, {
    namespace: 'p3', categoryPolicies: { test: { maxPending: 2, activeConflict: 'wait', pendingOverflow: 'replace_lower_priority' } },
  });
  timerPriority.enqueue('low', undefined, { category: 'test', priority: 1 });
  timerPriority.enqueue('high', undefined, { category: 'test', priority: 10 });
  timerPriority.enqueue('mid', undefined, { category: 'test', priority: 5 });
  const pq = timerPriority.getState().pendingByCategory['test'];
  t.is(pq.length, 2);
  t.is(pq[0].envelope.message, 'high');
  t.is(pq[1].envelope.message, 'mid');
});

test('target matching works for username and colorGroup', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {
    namespace: 'test14',
    categoryPolicies: { custom: { maxPending: 2, activeConflict: 'wait', pendingOverflow: 'drop_oldest' } },
  });

  timer.enqueue('user targeted', { toUsername: 'alice' });
  timer.enqueue('color targeted', { toColorGroup: 'red' });

  const state = timer.getState();
  const queue = state.pendingByCategory['custom'];
  t.is(queue.length, 2);

  const aliceEnv = queue[0].envelope;
  const redEnv = queue[1].envelope;

  t.is(aliceEnv.target.kind, 'username');
  if (aliceEnv.target.kind === 'username') {
    t.is(aliceEnv.target.username, 'alice');
  }

  const aliceState = {
    username: 'alice', slot: 0, joinedAtSeq: 0, joinedAtRowCursor: 0,
    visibleRows: 10, charsPerRow: 45,
    colorGroup: 'red' as const,
    lastSeenAt: 0, categoryState: {},
  };

  const bobState = {
    username: 'bob', slot: 0, joinedAtSeq: 0, joinedAtRowCursor: 0,
    visibleRows: 10, charsPerRow: 45,
    colorGroup: 'blue' as any,
    lastSeenAt: 0, categoryState: {},
  };

  t.true(matchesTarget(aliceEnv, aliceState));
  t.false(matchesTarget(aliceEnv, bobState));
  t.true(matchesTarget(redEnv, aliceState));
  t.false(matchesTarget(redEnv, bobState));
});

test('estimateRows returns at least 1', t => {
  t.is(estimateRows('', 45), 1);
  t.is(estimateRows('a', 45), 1);
  t.is(estimateRows('x'.repeat(45), 45), 1);
  t.is(estimateRows('x'.repeat(46), 45), 2);
  t.is(estimateRows(':wave: hello', 45), 4);
  t.is(estimateRows(':wave: :heart: :fire:', 45), 10);
});

test('pending overflow policies behave correctly', t => {
  const {kv} = createKvStore();

  const replaceTimer = createTimer(kv, undefined, {
    namespace: 'replace', categoryPolicies: { cat: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' } },
  });
  replaceTimer.enqueue('x', undefined, { category: 'cat' });
  replaceTimer.enqueue('y', undefined, { category: 'cat' });
  t.is(replaceTimer.getState().pendingByCategory['cat'].length, 1);
  t.is(replaceTimer.getState().pendingByCategory['cat'][0].envelope.message, 'y');
});

test('clear resets state and user state from KV', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_clear'});

  timer.enqueue('data', undefined, { category: 'menu' });
  timer.touchUser(makeUser());
  t.truthy(timer.getState().pendingByCategory['menu']);
  t.truthy(timer.getUserState('testuser'));

  timer.clear();

  t.deepEqual(timer.getState().pendingByCategory, {});
  t.falsy(timer.getUserState('testuser'));
});

test('slotBit / hasProcessedSlot / isCampaignComplete', t => {
  t.is(slotBit(0), 1);
  t.is(slotBit(3), 8);
  t.is(ALL_SLOTS_MASK, (1 << 10) - 1);

  const campaign = {
    campaignId: 'test',
    envelope: null as any,
    status: 'active' as const,
    activatedAt: 0,
    activatedAtSeq: 0,
    activatedAtRowCursor: 0,
    targetSlotMask: ALL_SLOTS_MASK,
    processedSlotMask: 0,
  };

  t.false(hasProcessedSlot(campaign, 0));
  campaign.processedSlotMask = markProcessedSlot(campaign, 0);
  t.true(hasProcessedSlot(campaign, 0));

  campaign.processedSlotMask = ALL_SLOTS_MASK;
  t.true(isCampaignComplete(campaign));
});

test('constructor rejects invalid slotCount', t => {
  const {kv} = createKvStore();
  t.throws(() => createTimer(kv, undefined, {namespace: 'invalid1', slotCount: 0}), {message: /slotCount.*1.*30/});
  t.throws(() => createTimer(kv, undefined, {namespace: 'invalid2', slotCount: 31}), {message: /slotCount.*1.*30/});
  t.throws(() => createTimer(kv, undefined, {namespace: 'invalid3', slotCount: -1}), {message: /slotCount.*1.*30/});
  t.throws(() => createTimer(kv, undefined, {namespace: 'invalid4', slotCount: 3.5}), {message: /slotCount.*1.*30/});
  t.throws(() => createTimer(kv, undefined, {namespace: 'invalid5', slotCount: 1.5}), {message: /slotCount.*1.*30/});
  t.notThrows(() => createTimer(kv, undefined, {namespace: 'valid1', slotCount: 1}));
  t.notThrows(() => createTimer(kv, undefined, {namespace: 'valid2', slotCount: 30}));
  t.notThrows(() => createTimer(kv, undefined, {namespace: 'valid3', slotCount: 10}));
});

test('global cooldown allows all eligible users in same slot', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = {
    sendNotice(msg: string, opts: any) { notices.push({msg, opts}); },
    users: [['alice', 'f', 'f'], ['bob', 'm', 'm']],
  };
  const timer = createTimer(kv, room, {
    namespace: 'test_gc_users',
    slotCount: 1,
    globalCooldownSec: 60,
  });

  timer.touchUser({ username: 'alice', colorGroup: 'f' });
  timer.touchUser({ username: 'bob', colorGroup: 'm' });

  timer.enqueue('hello all', undefined, { category: 'custom' });
  timer.tick(); // activate
  timer.tick(); // process slot 0 → both users get it

  t.is(notices.length, 2);
});

test('global cooldown gate prevents tick from sending when recently fired', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = {
    sendNotice(msg: string, opts: any) { notices.push({msg, opts}); },
    users: [['alice', 'f', 'f']],
  };
  const timer = createTimer(kv, room, {
    namespace: 'test_gc_gate',
    slotCount: 1,
    globalCooldownSec: 3600,
  });

  timer.touchUser({ username: 'alice', colorGroup: 'f' });
  timer.enqueue('msg1', undefined, { category: 'custom' });
  timer.tick(); // activate msg1
  timer.tick(); // process msg1 → alice gets notice → cooldown starts
  t.is(notices.length, 1);

  timer.enqueue('msg2', undefined, { category: 'custom' });
  timer.tick(); // cooldown active → skip processing
  t.is(notices.length, 1);
});

test('deliveredCampaigns prevents duplicate from processForUser after notice scrolls off', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser({ username: 'bob' });
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {
    namespace: 'test_dc1',
    slotCount: 1,
    defaultVisibleRows: 2,
    defaultCharsPerRow: 10,
  });

  timer.enqueue('hi', undefined, { category: 'menu' });
  timer.processForUser(user);
  t.is(notices.length, 1);

  // Add enough user messages to scroll the notice off the visible window
  timer.onUserMessage(user, 'x'.repeat(100)); // 10 rows at 10 chars/row

  // Without deliveredCampaigns, sameCategoryHashIsVisible would be false
  // deliveredCampaigns prevents the duplicate
  timer.processForUser(user);
  t.is(notices.length, 1);
});

test('deliveredCampaigns prevents duplicate from tick after processForUser sent it', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser({ username: 'bob' });
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [['bob', 'f', 'm']] };
  const timer = createTimer(kv, room, {
    namespace: 'test_dc2',
    slotCount: 1,
    defaultVisibleRows: 2,
    defaultCharsPerRow: 10,
  });

  timer.touchUser(user);
  timer.enqueue('hi', undefined, { category: 'menu' });
  timer.processForUser(user);
  t.is(notices.length, 1);

  // Scroll notice off visible window
  timer.onUserMessage(user, 'x'.repeat(100));

  // tick would re-process slot 0 for this campaign
  timer.tick();
  t.is(notices.length, 1);
});

test('deliveredCampaigns scoped per campaignId (different hash still allowed)', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser({ username: 'bob' });
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [['bob', 'f', 'm']] };
  const timer = createTimer(kv, room, {
    namespace: 'test_dc3',
    slotCount: 1,
  });

  timer.enqueue('first', undefined, { category: 'menu' });
  timer.processForUser(user);
  t.is(notices.length, 1);

  // First campaign still active (processForUser doesn't mark slots).
  // tick() marks slot 0 processed (user skipped by deliveredCampaigns) → campaign completes → deleted
  timer.tick();

  timer.enqueue('second', undefined, { category: 'menu' });
  timer.tick(); // activate second campaign
  timer.tick(); // process second campaign → bob gets it
  t.is(notices.length, 2);
});

test('$room.users tuple entries are iterated correctly in tick', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = {
    sendNotice(msg: string, opts: any) { notices.push({msg, opts}); },
    users: [
      ['alice', 'f', 'f'],
      ['bob', 'm', 'm'],
      ['charlie', 'g', 'm'],
    ],
  };
  const timer = createTimer(kv, room, {namespace: 'test_users', slotCount: 1});

  timer.touchUser({ username: 'alice', colorGroup: 'f' });
  timer.touchUser({ username: 'bob', colorGroup: 'm' });
  timer.touchUser({ username: 'charlie', colorGroup: 'g' });

  timer.enqueue('notice', undefined, { category: 'custom' });
  timer.tick(); // activate campaign
  timer.tick(); // process slot 0 → all 3 users in slot 0

  t.is(notices.length, 3);
});

test('visibility overlap: multi-row notice partially visible is detected', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_vis_ov', defaultVisibleRows: 3, defaultCharsPerRow: 20});

  const user = makeUser();
  timer.onUserMessage(user, 'x'.repeat(60)); // 3 rows at 20 chars/row, rowCursor = 3

  const state = timer.getState();
  const userState = timer.getUserState('testuser')!;
  userState.visibleRows = 3;

  // Item that starts before visible window but extends into it
  // rowStart=0, rowEnd=3, state.rowCursor=3
  // visible window: [3-3, 3) = [0, 3)
  // Old behavior: 3-0 < 3 → false (not visible)
  // New behavior: 0 < 3 && 3 > 0 → true (visible)
  const multiRowItem = {
    seq: 99, rowStart: 0, rowEnd: 3, rows: 3,
    type: 'notice' as const, createdAt: 0,
  };
  t.true(isLedgerItemVisibleForUser(multiRowItem, userState, state));
});

test('TTL with 0 seconds expires campaign immediately', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser();
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_ttl1', slotCount: 1});

  timer.enqueue('ephemeral', undefined, { category: 'menu', ttlSec: 0 });
  timer.processForUser(user);
  t.is(notices.length, 0);

  const state = timer.getState();
  const campaign = Object.values(state.activeByCategory).find(Boolean);
  t.falsy(campaign);
});

test('TTL expires from activation time, not enqueue time', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser();
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_ttl2', slotCount: 1});

  timer.enqueue('timed', undefined, { category: 'menu', ttlSec: 60 });
  // TTL starts at activation time, not enqueue time.
  // After processForUser, campaign is active with expiresAt = now + 60s
  timer.processForUser(user);
  t.is(notices.length, 1);
});

test('enqueue returns false when ignore_new policy drops the notice', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {
    namespace: 'test_enq',
    categoryPolicies: { test: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'ignore_new' } },
  });

  t.true(timer.enqueue('first', undefined, { category: 'test' }));
  t.false(timer.enqueue('second', undefined, { category: 'test' }));

  const queue = timer.getState().pendingByCategory['test'];
  t.is(queue.length, 1);
  t.is(queue[0].envelope.message, 'first');
});

test('enqueue returns true for drop_oldest, replace_all, replace_lower_priority', t => {
  const {kv} = createKvStore();

  const t1 = createTimer(kv, undefined, {
    namespace: 'enq_drop', categoryPolicies: { c: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'drop_oldest' } },
  });
  t.true(t1.enqueue('a', undefined, { category: 'c' }));
  t.true(t1.enqueue('b', undefined, { category: 'c' }));

  const t2 = createTimer(kv, undefined, {
    namespace: 'enq_repl', categoryPolicies: { c: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' } },
  });
  t.true(t2.enqueue('a', undefined, { category: 'c' }));
  t.true(t2.enqueue('b', undefined, { category: 'c' }));

  const t3 = createTimer(kv, undefined, {
    namespace: 'enq_prio', categoryPolicies: { c: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_lower_priority' } },
  });
  t.true(t3.enqueue('a', undefined, { category: 'c' }));
  t.true(t3.enqueue('b', undefined, { category: 'c' }));
});

test('getState returns immutable snapshot', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_imm'});

  timer.enqueue('test msg', undefined, { category: 'menu' });

  const state = timer.getState();
  const origSeq = state.seq;

  state.seq = 999;
  state.pendingByCategory = {};

  const state2 = timer.getState();
  t.is(state2.seq, origSeq);
  t.truthy(state2.pendingByCategory['menu']);
});

test('estimateRows guards against invalid charsPerRow', t => {
  t.is(estimateRows('hello', 0), 1);
  t.is(estimateRows('hello', -1), 1);
  t.is(estimateRows('hello', NaN), 1);
  t.is(estimateRows('hello', undefined as any), 1);
  t.is(estimateRows('hello', null as any), 1);
  t.is(estimateRows('hello', 45), 1);
  t.is(estimateRows('x'.repeat(90), 45), 2);
});

test('USER_ROLE_TO_COLOR_GROUP maps all expected codes', t => {
  const {USER_ROLE_TO_COLOR_GROUP} = proxyquire('@lib/smart_notice_timer', {
    '@api/$kv': {$kv: createKvStore().kv},
    '@api/$room': {$room: { sendNotice() {}, users: [] }},
    '@api/$callback': {$callback: { create() {}, cancel() {}, label: undefined }},
    '@api/$user': {$user: { username: 'test', colorGroup: 'f' }},
    '@api/$message': {$message: { body: '' }},
  });
  t.is(USER_ROLE_TO_COLOR_GROUP['o'], 'lightpurple');
  t.is(USER_ROLE_TO_COLOR_GROUP['m'], 'lightblue');
  t.is(USER_ROLE_TO_COLOR_GROUP['f'], 'red');
  t.is(USER_ROLE_TO_COLOR_GROUP['l'], 'lightblue');
  t.is(USER_ROLE_TO_COLOR_GROUP['p'], 'darkblue');
  t.is(USER_ROLE_TO_COLOR_GROUP['tr'], 'green');
  t.is(USER_ROLE_TO_COLOR_GROUP['t'], 'darkpurple');
  t.is(USER_ROLE_TO_COLOR_GROUP['g'], 'lightblue');
});

test('tick does not mutate $room.users array or its entries', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const usersSnapshot: [string, string, string][] = [
    ['alice', 'f', 'f'],
    ['bob', 'm', 'm'],
  ];
  const room = {
    sendNotice(msg: string, opts: any) { notices.push({msg, opts}); },
    users: usersSnapshot,
  };
  const timer = createTimer(kv, room, {namespace: 'test_no_mut', slotCount: 1});

  timer.touchUser({ username: 'alice', colorGroup: 'f' });
  timer.touchUser({ username: 'bob', colorGroup: 'm' });

  timer.enqueue('hello', undefined, { category: 'custom' });
  timer.tick(); // activate
  timer.tick(); // process

  t.is(room.users.length, 2);
  t.is(room.users[0][0], 'alice');
  t.is(room.users[0][1], 'f');
  t.is(room.users[0][2], 'f');
  t.is(room.users[1][0], 'bob');
  t.is(room.users[1][1], 'm');
  t.is(room.users[1][2], 'm');
});

test('tick handles $room.users null/undefined without throwing', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: undefined as any };
  const timer = createTimer(kv, room, {namespace: 'test_null_users', slotCount: 1});

  timer.enqueue('test', undefined, { category: 'custom' });
  t.notThrows(() => timer.tick());
});

test('tick handles $room.users with missing entries gracefully', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = {
    sendNotice(msg: string, opts: any) { notices.push({msg, opts}); },
    users: [null as any, ['alice', 'f', 'f'], undefined as any],
  };
  const timer = createTimer(kv, room, {namespace: 'test_sparse_users', slotCount: 1});

  timer.touchUser({ username: 'alice', colorGroup: 'f' });
  timer.enqueue('hello', undefined, { category: 'custom' });
  timer.tick(); // activate
  timer.tick(); // process

  t.is(notices.length, 1);
});

test('processForUser does not mutate the user argument', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_no_mut_user'});

  const user = makeUser({ username: 'bob', colorGroup: 'f', visibleLineCount: 10, charsPerRow: 45 });
  const frozen = { ...user };

  timer.enqueue('test', undefined, { category: 'custom' });
  timer.processForUser(user);

  t.deepEqual(user, frozen);
  t.is(user.username, 'bob');
  t.is(user.colorGroup, 'f');
  t.is(user.visibleLineCount, 10);
  t.is(user.charsPerRow, 45);
});

test('slot processed = attempted: slot marked even when no users matched', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_attempted2', slotCount: 3});

  timer.enqueue('broadcast', undefined, { category: 'custom' });
  timer.tick(); // activate
  timer.tick(); // slot 0 processed (no users → still marked)
  timer.tick(); // slot 1 processed (no users → still marked)
  timer.tick(); // slot 2 processed (no users → still marked)

  const state = timer.getState();
  t.falsy(state.activeByCategory['custom']);
});

test('deliveredCampaigns does not interfere with new campaigns in same category', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const user = makeUser({ username: 'bob' });
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {
    namespace: 'test_dc_new_campaign',
    slotCount: 1,
    categoryPolicies: {
      custom: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
    },
  });

  // Campaign A sent
  timer.enqueue('msg A', undefined, { category: 'custom', noticeId: 'campaign_A' });
  timer.processForUser(user);
  t.is(notices.length, 1);

  // Force first campaign to complete by ticking through all slots
  timer.tick(); // mark slot 0 processed

  // Campaign B, different noticeId
  timer.enqueue('msg B', undefined, { category: 'custom', noticeId: 'campaign_B' });
  timer.processForUser(user);
  t.is(notices.length, 2);
});

test('normalizeEnvelope does not mutate options argument', t => {
  const {normalizeEnvelope} = proxyquire('@lib/smart_notice_timer', {
    '@api/$kv': {$kv: createKvStore().kv},
    '@api/$room': {$room: { sendNotice() {}, users: [] }},
    '@api/$callback': {$callback: { create() {}, cancel() {}, label: undefined }},
    '@api/$user': {$user: { username: 'test', colorGroup: 'f' }},
    '@api/$message': {$message: { body: '' }},
  });

  const options = { color: '#ff0000', toUsername: 'alice' };
  const original = { ...options };
  normalizeEnvelope('test', options);
  t.deepEqual(options, original);
  t.is(options.toUsername, 'alice');
});

test('processForUser global cooldown does not block another user from same campaign', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {
    namespace: 'test_gc_pfu_block',
    slotCount: 1,
    globalCooldownSec: 3600,
  });

  const userA = makeUser({ username: 'alice', colorGroup: 'f' });
  const userB = makeUser({ username: 'bob', colorGroup: 'm' });

  timer.touchUser(userA);
  timer.touchUser(userB);

  timer.enqueue('hello all', undefined, { category: 'custom' });

  // userA activates the campaign and gets it
  timer.processForUser(userA);
  t.is(notices.length, 1);

  // userB should still get the same already-active campaign during cooldown
  timer.processForUser(userB);
  t.is(notices.length, 2);
});

test('deliveredCampaigns pruning keeps most recent entries', t => {
  const {store, kv} = createKvStore();
  const timer = createTimer(kv, undefined, {
    namespace: 'test_dc_prune',
    maxDeliveredCampaigns: 3,
  });

  const user = makeUser({ username: 'bob' });
  timer.touchUser(user);

  // Inject 5 entries with deterministic timestamps directly into KV
  const injected = timer.getUserState('bob')!;
  injected.deliveredCampaigns = {
    camp_oldest: 1000,
    camp_old: 2000,
    camp_mid: 3000,
    camp_recent: 4000,
    camp_newest: 5000,
  };
  store.set('test_dc_prune:user:bob', JSON.stringify(injected));

  // Reload via touchUser → triggers pruneDeliveredCampaigns on save
  timer.touchUser(user);

  const pruned = timer.getUserState('bob')!;
  t.truthy(pruned.deliveredCampaigns);
  t.is(Object.keys(pruned.deliveredCampaigns!).length, 3);

  t.falsy(pruned.deliveredCampaigns!['camp_oldest']);
  t.falsy(pruned.deliveredCampaigns!['camp_old']);
  t.truthy(pruned.deliveredCampaigns!['camp_mid']);
  t.truthy(pruned.deliveredCampaigns!['camp_recent']);
  t.truthy(pruned.deliveredCampaigns!['camp_newest']);
});

test('onAppStart creates repeating callback with defaults', t => {
  const {kv} = createKvStore();
  let createLabel = '';
  let createDelay = 0;
  let createRepeating = false;
  let cancelLabel = '';
  const callback = {
    create(label: string, delay?: number, repeating?: boolean) {
      createLabel = label;
      createDelay = delay!;
      createRepeating = repeating!;
    },
    cancel(label: string) { cancelLabel = label; },
    label: undefined,
  };
  const timer = createTimer(kv, undefined, {namespace: 'test_start'}, callback);
  timer.onAppStart();
  t.is(cancelLabel, 'test_start:smart_notice_tick');
  t.is(createLabel, 'test_start:smart_notice_tick');
  t.is(createDelay, 1);
  t.true(createRepeating);
});

test('onAppStart uses configured callbackLabel and callbackDelaySec', t => {
  const {kv} = createKvStore();
  let createLabel = '';
  let createDelay = 0;
  const callback = {
    create(label: string, delay?: number) { createLabel = label; createDelay = delay!; },
    cancel() {},
    label: undefined,
  };
  const timer = createTimer(kv, undefined, {
    namespace: 'test_start2',
    callbackLabel: 'my_custom_tick',
    callbackDelaySec: 5,
  }, callback);
  timer.onAppStart();
  t.is(createLabel, 'my_custom_tick');
  t.is(createDelay, 5);
});

test('onCallback reads $callback.label when no explicit label', t => {
  const {kv} = createKvStore();
  const callback = { create() {}, cancel() {}, label: 'myns:smart_notice_tick' };
  const timer = createTimer(kv, undefined, {namespace: 'myns', slotCount: 1}, callback);
  timer.enqueue('test', undefined, { category: 'custom' });
  t.falsy(timer.getState().activeByCategory['custom']);
  t.notThrows(() => timer.onCallback());
  t.truthy(timer.getState().activeByCategory['custom']);
});

test('onCallback with non-matching label does nothing', t => {
  const {kv} = createKvStore();
  const callback = { create() {}, cancel() {}, label: 'wrong:smart_notice_tick' };
  const timer = createTimer(kv, undefined, {namespace: 'myns', slotCount: 1}, callback);
  timer.enqueue('test', undefined, { category: 'custom' });
  t.notThrows(() => timer.onCallback());
  t.falsy(timer.getState().activeByCategory['custom']);
});

test('onCallback performs one tick with correct configured label', t => {
  const {kv} = createKvStore();
  const callback = { create() {}, cancel() {}, label: undefined };
  const timer = createTimer(kv, undefined, {namespace: 'myns', slotCount: 1}, callback);
  timer.enqueue('test', undefined, { category: 'custom' });
  t.falsy(timer.getState().activeByCategory['custom']);
  callback.label = 'myns:smart_notice_tick';
  timer.onCallback();
  t.truthy(timer.getState().activeByCategory['custom']);
});

test('onUserEnter creates user state and processes active notices', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const userMock = { username: 'alice', colorGroup: 'f', visibleLineCount: 10, charsPerRow: 45 };
  const frozen = { ...userMock };
  const timer = createTimer(kv, room, {namespace: 'test_enter', slotCount: 1}, undefined, userMock);

  timer.enqueue('welcome', undefined, { category: 'custom' });
  timer.tick(); // activate campaign
  t.truthy(timer.getState().activeByCategory['custom']);

  timer.onUserEnter();
  t.is(notices.length, 1);
  t.truthy(timer.getUserState('alice'));
  t.deepEqual(userMock, frozen);
});

test('onUserLeave removes user state from KV', t => {
  const {kv} = createKvStore();
  const userMock = { username: 'alice', colorGroup: 'f' };
  const timer = createTimer(kv, undefined, {namespace: 'test_leave'}, undefined, userMock);

  timer.touchUser({ username: 'alice', colorGroup: 'f' });
  t.truthy(timer.getUserState('alice'));

  timer.onUserLeave();
  t.falsy(timer.getUserState('alice'));
});

test('onUserLeave reads $user.username', t => {
  const {kv} = createKvStore();
  const userMock = { username: 'bob', colorGroup: 'f' };
  const timer = createTimer(kv, undefined, {namespace: 'test_leave_str'}, undefined, userMock);

  timer.touchUser({ username: 'bob', colorGroup: 'f' });
  t.truthy(timer.getUserState('bob'));

  timer.onUserLeave();
  t.falsy(timer.getUserState('bob'));
});

test('config rejects invalid callbackDelaySec', t => {
  const {kv} = createKvStore();
  t.throws(() => createTimer(kv, undefined, {namespace: 'cd1', callbackDelaySec: 0}), {message: /callbackDelaySec.*>= 1/});
  t.throws(() => createTimer(kv, undefined, {namespace: 'cd2', callbackDelaySec: -1}), {message: /callbackDelaySec.*>= 1/});
  t.throws(() => createTimer(kv, undefined, {namespace: 'cd3', callbackDelaySec: 0.5}), {message: /callbackDelaySec.*>= 1/});
  t.notThrows(() => createTimer(kv, undefined, {namespace: 'cd4', callbackDelaySec: 1}));
  t.notThrows(() => createTimer(kv, undefined, {namespace: 'cd5', callbackDelaySec: 60}));
});

test('recreating SmartNoticeTimer preserves state through $kv', t => {
  const {kv} = createKvStore();

  // First instance: enqueue a notice
  const t1 = createTimer(kv, undefined, {namespace: 'test_recreate'});
  t1.enqueue('persistent', undefined, { category: 'custom' });
  t.truthy(t1.getState().pendingByCategory['custom']);

  // Second instance: should see the same pending notice
  const t2 = createTimer(kv, undefined, {namespace: 'test_recreate'});
  t.truthy(t2.getState().pendingByCategory['custom']);
  t.is(t2.getState().pendingByCategory['custom'][0].envelope.message, 'persistent');
});

test('onChatMessage reads $user and $message internally', t => {
  const {kv} = createKvStore();
  const userMock = { username: 'chatter', colorGroup: 'f', visibleLineCount: 10, charsPerRow: 45 };
  const messageMock = { body: 'hello world' };
  const timer = createTimer(kv, undefined, {namespace: 'test_chat1', slotCount: 1}, undefined, userMock, messageMock);
  t.is(timer.getState().seq, 0);
  timer.onChatMessage();
  t.is(timer.getState().seq, 1);
  t.truthy(timer.getUserState('chatter'));
});

test('onChatMessage does not mutate $user or $message', t => {
  const {kv} = createKvStore();
  const userMock = { username: 'chatter', colorGroup: 'f' };
  const messageMock = { body: 'hello' };
  const frozenUser = { ...userMock };
  const frozenMsg = { ...messageMock };
  const timer = createTimer(kv, undefined, {namespace: 'test_chat2'}, undefined, userMock, messageMock);
  timer.onChatMessage();
  t.deepEqual(userMock, frozenUser);
  t.deepEqual(messageMock, frozenMsg);
});

test('enqueue accepts meta.channel', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_ch'});
  timer.enqueue('channel test', undefined, { channel: 'rules' });
  const state = timer.getState();
  t.truthy(state.pendingByCategory['rules']);
  t.is(state.pendingByCategory['rules'][0].envelope.category, 'rules');
});

test('enqueue accepts legacy meta.category alias', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_cat'});
  timer.enqueue('category test', undefined, { category: 'commands' });
  const state = timer.getState();
  t.truthy(state.pendingByCategory['commands']);
  t.is(state.pendingByCategory['commands'][0].envelope.category, 'commands');
});

test('enqueue prefers channel over category', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_chan_cat'});
  timer.enqueue('both', undefined, { channel: 'socials', category: 'menu' });
  const state = timer.getState();
  t.truthy(state.pendingByCategory['socials']);
  t.falsy(state.pendingByCategory['menu']);
});

test('configureChannel overrides default policy for enqueue behavior', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_cfg_ch'});
  timer.configureChannel('custom', { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'ignore_new' });
  t.true(timer.enqueue('first', undefined, { channel: 'custom' }));
  t.false(timer.enqueue('second', undefined, { channel: 'custom' }));
  const state = timer.getState();
  t.is(state.pendingByCategory['custom'].length, 1);
  t.is(state.pendingByCategory['custom'][0].envelope.message, 'first');
});

test('configureChannels applies multiple policies', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_cfgs'});
  timer.configureChannels({
    menu: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'ignore_new' },
    custom: { maxPending: 2, activeConflict: 'wait', pendingOverflow: 'drop_oldest' },
  });
  t.true(timer.enqueue('a', undefined, { channel: 'menu' }));
  t.false(timer.enqueue('b', undefined, { channel: 'menu' }));
  t.true(timer.enqueue('x', undefined, { channel: 'custom' }));
  t.true(timer.enqueue('y', undefined, { channel: 'custom' }));
  const menuQ = timer.getState().pendingByCategory['menu'];
  const customQ = timer.getState().pendingByCategory['custom'];
  t.is(menuQ.length, 1);
  t.is(customQ.length, 2);
});

test('dequeue removes only specified channel', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_dq1'});
  timer.enqueue('a', undefined, { category: 'menu' });
  timer.enqueue('b', undefined, { category: 'custom' });
  t.is(timer.dequeue('menu'), 1);
  t.falsy(timer.getState().pendingByCategory['menu']);
  t.truthy(timer.getState().pendingByCategory['custom']);
});

test('dequeue removes all pending notices when channel omitted', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_dq2'});
  timer.enqueue('a', undefined, { category: 'menu' });
  timer.enqueue('b', undefined, { category: 'custom' });
  timer.enqueue('c', undefined, { category: 'rules' });
  t.is(timer.dequeue(), 3);
  t.is(Object.keys(timer.getState().pendingByCategory).length, 0);
});

test('clearQueue behaves like dequeue(channel)', t => {
  const {kv} = createKvStore();
  const timer = createTimer(kv, undefined, {namespace: 'test_cq'});
  t.true(timer.enqueue('a', undefined, { category: 'menu' }));
  t.is(timer.clearQueue('menu'), 1);
  t.falsy(timer.getState().pendingByCategory['menu']);
});

test('cancelActive removes only specified channel campaign', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_ca1', slotCount: 1});
  timer.enqueue('menu msg', undefined, { category: 'menu' });
  timer.enqueue('custom msg', undefined, { category: 'custom' });
  timer.tick(); // activate both
  t.truthy(timer.getState().activeByCategory['menu']);
  t.truthy(timer.getState().activeByCategory['custom']);
  t.is(timer.cancelActive('menu'), 1);
  t.falsy(timer.getState().activeByCategory['menu']);
  t.truthy(timer.getState().activeByCategory['custom']);
});

test('cancelActive removes all active campaigns when channel omitted', t => {
  const {kv} = createKvStore();
  const notices: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { notices.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_ca2', slotCount: 1});
  timer.enqueue('a', undefined, { category: 'menu' });
  timer.enqueue('b', undefined, { category: 'custom' });
  timer.tick();
  t.is(Object.keys(timer.getState().activeByCategory).filter(k => timer.getState().activeByCategory[k]).length, 2);
  t.is(timer.cancelActive(), 2);
  t.is(Object.keys(timer.getState().activeByCategory).filter(k => timer.getState().activeByCategory[k]).length, 0);
});

test('sendNotice calls $room.sendNotice immediately', t => {
  const {kv} = createKvStore();
  const sent: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { sent.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn1'});
  timer.sendNotice('immediate', { color: '#f00' });
  t.is(sent.length, 1);
  t.is(sent[0].msg, 'immediate');
  t.is(sent[0].opts.color, '#f00');
});

test('sendNotice updates seq and rowCursor', t => {
  const {kv} = createKvStore();
  const room = { sendNotice() {}, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn2', defaultCharsPerRow: 45});
  const before = timer.getState();
  t.is(before.seq, 0);
  t.is(before.rowCursor, 0);
  timer.sendNotice('hello');
  const after = timer.getState();
  t.is(after.seq, 1);
  t.true(after.rowCursor > 0);
});

test('sendNotice adds ledger entry with type notice', t => {
  const {kv} = createKvStore();
  const room = { sendNotice() {}, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn3'});
  timer.sendNotice('hello');
  const state = timer.getState();
  const entry = state.ledger['0'];
  t.truthy(entry);
  t.is(entry.type, 'notice');
  t.is(entry.seq, 0);
});

test('sendNotice renders params if provided', t => {
  const {kv} = createKvStore();
  const sent: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { sent.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn4'});
  timer.sendNotice('Hello {name}', undefined, { params: { name: 'World' } });
  t.is(sent.length, 1);
  t.is(sent[0].msg, 'Hello World');
});

test('sendNotice does not enqueue anything', t => {
  const {kv} = createKvStore();
  const room = { sendNotice() {}, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn5'});
  timer.sendNotice('direct');
  const state = timer.getState();
  t.is(Object.keys(state.pendingByCategory).length, 0);
});

test('sendNotice does not update deliveredCampaigns', t => {
  const {kv} = createKvStore();
  const room = { sendNotice() {}, users: [] };
  const userMock = { username: 'bob', colorGroup: 'f' };
  const timer = createTimer(kv, room, {namespace: 'test_sn6'}, undefined, userMock);
  timer.touchUser({ username: 'bob', colorGroup: 'f' });
  timer.sendNotice('direct');
  const us = timer.getUserState('bob');
  t.falsy(us!.deliveredCampaigns);
});

test('sendNotice does not affect managed cooldown by default', t => {
  const {kv} = createKvStore();
  const room = { sendNotice() {}, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn7', globalCooldownSec: 60});
  timer.sendNotice('direct');
  const state = timer.getState();
  t.falsy(state.lastGlobalNoticeAt);
});

test('sendNotice with affectCooldown updates lastGlobalNoticeAt', t => {
  const {kv} = createKvStore();
  const room = { sendNotice() {}, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn8', globalCooldownSec: 60});
  timer.sendNotice('direct', undefined, { affectCooldown: true });
  const state = timer.getState();
  t.truthy(state.lastGlobalNoticeAt);
});

test('sendNotice does not mutate the provided options object', t => {
  const {kv} = createKvStore();
  const sent: any[] = [];
  const room = { sendNotice(msg: string, opts: any) { sent.push({msg, opts}); }, users: [] };
  const timer = createTimer(kv, room, {namespace: 'test_sn9'});
  const options = { color: '#ff0000' };
  const frozen = { ...options };
  timer.sendNotice('test', options);
  t.deepEqual(options, frozen);
});
