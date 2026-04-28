import { $app } from '@api/$app';
import { CommandSystem } from '@lib/command_system';

class Goal {
  static run() {
    (globalThis as any).__ALIAS_NAME__ = new CommandSystem($app.name).name;
  }
}

export { Goal };
