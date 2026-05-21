// Career milestones triggered when the player's score crosses these thresholds.
// Ordered ascending; world.js fires each one exactly once per run.

export const MILESTONES = [
  { row: 10,   title: 'Junior Dev unlocked'        },
  { row: 25,   title: 'Promoted to Mid-level'      },
  { row: 42,   title: 'The Answer'                 },
  { row: 50,   title: 'Senior Dev candidate'       },
  { row: 69,   title: 'nice'                       },
  { row: 100,  title: 'Senior Developer'           },
  { row: 150,  title: 'Staff Engineer'             },
  { row: 200,  title: 'Tech Lead'                  },
  { row: 300,  title: 'Engineering Manager'        },
  { row: 420,  title: 'blaze it'                   },
  { row: 500,  title: 'Architecture Astronaut'     },
  { row: 1000, title: 'VP Engineering'             },
];

// Random thought bubble lines shown when the player has been idle for a few
// seconds. Reset whenever they hop.
export const IDLE_THOUGHTS = [
  '// is this in the sprint?',
  '// should I refactor?',
  '// do I have unread DMs?',
  '// did I hit save?',
  '// what was I doing again?',
  '// just one more standup',
  '// is it Friday yet?',
  '// works in prod, right?',
  '// where is that bug',
  '// time for coffee',
  '// did I push that branch?',
  '// who broke the build',
  '// could this be cached?',
  '// blame the legacy code',
];

export function pickIdleThought() {
  return IDLE_THOUGHTS[Math.floor(Math.random() * IDLE_THOUGHTS.length)];
}
