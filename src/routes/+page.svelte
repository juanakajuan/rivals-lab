<script lang="ts">
  import { onMount } from 'svelte';
  import Konva from 'konva';

  type Team = 'ally' | 'enemy';
  type Role = 'Vanguard' | 'Duelist' | 'Strategist';
  type BoardCursor = 'default' | 'grab' | 'grabbing';

  interface HeroDefinition {
    id: string;
    name: string;
    initials: string;
    role: Role;
  }

  interface BoardToken {
    id: string;
    heroId: string;
    team: Team;
    x: number;
    y: number;
  }

  const BOARD_WIDTH = 1200;
  const BOARD_HEIGHT = 760;
  const TOKEN_RADIUS = 30;
  const TEAM_LABELS: Readonly<Record<Team, string>> = {
    ally: 'Allies',
    enemy: 'Opponents'
  };
  const TEAM_COLORS: Readonly<Record<Team, string>> = {
    ally: '#50b9ff',
    enemy: '#ff6268'
  };
  const ROLE_COLORS: Readonly<Record<Role, string>> = {
    Vanguard: '#c2a173',
    Duelist: '#a693d4',
    Strategist: '#73aa9c'
  };

  const heroes: readonly HeroDefinition[] = [
    { id: 'strange', name: 'Doctor Strange', initials: 'DS', role: 'Vanguard' },
    { id: 'groot', name: 'Groot', initials: 'GR', role: 'Vanguard' },
    { id: 'magneto', name: 'Magneto', initials: 'MG', role: 'Vanguard' },
    { id: 'magik', name: 'Magik', initials: 'MK', role: 'Duelist' },
    { id: 'psylocke', name: 'Psylocke', initials: 'PS', role: 'Duelist' },
    { id: 'storm', name: 'Storm', initials: 'ST', role: 'Duelist' },
    { id: 'luna', name: 'Luna Snow', initials: 'LS', role: 'Strategist' },
    { id: 'rocket', name: 'Rocket Raccoon', initials: 'RR', role: 'Strategist' },
    { id: 'mantis', name: 'Mantis', initials: 'MN', role: 'Strategist' }
  ];

  const initialTokens = (): BoardToken[] => [
    { id: 'ally-strange', heroId: 'strange', team: 'ally', x: 270, y: 435 },
    { id: 'ally-psylocke', heroId: 'psylocke', team: 'ally', x: 380, y: 350 },
    { id: 'ally-luna', heroId: 'luna', team: 'ally', x: 230, y: 520 },
    { id: 'enemy-magneto', heroId: 'magneto', team: 'enemy', x: 865, y: 310 },
    { id: 'enemy-magik', heroId: 'magik', team: 'enemy', x: 960, y: 410 },
    { id: 'enemy-rocket', heroId: 'rocket', team: 'enemy', x: 910, y: 515 }
  ];

  let boardHost: HTMLDivElement;
  let stage: Konva.Stage | undefined;
  let tokenLayer: Konva.Layer | undefined;
  let selectedTeam = $state<Team>('ally');
  let selectedTokenId = $state<string | null>(null);
  let tokens = $state<BoardToken[]>(initialTokens());
  let announcement = $state('Drag any token to explain a rotation or position.');

  let selectedToken = $derived(tokens.find((token) => token.id === selectedTokenId));
  let selectedHero = $derived(
    selectedToken ? heroes.find((hero) => hero.id === selectedToken.heroId) : undefined
  );
  let allyCount = $derived(tokens.filter((token) => token.team === 'ally').length);
  let enemyCount = $derived(tokens.filter((token) => token.team === 'enemy').length);

  onMount(() => {
    stage = new Konva.Stage({
      container: boardHost,
      width: 1,
      height: 1
    });

    const mapLayer = new Konva.Layer();
    tokenLayer = new Konva.Layer();
    stage.add(mapLayer, tokenLayer);
    drawMap(mapLayer);
    renderTokens(tokens, selectedTokenId);

    stage.on('click tap', (event) => {
      if (event.target === stage) selectedTokenId = null;
    });

    const resizeObserver = new ResizeObserver(() => resizeStage());
    resizeObserver.observe(boardHost);
    resizeStage();

    return () => {
      resizeObserver.disconnect();
      stage?.destroy();
      stage = undefined;
      tokenLayer = undefined;
    };
  });

  $effect(() => renderTokens(tokens, selectedTokenId));

  function resizeStage(): void {
    if (!stage) return;
    const width = boardHost.clientWidth;
    const height = boardHost.clientHeight;
    if (width <= 0 || height <= 0) return;

    const scale = Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT);
    stage.width(BOARD_WIDTH * scale);
    stage.height(BOARD_HEIGHT * scale);
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }

  function drawMap(layer: Konva.Layer): void {
    layer.add(
      new Konva.Rect({
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        fill: '#111214',
        listening: false
      })
    );

    for (let x = 0; x <= BOARD_WIDTH; x += 60) {
      layer.add(
        new Konva.Line({
          points: [x, 0, x, BOARD_HEIGHT],
          stroke: 'rgba(255, 255, 255, 0.05)',
          strokeWidth: 1,
          listening: false
        })
      );
    }

    for (let y = 0; y <= BOARD_HEIGHT; y += 60) {
      layer.add(
        new Konva.Line({
          points: [0, y, BOARD_WIDTH, y],
          stroke: 'rgba(255, 255, 255, 0.05)',
          strokeWidth: 1,
          listening: false
        })
      );
    }

    const zones: ReadonlyArray<{ points: number[]; fill: string; stroke: string }> = [
      {
        points: [48, 94, 270, 46, 366, 166, 330, 305, 116, 330, 38, 236],
        fill: '#191a1d',
        stroke: '#303137'
      },
      {
        points: [432, 68, 762, 48, 866, 178, 790, 312, 444, 298, 370, 176],
        fill: '#17181b',
        stroke: '#2d2e33'
      },
      {
        points: [866, 86, 1144, 116, 1170, 312, 1038, 352, 842, 278],
        fill: '#1b1c20',
        stroke: '#323339'
      },
      {
        points: [54, 410, 260, 344, 420, 462, 340, 690, 98, 714, 34, 574],
        fill: '#18191c',
        stroke: '#2e2f34'
      },
      {
        points: [456, 378, 754, 348, 850, 510, 710, 704, 448, 682, 374, 520],
        fill: '#1c1d20',
        stroke: '#33343a'
      },
      {
        points: [894, 392, 1138, 358, 1172, 568, 1084, 710, 830, 674, 804, 520],
        fill: '#17181b',
        stroke: '#2d2e33'
      }
    ];

    for (const zone of zones) {
      layer.add(
        new Konva.Line({
          points: zone.points,
          closed: true,
          fill: zone.fill,
          stroke: zone.stroke,
          strokeWidth: 3,
          listening: false
        })
      );
    }

    const routePoints = [
      92, 550, 250, 480, 390, 420, 530, 390, 650, 390, 798, 430, 938, 474, 1110, 530
    ];
    layer.add(
      new Konva.Line({
        points: routePoints,
        stroke: '#2b2d31',
        strokeWidth: 18,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        listening: false
      }),
      new Konva.Line({
        points: routePoints,
        stroke: '#5f626a',
        strokeWidth: 2,
        opacity: 1,
        lineCap: 'round',
        listening: false
      })
    );

    addSpawnZone(layer, 116, 540, 'A', '#57b9ff');
    addSpawnZone(layer, 1084, 530, 'B', '#ff696d');

    layer.add(
      new Konva.Circle({
        x: 610,
        y: 395,
        radius: 74,
        fill: 'rgba(138, 143, 152, 0.08)',
        stroke: '#8a8f98',
        strokeWidth: 2,
        listening: false
      }),
      new Konva.Circle({
        x: 610,
        y: 395,
        radius: 28,
        fill: '#8a8f98',
        listening: false
      }),
      new Konva.Text({
        x: 566,
        y: 462,
        width: 88,
        text: 'OBJECTIVE',
        align: 'center',
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fontStyle: 'bold',
        fill: '#c6c8ce',
        listening: false
      })
    );

    const labels: ReadonlyArray<{ x: number; y: number; text: string }> = [
      { x: 88, y: 170, text: 'WEST GROVE' },
      { x: 505, y: 144, text: 'GALA HALL' },
      { x: 920, y: 192, text: 'EAST GARDEN' },
      { x: 470, y: 610, text: 'LOWER WALK' }
    ];

    for (const label of labels) {
      layer.add(
        new Konva.Text({
          x: label.x,
          y: label.y,
          text: label.text,
          fontFamily: 'Arial, sans-serif',
          fontSize: 17,
          fontStyle: 'bold',
          fill: 'rgba(255, 255, 255, 0.28)',
          listening: false
        })
      );
    }
    layer.draw();
  }

  function addSpawnZone(
    layer: Konva.Layer,
    x: number,
    y: number,
    label: string,
    color: string
  ): void {
    layer.add(
      new Konva.Circle({
        x,
        y,
        radius: 58,
        fill: 'rgba(255, 255, 255, 0.025)',
        stroke: color,
        strokeWidth: 2,
        listening: false
      }),
      new Konva.Text({
        x: x - 18,
        y: y - 19,
        width: 36,
        text: label,
        align: 'center',
        fontFamily: 'Arial, sans-serif',
        fontSize: 38,
        fontStyle: 'bold',
        fill: color,
        opacity: 0.7,
        listening: false
      })
    );
  }

  function renderTokens(
    currentTokens: readonly BoardToken[],
    currentSelectedTokenId: string | null
  ): void {
    const layer = tokenLayer;
    const currentStage = stage;
    if (!layer || !currentStage) return;

    layer.destroyChildren();
    for (const token of currentTokens) {
      const hero = heroes.find((candidate) => candidate.id === token.heroId);
      if (!hero) continue;

      layer.add(
        createTokenGroup(
          token,
          hero,
          token.id === currentSelectedTokenId,
          currentStage
        )
      );
    }
    layer.draw();
  }

  function createTokenGroup(
    token: BoardToken,
    hero: HeroDefinition,
    isSelected: boolean,
    currentStage: Konva.Stage
  ): Konva.Group {
    const group = new Konva.Group({
      x: token.x,
      y: token.y,
      draggable: true,
      dragBoundFunc: (position) => boundTokenPosition(position, currentStage.scaleX())
    });

    group.add(
      new Konva.Circle({
        radius: TOKEN_RADIUS,
        fill: '#222326',
        stroke: isSelected ? '#ffffff' : TEAM_COLORS[token.team],
        strokeWidth: isSelected ? 4 : 3
      }),
      new Konva.Text({
        x: -27,
        y: -9,
        width: 54,
        text: hero.initials,
        align: 'center',
        fontFamily: 'Arial, sans-serif',
        fontSize: 17,
        fontStyle: 'bold',
        fill: roleColor(hero.role)
      })
    );

    group.on('click tap', (event) => {
      event.cancelBubble = true;
      selectedTokenId = token.id;
      announcement = `${hero.name} selected.`;
    });
    group.on('pointerenter', () => setBoardCursor(currentStage, 'grab'));
    group.on('pointerleave', () => setBoardCursor(currentStage, 'default'));
    group.on('dragstart', () => {
      group.moveToTop();
      setBoardCursor(currentStage, 'grabbing');
    });
    group.on('dragend', () => {
      const nextX = Math.round(group.x());
      const nextY = Math.round(group.y());

      // Selecting before dragend would replace the active Konva node during the first drag.
      selectedTokenId = token.id;
      tokens = tokens.map((current) =>
        current.id === token.id ? { ...current, x: nextX, y: nextY } : current
      );
      announcement = `${hero.name} moved to ${nextX}, ${nextY}.`;
      setBoardCursor(currentStage, 'grab');
    });

    return group;
  }

  function boundTokenPosition(position: Konva.Vector2d, scale: number): Konva.Vector2d {
    return {
      x: clamp(position.x, TOKEN_RADIUS * scale, (BOARD_WIDTH - TOKEN_RADIUS) * scale),
      y: clamp(position.y, TOKEN_RADIUS * scale, (BOARD_HEIGHT - TOKEN_RADIUS) * scale)
    };
  }

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function setBoardCursor(currentStage: Konva.Stage, cursor: BoardCursor): void {
    currentStage.container().style.cursor = cursor;
  }

  function addHero(hero: HeroDefinition): void {
    const id = `${selectedTeam}-${hero.id}`;
    if (tokens.some((token) => token.id === id)) {
      selectedTokenId = id;
      announcement = `${hero.name} is already with ${teamLabel(selectedTeam)}.`;
      return;
    }

    const index = tokens.filter((token) => token.team === selectedTeam).length;
    const token: BoardToken = {
      id,
      heroId: hero.id,
      team: selectedTeam,
      x: selectedTeam === 'ally' ? 130 + (index % 3) * 72 : 1070 - (index % 3) * 72,
      y: 580 - Math.floor(index / 3) * 78
    };

    tokens = [...tokens, token];
    selectedTokenId = token.id;
    announcement = `${hero.name} added to ${teamLabel(selectedTeam)}.`;
  }

  function removeSelected(): void {
    const token = selectedToken;
    if (!token) return;

    const heroName = heroes.find((hero) => hero.id === token.heroId)?.name ?? 'Hero';
    tokens = tokens.filter((current) => current.id !== token.id);
    selectedTokenId = null;
    announcement = `${heroName} removed from the board.`;
  }

  function resetBoard(): void {
    tokens = initialTokens();
    selectedTokenId = null;
    announcement = 'The example formation is restored.';
  }

  function clearBoard(): void {
    tokens = [];
    selectedTokenId = null;
    announcement = 'The board is clear.';
  }

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTokenId) {
      event.preventDefault();
      removeSelected();
    }
  }

  function teamLabel(team: Team): string {
    return TEAM_LABELS[team];
  }

  function roleColor(role: Role): string {
    return ROLE_COLORS[role];
  }
