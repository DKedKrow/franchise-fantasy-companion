import { createFantasyLeague, scoreFantasyLeague, upgradeFantasyLeague } from './league.js';
import { getArchetype } from './archetypes.js';

const managerNames = [
  ['Maya Chen', '@maydaymaya'], ['Dre Lawson', '@fourthanddre'], ['Nico Vega', '@nicoblitz'],
  ['Tasha Reed', '@tashatalksball'], ['Owen Price', '@owenanalytics'], ['Jules Carter', '@julesinthepocket'],
  ['Marcus Bell', '@bellringer'], ['Priya Shah', '@priyapicks'], ['Eli Brooks', '@eliintheendzone'],
  ['Sam Rivera', '@rivarunsit'], ['Avery King', '@kingofwaivers'], ['Jordan Knox', '@knoxknowsball'],
  ['Carmen Lee', '@carmenroutes'], ['Miles Grant', '@milesahead'], ['Riley Foster', '@rileyredzone'],
  ['Noah Bennett', '@nobenchnoah'], ['Zoe Turner', '@zoetwominute'], ['Isaac Cole', '@colehardfacts'],
  ['Lena Ortiz', '@lenaontheline'], ['Devon Hayes', '@devondagame'], ['Quinn Parker', '@quinncoverage'],
  ['Ari Morgan', '@arimoveschains'], ['Casey Woods', '@caseyclutch'], ['Nia Sullivan', '@niasunday'],
  ['Theo Banks', '@bankshot'], ['Morgan Ellis', '@morganmotion'], ['Jamie Fox', '@foxintheflex'],
  ['Taylor Ross', '@rossreads'], ['Skyler Ward', '@skyhighscores'], ['Chris Monroe', '@monroematchups'],
  ['Alex Kim', '@alexafterdark'], ['Dani Cooper', '@cooperclock'], ['Emery Scott', '@emeryedge'],
  ['Reese Walker', '@reesereacts'], ['Cameron Young', '@youngyards'], ['Blair Adams', '@blairball'],
  ['Logan Cruz', '@cruzcontrol'], ['Sydney Hall', '@sydneyseesit'], ['Micah Green', '@greenlight'],
  ['Harper Stone', '@stonecoldtakes'],
];
export const WORLD_PERSONALITIES = [
  'Hype Machine', 'Stathead', 'Trash Talker', 'Film Nerd', 'Loyalist', 'Chaos Agent',
  'Waiver Grinder', 'Old School', 'Nervous Fan', 'Optimist', 'Scout', 'Hot Take Artist',
  'Storyteller', 'Silent Assassin',
];
const personalities = WORLD_PERSONALITIES;
const leagueNames = ['Sunday Circuit', 'The Film Room', 'Fourth Down Society', 'Gridiron After Dark', 'The Waiver Wire'];
const fantasyTeamNames = [
  'Route Runners', 'Pocket Rockets', 'YAC Attack', 'Blitz Brigade', 'Red Zone Royalty', 'Sunday Scaries',
  'Goal Line Ghosts', 'Two-Minute Warning', 'Chain Movers', 'Coverage Bust', 'Play Action', 'Touchdown Theory',
  'The Audibles', 'Turf Monsters', 'Slot Machines', 'No Punt Intended', 'Fourth & Forever', 'The Checkdowns',
  'Motion Menace', 'End Zone Energy', 'Clock Killers', 'The Hot Routes', 'Prime Time Problems', 'Box Score Bandits',
  'Waiver Wizards', 'The Ball Hawks', 'Pocket Escape', 'Fantasy Physics', 'The Contenders', 'Sunday Spoilers',
  'Snap Counts', 'The Underdogs', 'First Read', 'Big Play Lab', 'The Comeback', 'Victory Formation',
  'The Matchup', 'Stiff Arm Club', 'Air Yards', 'The Box Stack',
];
const worldFormats = [
  { draftType: 'snake', waiverType: 'rolling', playoffTeams: 4, keeperMode: 'redraft' },
  { draftType: 'auction', waiverType: 'faab', faabBudget: 100, playoffTeams: 4, keeperMode: 'keeper' },
  { draftType: 'instant', waiverType: 'reverse', playoffTeams: 6, keeperMode: 'dynasty' },
  { draftType: 'snake', waiverType: 'faab', faabBudget: 150, playoffTeams: 4, keeperMode: 'redraft' },
  { draftType: 'auction', waiverType: 'rolling', playoffTeams: 6, keeperMode: 'keeper' },
];

