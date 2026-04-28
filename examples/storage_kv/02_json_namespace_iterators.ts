import {StorageKV} from '@lib/storage_kv';

import {publishExample} from '../command_system/publish_example';

const scores = new StorageKV('highscores');
scores.set('alice', {tokens: 260}, true);
scores.set('bob', {tokens: 180}, true);
scores.set('cara', {tokens: 320}, true);

const users: string[] = [];
let topUser = '';
let topTokens = 0;

const iterator = scores.iter('', true);
while (iterator.next()) {
  const key = iterator.key();
  const username = key.includes(':') ? key.split(':').pop() || key : key;
  const value = iterator.value();
  users.push(username);
  if (value.tokens > topTokens) {
    topTokens = value.tokens;
    topUser = username;
  }
}

const reminders = new StorageKV('reminders');
reminders.set('alice', 'hydrate');

publishExample('__EXAMPLE_STORAGE_KV_02__', {
  users: users.sort(),
  topUser,
  topTokens,
  reminderAlice: reminders.get('alice'),
});
