-- Seed data for BJJ Atlas.
-- Run after schema.sql. Safe to re-run (ON CONFLICT DO NOTHING).

insert into nodes (id, name, type, rank, description) values
  ('closed-guard',   'Closed Guard',    'position',   0, 'Full guard with legs locked around the opponent''s torso.'),
  ('half-guard',     'Half Guard',      'position',   0, 'One of the opponent''s legs trapped between yours.'),
  ('butterfly',      'Butterfly Guard', 'position',   0, 'Seated guard with instep hooks inside opponent''s thighs.'),
  ('open-guard',     'Open Guard',      'position',   0, 'Guard with legs open, using frames and grips to control distance.'),
  ('triangle',       'Triangle Choke',  'submission', 1, 'Figure-four leg configuration around the opponent''s neck and one arm.'),
  ('armbar',         'Armbar',          'submission', 1, 'Hyperextend the opponent''s elbow across your hip.'),
  ('kimura',         'Kimura',          'submission', 1, 'Figure-four shoulder lock applied behind the back.'),
  ('guillotine',     'Guillotine',      'submission', 1, 'Front headlock choke cutting across the neck.'),
  ('sweep-mount',    'Sweep to Mount',  'sweep',      1, 'Reverse position from guard to achieve top mount.'),
  ('back-take',      'Back Take',       'escape',     1, 'Transition to back control with body triangle or hooks.'),
  ('mount',          'Mount',           'position',   2, 'Dominant top position straddling the opponent''s torso.'),
  ('back-mount',     'Back Mount',      'position',   2, 'Rear mount with hooks in, controlling the back.'),
  ('side-control',   'Side Control',    'position',   2, 'Crossbody top position applying chest-to-chest pressure.'),
  ('tap',            'Tap Out',         'submission', 3, 'Opponent submits — the match-ending result of a successful finish.'),
  ('guard-recovery', 'Guard Recovery',  'escape',     3, 'Return to guard or regain feet from bottom position.')
on conflict (id) do nothing;

insert into edges (id, source, target, label) values
  ('e1',  'closed-guard', 'triangle',      'attack'),
  ('e2',  'closed-guard', 'armbar',        'attack'),
  ('e3',  'closed-guard', 'kimura',        'attack'),
  ('e4',  'closed-guard', 'guillotine',    'attack'),
  ('e5',  'closed-guard', 'sweep-mount',   'sweep'),
  ('e6',  'half-guard',   'sweep-mount',   'sweep'),
  ('e7',  'butterfly',    'sweep-mount',   'sweep'),
  ('e8',  'open-guard',   'back-take',     'transition'),
  ('e9',  'half-guard',   'back-take',     'transition'),
  ('e10', 'sweep-mount',  'mount',         'result'),
  ('e11', 'back-take',    'back-mount',    'result'),
  ('e12', 'mount',        'armbar',        'attack'),
  ('e13', 'mount',        'kimura',        'attack'),
  ('e14', 'side-control', 'armbar',        'attack'),
  ('e15', 'side-control', 'kimura',        'attack'),
  ('e16', 'back-mount',   'armbar',        'attack'),
  ('e17', 'triangle',     'tap',           'finish'),
  ('e18', 'armbar',       'tap',           'finish'),
  ('e19', 'kimura',       'tap',           'finish'),
  ('e20', 'guillotine',   'tap',           'finish'),
  ('e21', 'closed-guard', 'guard-recovery','escape')
on conflict (id) do nothing;
