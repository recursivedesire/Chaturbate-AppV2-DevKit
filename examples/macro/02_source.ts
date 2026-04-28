const presetUsers = ['alice', 'bob', 'cara'];

function formatSessionLabel(count: number): string {
  return `session-${count}`;
}

export {presetUsers, formatSessionLabel};
