import { CommandSystem } from '@lib/command_system';

class Goal {
  static hello() {
    return new CommandSystem('smoke').name;
  }
}

export { Goal };
