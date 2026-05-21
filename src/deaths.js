// Pools of dev-themed death messages, picked at random per death so the same
// cause doesn't read identically every time. Biomes call pickDeath('road')
// etc. instead of returning a fixed string.

const POOLS = {
  road: [
    'squashed by a car',
    'force-pushed to main',
    'merged on Friday',
    'missed standup, again',
    'broke prod at 5pm',
    'shipped without tests',
    'deployed during release freeze',
    'hit by a hotfix',
    'rebased onto chaos',
  ],
  train: [
    'flattened by a train',
    'deadline hit',
    'missed the demo',
    'sprint ended unkindly',
    'release ran you over',
    'Q4 freight train',
    'CI/CD pipeline overran you',
  ],
  drown: [
    'drowned in the river',
    'drowned in cold brew',
    'logged out by mistake',
    'forgot the semicolon',
    'OOO too long',
    'lost in the legacy code',
    'forgot to save',
  ],
  sweep: [
    'swept off the river',
    'session expired',
    'rate-limited by ops',
    'force-logged out',
    'auth token revoked',
  ],
  eagle: [
    'the eagle got you',
    'snatched by code reviewer',
    'manager came looking for you',
    'OOO without notice',
    'pinged by @here',
    'caught dozing in standup',
    'idle for too long, security flagged you',
  ],
};

export function pickDeath(category) {
  const list = POOLS[category] || ['squashed'];
  return list[Math.floor(Math.random() * list.length)];
}