</script>

<svelte:head>
  <title>Position Board | Rivals Lab</title>
  <link rel="icon" href="/favicon.svg" />
  <meta name="description" content="A local board for explaining Marvel Rivals positions." />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app-shell">
  <header class="topbar">
    <div class="title-group">
      <strong>Rivals Lab</strong>
      <span>Position Board</span>
    </div>
    <div class="header-actions">
      <button class="secondary-button" type="button" onclick={clearBoard}>Clear</button>
      <button class="primary-button" type="button" onclick={resetBoard}>Reset</button>
    </div>
  </header>

  <main class="app-main">
    <aside class="hero-panel" aria-labelledby="heroes-heading">
      <div class="sidebar-heading">
        <h2 id="heroes-heading">Heroes</h2>
        <p>Choose a team, then add heroes to the board.</p>
      </div>

      <div class="team-picker" aria-label="Team for new heroes">
        <button
          class:active={selectedTeam === 'ally'}
          class="team-option blue"
          type="button"
          aria-pressed={selectedTeam === 'ally'}
          onclick={() => (selectedTeam = 'ally')}
        >
          Allies <span>{allyCount}</span>
        </button>
        <button
          class:active={selectedTeam === 'enemy'}
          class="team-option red"
          type="button"
          aria-pressed={selectedTeam === 'enemy'}
          onclick={() => (selectedTeam = 'enemy')}
        >
          Opponents <span>{enemyCount}</span>
        </button>
      </div>

      <div class="hero-list">
        {#each heroes as hero (hero.id)}
          {@const isPlaced = tokens.some(
            (token) => token.id === `${selectedTeam}-${hero.id}`
          )}
          <button
            class="hero-row"
            class:placed={isPlaced}
            type="button"
            onclick={() => addHero(hero)}
          >
            <span class="hero-initials" style:--role-color={roleColor(hero.role)}>
              {hero.initials}
            </span>
            <span class="hero-name">
              <strong>{hero.name}</strong><small>{hero.role}</small>
            </span>
            <span class="row-action">
              {isPlaced ? 'Added' : 'Add'}
            </span>
          </button>
        {/each}
      </div>
    </aside>

    <section class="board-panel" aria-labelledby="board-heading">
      <div class="board-heading">
        <div>
          <h1 id="board-heading">Krakoa</h1>
          <p>Placeholder map</p>
        </div>
        <div class="legend">
          <span><i class="blue-dot"></i>Allies</span>
          <span><i class="red-dot"></i>Opponents</span>
          <span><i class="objective-dot"></i>Objective</span>
        </div>
      </div>

      <div class="board-shell">
        <div
          class="stage-host"
          bind:this={boardHost}
          aria-label="Placeholder overhead map of Krakoa with draggable hero position tokens"
        ></div>
      </div>

      {#if selectedToken && selectedHero}
        <div class="selection-bar">
          <span
            class="selection-team"
            class:blue-team={selectedToken.team === 'ally'}
            class:red-team={selectedToken.team === 'enemy'}
          ></span>
          <div class="selection-name">
            <strong>{selectedHero.name}</strong>
            <span>{teamLabel(selectedToken.team)}</span>
          </div>
          <span class="coordinates">x {selectedToken.x}, y {selectedToken.y}</span>
          <button class="text-button" type="button" onclick={removeSelected}>Remove</button>
        </div>
      {:else}
        <p class="board-help">Drag a hero to change its position. Select one to remove it.</p>
      {/if}
    </section>
  </main>

  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>