function hashText(text) {
  let hash = 2166136261;
  for (const character of String(text)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

const initials = (name) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const choose = (items, seed) => items[hashText(seed) % items.length];

export function upgradeFantasyWorld(world) {
  let managerIndex = 0;
  world.leagues.forEach((entry, leagueIndex) => {
    upgradeFantasyLeague(entry.league);
    entry.managers.forEach((manager) => {
      const personality = personalities[(managerIndex + leagueIndex) % personalities.length];
      if (manager.id === world.userManagerId) {
        if (manager.npcIdentity) manager.npcIdentity.personality = personality;
      } else manager.personality = personality;
      manager.bio ??= choose([
        'Trusts the tape, distrusts projections.', 'Will trade anyone after one bad Sunday.',
        'Treats the waiver wire like a full-time job.', 'Emotionally attached to every draft pick.',
        'Claims every win was obvious in advance.', 'Building a dynasty one questionable decision at a time.',
      ], `${managerIndex}:bio`);
      const team = entry.league.teams.find((candidate) => candidate.id === manager.teamId);
      manager.favoritePlayerKey ??= team?.roster[hashText(`${managerIndex}:favorite`) % Math.max(team?.roster.length ?? 0, 1)] ?? null;
      manager.reputation ??= choose(['Waiver hawk', 'Trade architect', 'Lineup tinkerer', 'Matchup hunter', 'Loyal roster builder'], `${managerIndex}:reputation`);
      manager.tradePartners ??= [];
      manager.titles ??= 0;
      manager.mood ??= choose(['Confident', 'Scheming', 'Cautiously optimistic', 'Locked in'], `${managerIndex}:mood`);
      manager.memories ??= [];
      manager.relationships ??= {};
      managerIndex += 1;
    });
    entry.managers.forEach((manager, index) => {
      manager.rivalId = entry.managers[(index + 4) % entry.managers.length].id;
      manager.relationships[manager.rivalId] ??= -2;
    });
  });
  world.storylines ??= [];
  world.chatMessages ??= [];
  world.history ??= [];
  return world;
}

export function updateWorldContinuity(world, players, weeks) {
  upgradeFantasyWorld(world);
  if (!weeks.length) return world;
  const latest = weeks.at(-1);
  const memoryKey = `${latest.weekType}:${latest.week}`;
  for (const entry of world.leagues) {
    const scored = scoreFantasyLeague(entry.league, players, weeks);
    const week = scored.matchups.find((item) => item.week === latest.week && item.weekType === latest.weekType);
    for (const game of week?.games ?? []) {
      const sides = [
        { team: game.first, own: game.firstLineup.total, other: game.second, against: game.secondLineup.total },
        { team: game.second, own: game.secondLineup.total, other: game.first, against: game.firstLineup.total },
      ];
      for (const side of sides) {
        const manager = entry.managers.find((candidate) => candidate.teamId === side.team.id);
        const opponent = entry.managers.find((candidate) => candidate.teamId === side.other.id);
        if (!manager || manager.lastMemoryKey === memoryKey) continue;
        const won = side.own > side.against; const tied = side.own === side.against;
        manager.mood = tied ? 'Unsettled' : won
          ? choose(['Confident', 'Celebrating', 'Locked in'], `${manager.id}:${memoryKey}:win`)
          : choose(['Frustrated', 'Scheming', 'Looking to rebound'], `${manager.id}:${memoryKey}:loss`);
        manager.memories.unshift({
          key: memoryKey,
          text: `${tied ? 'Tied' : won ? 'Beat' : 'Lost to'} ${side.other.name}, ${side.own.toFixed(2)}–${side.against.toFixed(2)}.`,
        });
        manager.memories = manager.memories.slice(0, 6);
        if (opponent) manager.relationships[opponent.id] = (manager.relationships[opponent.id] ?? 0) + (won ? -1 : -2);
        manager.lastMemoryKey = memoryKey;
      }
    }
  }
  return world;
}

export function createFantasyWorld({ name, seasonYear, leagueCount, players, mode = 'observe', userName = 'You' }) {
  const count = Math.max(1, Math.min(5, Number(leagueCount) || 1));
  let managerIndex = 0;
  const leagues = Array.from({ length: count }, (_, leagueIndex) => {
    const league = createFantasyLeague({
      name: leagueNames[leagueIndex], teamCount: 8, seasonYear, players, draftSeed: leagueIndex + 101,
      settings: worldFormats[leagueIndex % worldFormats.length],
    });
    const managers = league.teams.map((team, teamIndex) => {
      const [displayName, handle] = managerNames[managerIndex];
      team.name = fantasyTeamNames[managerIndex];
      const manager = {
        id: `manager-${managerIndex + 1}`,
        teamId: team.id,
        displayName,
        handle,
        initials: initials(displayName),
        personality: personalities[(managerIndex + leagueIndex) % personalities.length],
        bio: choose([
          'Trusts the tape, distrusts projections.', 'Will trade anyone after one bad Sunday.',
          'Treats the waiver wire like a full-time job.', 'Emotionally attached to every draft pick.',
          'Claims every win was obvious in advance.', 'Building a dynasty one questionable decision at a time.',
        ], `${managerIndex}:bio`),
        favoritePlayerKey: team.roster[hashText(`${managerIndex}:favorite`) % team.roster.length],
        reputation: choose(['Waiver hawk', 'Trade architect', 'Lineup tinkerer', 'Matchup hunter', 'Loyal roster builder'], `${managerIndex}:reputation`),
        tradePartners: [],
        titles: 0,
        mood: choose(['Confident', 'Scheming', 'Cautiously optimistic', 'Locked in'], `${managerIndex}:mood`),
        memories: [],
        relationships: {},
      };
      managerIndex += 1;
      return manager;
    });
    managers.forEach((manager, index) => {
      manager.rivalId = managers[(index + 4) % managers.length].id;
      manager.relationships[manager.rivalId] = -2;
    });
    return { league, managers };
  });
  let userManagerId = null;
  if (mode === 'participate') {
    const manager = leagues[0].managers[0];
    manager.npcIdentity = {
      displayName: manager.displayName,
      handle: manager.handle,
      initials: manager.initials,
      personality: manager.personality,
    };
    manager.displayName = userName.trim() || 'You';
    manager.handle = '@you';
    manager.initials = initials(manager.displayName);
    manager.personality = 'Player';
    leagues[0].league.userTeamId = manager.teamId;
    userManagerId = manager.id;
  }
  return {
    schemaVersion: 2,
    name: name?.trim() || 'The Fantasy World',
    seasonYear,
    mode,
    userManagerId,
    leagues,
    customPosts: [],
    storylines: [],
    chatMessages: [],
    history: [],
    createdAt: new Date().toISOString(),
  };
}

function managerPost(manager, winner, loser, winnerScore, loserScore, star, seed) {
  const score = winnerScore.toFixed(2);
  const starText = star ? `${star.player.name} (${star.points.toFixed(2)})` : 'the whole roster';
  const style = getArchetype(winner.archetype);
  const margin = Math.abs(winnerScore - loserScore).toFixed(2);
  const templates = {
    'Hype Machine': [`${winner.name} JUST DROPPED ${score}. ${starText} broke the timeline.`, `Everybody breathe. ${winner.name} won by ${margin} and the victory lap has begun.`],
    Stathead: [`${winner.name}: ${score}. The ${style.name} build created a ${margin}-point edge.`, `${starText} was the leverage point. That is process, not luck.`],
    'Trash Talker': [`${loser.name}, your apology form is on the timeline. ${winner.name} by ${margin}.`, `${winner.name} handled business. Save the excuses for waiver morning.`],
    'Film Nerd': [`The box score says ${score}; the lineup construction says ${style.name}. ${starText} was the stress point.`, `${winner.name} found the matchup and kept attacking it. That was earned.`],
    Loyalist: [`Never doubted this roster for a second. Please ignore everything I posted at halftime.`, `${starText} delivered. That jersey is staying in the starting lineup.`],
    'Chaos Agent': [`A deeply normal win featuring ${starText} and absolutely no emotional damage.`, `${winner.name} survived the nonsense. Fantasy remains a serious scientific discipline.`],
    'Waiver Grinder': [`Nice win, but I already have three claims queued for Tuesday.`, `${starText} saved the week. The bottom of this roster is still getting churned.`],
    'Old School': [`Run the ball, start your studs, collect the win. ${winner.name} did not need a spreadsheet.`, `${winner.name} won with ${score}. Fundamentals still travel.`],
    'Nervous Fan': [`We won? We actually won. I had accepted defeat about six separate times.`, `${margin} points is technically a margin and my heart technically survived.`],
    Optimist: [`The ceiling is getting higher. ${winner.name} is starting to believe.`, `${starText} showed what this roster can become.`],
    Scout: [`The result matters, but ${starText} looked different this week. The role is real.`, `${winner.name} has a repeatable core if that usage holds.`],
    'Hot Take Artist': [`I have seen enough: ${winner.name} is the team nobody wants in the playoffs.`, `${starText} just changed the rest-of-season rankings. Argue with the scoreboard.`],
    Storyteller: [`By Sunday night, ${winner.name} had turned a nervous week into a ${margin}-point chapter.`, `${starText} supplied the moment this matchup will be remembered for.`],
    'Silent Assassin': [`${score}. Win. Moving on.`, `${winner.name} by ${margin}. No notes.`],
  };
  return choose(templates[manager.personality] ?? [`${winner.name}'s ${style.name} approach wins behind ${starText}.`], `${manager.id}:${seed}:post`);
}

function commentFor(manager, context, seed = '') {
  const lines = {
    'Hype Machine': ['THIS LEAGUE IS ALIVE.', 'Put it in the season montage.'],
    Stathead: [`I need the usage data behind this ${context}.`, 'Small sample, loud signal.'],
    'Trash Talker': ['Enjoy it now. The rematch is circled.', 'A lot of victory laps for September.'],
    'Film Nerd': ['The decision made sense before the result.', 'Watch how the matchup created that ceiling.'],
    Loyalist: ['Standing by my squad through all of it.', 'That is why you never bench your people.'],
    'Chaos Agent': ['Fantasy football remains perfectly rational.', 'No lessons. Only vibes.'],
    'Waiver Grinder': ['Already checking whether the backup is available.', 'Someone is getting FAAB dumped on them.'],
    'Old School': ['Points are points. Stop overthinking it.', 'Start your best players and move on.'],
    'Nervous Fan': ['I cannot do another week like this.', 'This app needs a heart-rate warning.'],
    Optimist: ['The breakout is happening.', 'Better weeks are coming. I can feel it.'],
    Scout: ['The role looked sustainable.', 'That usage matters more than the final score.'],
    'Hot Take Artist': ['League winner. I said what I said.', 'This changes everything.'],
    Storyteller: ['Every season needs a moment like this.', 'We will remember this one in December.'],
    'Silent Assassin': ['Noted.', 'Scoreboard.'],
    Player: ['I’m watching this one closely.', 'That matchup got my attention.'],
  };
  return { author: manager.displayName, handle: manager.handle, text: choose(lines[manager.personality] ?? ['What a week.'], `${manager.id}:${context}:${seed}`) };
}

export function generateWorldFeed(world, players, weeks) {
  const posts = [];
  const managers = world.leagues.flatMap((entry) => entry.managers);
  const managerByTeam = new Map();
  world.leagues.forEach((entry) => entry.managers.forEach((manager) => managerByTeam.set(`${entry.league.name}:${manager.teamId}`, manager)));

  for (const week of weeks) {
    const performances = players
      .map((player) => ({ player, points: player.logs.find((log) => log.week === week.week && log.weekType === week.weekType)?.points ?? null }))
      .filter((entry) => entry.points !== null)
      .sort((a, b) => b.points - a.points);
    const star = performances[0];
    if (star) {
      const commenter = managers[hashText(`${week.week}:star`) % managers.length];
      posts.push({
        id: `wire-${week.week}`, week: week.week, weekType: week.weekType, type: 'player',
        author: 'Gridiron Wire', handle: '@gridironwire', initials: 'GW',
        text: choose([
          `${star.player.name} owned Week ${week.week + 1}: ${star.points.toFixed(2)} points for ${star.player.team?.abbreviation ?? 'FA'}. Nobody else reached that altitude.`,
          `Sunday's loudest performance belonged to ${star.player.name}. ${star.points.toFixed(2)} points, one very unhappy collection of fantasy opponents.`,
          `${star.player.name} just became the main character of Week ${week.week + 1} with ${star.points.toFixed(2)} fantasy points.`,
          `League-wide high score: ${star.player.name}, ${star.points.toFixed(2)}. Screenshots are already circulating.`,
        ], `${week.week}:wire-copy`),
        likes: 40 + (hashText(star.player.key) % 180),
        comments: [commentFor(commenter, 'player-performance', week.week)], playerKey: star.player.key,
      });
      const priorAverage = (player) => {
        const prior = player.logs.filter((log) => log.weekType === week.weekType && log.week < week.week);
        return prior.length ? prior.reduce((sum, log) => sum + log.points, 0) / prior.length : 0;
      };
      const breakout = performances.map((entry) => ({ ...entry, lift: entry.points - priorAverage(entry.player) }))
        .filter((entry) => priorAverage(entry.player) > 0 && entry.lift >= 8).sort((a, b) => b.lift - a.lift)[0];
      if (breakout) {
        const voice = managers[hashText(`${week.week}:breakout`) % managers.length];
        posts.push({ id: `breakout-${week.week}`, week: week.week, weekType: week.weekType, type: 'player', author: 'Sunday Signal', handle: '@sundaysignal', initials: 'SS', text: `${breakout.player.name} beat their previous weekly pace by ${breakout.lift.toFixed(2)} points. Breakout, matchup spike, or the start of a new role?`, likes: 18 + hashText(breakout.player.key) % 90, comments: [commentFor(voice, 'breakout', week.week)], playerKey: breakout.player.key });
      }
    }
  }

  for (const entry of world.leagues) {
    const scored = scoreFantasyLeague(entry.league, players, weeks);
    const streaks = new Map(entry.league.teams.map((team) => [team.id, 0]));
    for (const week of scored.matchups) {
      week.games.forEach((game, matchupIndex) => {
        const firstWon = game.firstLineup.total >= game.secondLineup.total;
        const winner = firstWon ? game.first : game.second;
        const loser = firstWon ? game.second : game.first;
        const winnerLineup = firstWon ? game.firstLineup : game.secondLineup;
        const winnerScore = winnerLineup.total;
        const loserScore = firstWon ? game.secondLineup.total : game.firstLineup.total;
        const manager = managerByTeam.get(`${entry.league.name}:${winner.id}`);
        const loserManager = managerByTeam.get(`${entry.league.name}:${loser.id}`);
        const rivalManager = entry.managers.find((candidate) => candidate.id === manager.rivalId);
        const star = [...winnerLineup.entries].sort((a, b) => b.points - a.points)[0];
        let neutral = managers[(hashText(`${entry.league.name}:${week.week}:${matchupIndex}`) + 3) % managers.length];
        if (neutral.id === loserManager.id) neutral = managers[(managers.indexOf(neutral) + 1) % managers.length];
        const isUserWinner = manager.id === world.userManagerId;
        const postAuthor = isUserWinner
          ? { displayName: `${entry.league.name} Desk`, handle: '@leagueoffice', initials: 'LO', personality: null }
          : manager;
        const postText = isUserWinner
          ? `${winner.name} won ${winnerScore.toFixed(2)}–${loserScore.toFixed(2)} behind ${star ? `${star.player.name}'s ${star.points.toFixed(2)} points` : 'a complete lineup'}.`
          : managerPost(manager, winner, loser, winnerScore, loserScore, star, week.week);
        posts.push({
          id: `${entry.league.name}-${week.week}-${matchupIndex}`, week: week.week, weekType: week.weekType, type: 'fantasy',
          author: postAuthor.displayName, handle: postAuthor.handle, initials: postAuthor.initials, personality: postAuthor.personality,
          archetype: getArchetype(winner.archetype).name,
          leagueName: entry.league.name,
          text: postText,
          likes: 4 + (hashText(`${manager.id}:${week.week}`) % 46),
          comments: [
            commentFor(loserManager, 'matchup', week.week),
            commentFor(neutral, 'lineup', `${week.week}:${matchupIndex}`),
            ...(rivalManager && rivalManager.id !== loserManager.id ? [{ author: rivalManager.displayName, handle: rivalManager.handle, text: choose(['I hate that this worked.', 'Enjoy the win. I am keeping receipts.', 'The rivalry standings still favor me spiritually.'], `${rivalManager.id}:${week.week}:rival`) }] : []),
          ],
          playerKey: star?.player.key ?? null,
        });
        const winnerStreak = Math.max(1, (streaks.get(winner.id) ?? 0) + 1);
        const loserStreak = Math.min(-1, (streaks.get(loser.id) ?? 0) - 1);
        streaks.set(winner.id, winnerStreak); streaks.set(loser.id, loserStreak);
        if ([3, 5].includes(winnerStreak)) {
          const voice = managers[hashText(`${entry.league.name}:${winner.id}:${winnerStreak}`) % managers.length];
          posts.push({ id: `${entry.league.name}-${week.week}-${winner.id}-streak`, week: week.week, weekType: week.weekType, type: 'fantasy', author: 'The Streak', handle: '@thestreak', initials: 'TS', leagueName: entry.league.name, text: `${winner.name} has won ${winnerStreak} straight. The league has moved from “nice start” to “who is stopping this?”`, likes: 20 + hashText(winner.id) % 70, comments: [commentFor(voice, 'winning streak', winnerStreak)] });
        }
        if (loserStreak === -3) {
          posts.push({ id: `${entry.league.name}-${week.week}-${loser.id}-slide`, week: week.week, weekType: week.weekType, type: 'fantasy', author: 'Sunday Therapy', handle: '@sundaytherapy', initials: 'ST', leagueName: entry.league.name, text: `${loser.name} has dropped three in a row. The group chat is concerned; the manager insists the locker room is fine.`, likes: 9 + hashText(loser.id) % 40, comments: [commentFor(loserManager, 'losing streak', week.week)] });
        }
      });
      const closest = [...week.games].sort((a, b) => Math.abs(a.firstLineup.total - a.secondLineup.total) - Math.abs(b.firstLineup.total - b.secondLineup.total))[0];
      if (closest) {
        const margin = Math.abs(closest.firstLineup.total - closest.secondLineup.total);
        const reaction = managers[hashText(`${entry.league.name}:${week.week}:close`) % managers.length];
        posts.push({ id: `${entry.league.name}-${week.week}-pulse`, week: week.week, weekType: week.weekType, type: 'fantasy', author: `${entry.league.name} Live`, handle: '@fantasylive', initials: 'FL', leagueName: entry.league.name, text: margin < 1 ? `${closest.first.name} and ${closest.second.name} finished ${margin.toFixed(2)} apart. One stat correction could restart the entire argument.` : `Game of the week: ${closest.first.name} vs ${closest.second.name}, decided by ${margin.toFixed(2)} points.`, likes: 12 + hashText(`${entry.league.name}:${week.week}`) % 60, comments: [commentFor(reaction, 'photo finish', week.week)] });
      }
    }

    for (const transaction of entry.league.transactions ?? []) {
      const manager = entry.managers.find((candidate) => candidate.teamId === transaction.teamId || candidate.teamId === transaction.toTeamId);
      const player = players.find((candidate) => candidate.key === transaction.addPlayerKey || candidate.key === transaction.requestPlayerKey);
      if (!manager || !player) continue;
      posts.push({
        id: `${entry.league.name}-${transaction.id}`, week: transaction.week ?? weeks.length, weekType: 'RegularSeason', type: 'fantasy',
        author: `${entry.league.name} Transactions`, handle: '@transactionwire', initials: 'TW', leagueName: entry.league.name,
        text: transaction.type === 'trade'
          ? `${manager.displayName} completed a trade for ${player.name}. The group chat has already split into winners and losers.`
          : `${manager.displayName} landed ${player.name}${transaction.bid ? ` for $${transaction.bid} FAAB` : ' on waivers'}.`,
        likes: 5 + hashText(transaction.id) % 35, comments: [commentFor(manager, 'transaction', transaction.id)], playerKey: player.key,
      });
    }
  }
  for (const message of world.chatMessages ?? []) {
    posts.push({ ...message, type: 'fantasy', comments: message.comments ?? [], likes: message.likes ?? 0 });
  }
  return [...(world.customPosts ?? []), ...posts].sort((a, b) => b.week - a.week || b.id.localeCompare(a.id));
}

export function buildWorldStorylines(world, players, weeks) {
  const stories = [];
  for (const entry of world.leagues) {
    const scored = scoreFantasyLeague(entry.league, players, weeks);
    const leader = scored.standings[0];
    const last = scored.standings.at(-1);
    if (leader) stories.push({ leagueName: entry.league.name, title: `${leader.team.name} controls the race`, detail: `${leader.wins}-${leader.losses} with ${leader.pointsFor.toFixed(1)} points for.` });
    if (last && weeks.length >= 4) stories.push({ leagueName: entry.league.name, title: `${last.team.name} needs a turnaround`, detail: `The playoff path is narrowing after a ${last.wins}-${last.losses} start.` });
    const rivals = entry.managers.slice(0, 2);
    if (rivals.length === 2) stories.push({ leagueName: entry.league.name, title: `${rivals[0].displayName} vs ${rivals[1].displayName}`, detail: 'The rivalry has moved from friendly banter to weekly scoreboard watching.' });
  }
  world.storylines = stories;
  return stories;
}

export function generateLeagueChat(world, week = 0) {
  const messages = [];
  for (const entry of world.leagues) {
    const managers = entry.managers;
    const author = managers[hashText(`${entry.league.name}:${week}:chat`) % managers.length];
    const rival = managers.find((manager) => manager.id === author.rivalId) ?? managers[0];
    messages.push({
      id: `chat-${entry.league.name}-${week}`, week, weekType: 'RegularSeason', leagueName: entry.league.name,
      author: `${entry.league.name} Group Chat`, handle: '@leaguechat', initials: 'GC',
      text: choose([
        `${author.displayName}: “Lineup locked.” ${rival.displayName}: “That is what worries me.”`,
        `${author.displayName} posted a projection screenshot. Three managers immediately muted the chat.`,
        `${rival.displayName} called the latest trade “league altering.” ${author.displayName} reacted with one suspicious emoji.`,
      ], `${entry.league.name}:${week}:chat-copy`),
      likes: 2 + hashText(author.id) % 20, comments: [],
    });
  }
  world.chatMessages = [...(world.chatMessages ?? []).filter((message) => message.week !== week), ...messages];
  return messages;
}

export function joinFantasyWorld(world, userName = 'You', managerId = null) {
  if (world.userManagerId) return world;
  const leagueEntry = world.leagues.find((entry) => entry.managers.some((candidate) => candidate.id === managerId)) ?? world.leagues[0];
  const manager = leagueEntry.managers.find((candidate) => candidate.id === managerId) ?? leagueEntry.managers[0];
  manager.npcIdentity = {
    displayName: manager.displayName,
    handle: manager.handle,
    initials: manager.initials,
    personality: manager.personality,
  };
  manager.displayName = userName.trim() || 'You';
  manager.handle = '@you';
  manager.initials = initials(manager.displayName);
  manager.personality = 'Player';
  leagueEntry.league.userTeamId = manager.teamId;
  world.mode = 'participate';
  world.userManagerId = manager.id;
  return world;
}

export function observeFantasyWorld(world) {
  const manager = world.leagues.flatMap((entry) => entry.managers).find((entry) => entry.id === world.userManagerId);
  if (manager?.npcIdentity) Object.assign(manager, manager.npcIdentity);
  if (manager) delete manager.npcIdentity;
  world.mode = 'observe';
  world.userManagerId = null;
  return world;
}
