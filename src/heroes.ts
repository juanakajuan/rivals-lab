export type Team = 'ally' | 'enemy';
export type HeroRole = 'Vanguard' | 'Duelist' | 'Strategist' | 'All Roles';

export interface HeroDefinition {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: HeroRole;
}

const IMAGE_FILE_OVERRIDES: Readonly<Record<string, string>> = {
  strange: 'doctor-strange',
  luna: 'luna-snow',
  rocket: 'rocket-raccoon'
};

const TEAM_LABELS: Readonly<Record<Team, string>> = {
  ally: 'Allies',
  enemy: 'Opponents'
};

export const HEROES: readonly HeroDefinition[] = [
  { id: 'angela', name: 'Angela', initials: 'AG', role: 'Vanguard' },
  { id: 'captain-america', name: 'Captain America', initials: 'CA', role: 'Vanguard' },
  { id: 'devil-dinosaur', name: 'Devil Dinosaur', initials: 'DD', role: 'Vanguard' },
  { id: 'strange', name: 'Doctor Strange', initials: 'DS', role: 'Vanguard' },
  { id: 'emma-frost', name: 'Emma Frost', initials: 'EF', role: 'Vanguard' },
  { id: 'groot', name: 'Groot', initials: 'GR', role: 'Vanguard' },
  { id: 'hulk', name: 'Hulk', initials: 'HK', role: 'Vanguard' },
  { id: 'magneto', name: 'Magneto', initials: 'MG', role: 'Vanguard' },
  { id: 'peni-parker', name: 'Peni Parker', initials: 'PP', role: 'Vanguard' },
  { id: 'rogue', name: 'Rogue', initials: 'RG', role: 'Vanguard' },
  { id: 'the-hood', name: 'The Hood', initials: 'TH', role: 'Vanguard' },
  { id: 'the-thing', name: 'The Thing', initials: 'TT', role: 'Vanguard' },
  { id: 'thor', name: 'Thor', initials: 'TR', role: 'Vanguard' },
  { id: 'venom', name: 'Venom', initials: 'VN', role: 'Vanguard' },
  { id: 'black-cat', name: 'Black Cat', initials: 'BC', role: 'Duelist' },
  { id: 'black-panther', name: 'Black Panther', initials: 'BP', role: 'Duelist' },
  { id: 'black-widow', name: 'Black Widow', initials: 'BW', role: 'Duelist' },
  { id: 'blade', name: 'Blade', initials: 'BL', role: 'Duelist' },
  { id: 'cyclops', name: 'Cyclops', initials: 'CY', role: 'Duelist' },
  { id: 'daredevil', name: 'Daredevil', initials: 'DD', role: 'Duelist' },
  { id: 'elsa-bloodstone', name: 'Elsa Bloodstone', initials: 'EB', role: 'Duelist' },
  { id: 'hawkeye', name: 'Hawkeye', initials: 'HE', role: 'Duelist' },
  { id: 'hela', name: 'Hela', initials: 'HL', role: 'Duelist' },
  { id: 'human-torch', name: 'Human Torch', initials: 'HT', role: 'Duelist' },
  { id: 'iron-fist', name: 'Iron Fist', initials: 'IF', role: 'Duelist' },
  { id: 'iron-man', name: 'Iron Man', initials: 'IM', role: 'Duelist' },
  { id: 'magik', name: 'Magik', initials: 'MK', role: 'Duelist' },
  { id: 'mister-fantastic', name: 'Mister Fantastic', initials: 'MF', role: 'Duelist' },
  { id: 'moon-knight', name: 'Moon Knight', initials: 'MN', role: 'Duelist' },
  { id: 'namor', name: 'Namor', initials: 'NM', role: 'Duelist' },
  { id: 'phoenix', name: 'Phoenix', initials: 'PX', role: 'Duelist' },
  { id: 'psylocke', name: 'Psylocke', initials: 'PS', role: 'Duelist' },
  { id: 'scarlet-witch', name: 'Scarlet Witch', initials: 'SW', role: 'Duelist' },
  { id: 'spider-man', name: 'Spider-Man', initials: 'SM', role: 'Duelist' },
  { id: 'squirrel-girl', name: 'Squirrel Girl', initials: 'SG', role: 'Duelist' },
  { id: 'star-lord', name: 'Star-Lord', initials: 'SL', role: 'Duelist' },
  { id: 'storm', name: 'Storm', initials: 'ST', role: 'Duelist' },
  { id: 'the-punisher', name: 'The Punisher', initials: 'TP', role: 'Duelist' },
  { id: 'winter-soldier', name: 'Winter Soldier', initials: 'WS', role: 'Duelist' },
  { id: 'wolverine', name: 'Wolverine', initials: 'WV', role: 'Duelist' },
  { id: 'adam-warlock', name: 'Adam Warlock', initials: 'AW', role: 'Strategist' },
  { id: 'cloak-and-dagger', name: 'Cloak & Dagger', initials: 'CD', role: 'Strategist' },
  { id: 'gambit', name: 'Gambit', initials: 'GB', role: 'Strategist' },
  { id: 'invisible-woman', name: 'Invisible Woman', initials: 'IW', role: 'Strategist' },
  { id: 'jeff-the-land-shark', name: 'Jeff the Land Shark', initials: 'JL', role: 'Strategist' },
  { id: 'jubilee', name: 'Jubilee', initials: 'JB', role: 'Strategist' },
  { id: 'loki', name: 'Loki', initials: 'LK', role: 'Strategist' },
  { id: 'luna', name: 'Luna Snow', initials: 'LS', role: 'Strategist' },
  { id: 'mantis', name: 'Mantis', initials: 'MN', role: 'Strategist' },
  { id: 'rocket', name: 'Rocket Raccoon', initials: 'RR', role: 'Strategist' },
  { id: 'ultron', name: 'Ultron', initials: 'UL', role: 'Strategist' },
  { id: 'white-fox', name: 'White Fox', initials: 'WF', role: 'Strategist' },
  { id: 'deadpool', name: 'Deadpool', initials: 'DP', role: 'All Roles' }
];

export const HERO_BY_ID: ReadonlyMap<string, HeroDefinition> = new Map(
  HEROES.map((hero): [string, HeroDefinition] => [hero.id, hero])
);

export function heroImagePath(heroId: string): string {
  const fileName = IMAGE_FILE_OVERRIDES[heroId] ?? heroId;
  return `/hero-icons/${fileName}.png`;
}

export function teamLabel(team: Team): string {
  return TEAM_LABELS[team];
}

export function isTeam(value: string): value is Team {
  return value === 'ally' || value === 'enemy';
}
