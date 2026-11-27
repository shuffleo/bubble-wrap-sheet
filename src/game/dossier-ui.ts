import {GAME_CONFIG,levelDefinition} from './game-config';
import {MEDAL_NAMES,medalTargets,upcomingLevels,type MedalName} from './level-presentation';
import type {LevelId} from './game-types';

export function medalStripMarkup(levelId:LevelId,earned:MedalName|null=null):string {
 const earnedIndex=earned===null?-1:MEDAL_NAMES.indexOf(earned);
 return `<div class="game-medals" aria-label="Medal targets">${medalTargets(levelId).map((medal,index)=>`<div class="game-medal" data-medal="${medal.name}" data-earned="${medal.name===earned}" data-passed="${earnedIndex>=index}"><span>${titleCase(medal.name)}</span><strong>${medal.label}</strong></div>`).join('')}</div>`;
}

export function roadmapMarkup(current:LevelId):string {
 const levels=upcomingLevels(current);
 return `<div class="game-roadmap">${levels.map(level=>`<article class="game-roadmap-level"><div><span class="game-eyebrow">Level ${level.id}</span><h3>${level.name}</h3></div><strong>${level.goal}</strong><p>${level.hazard}</p><div class="game-roadmap-medals">${level.medals.map(medal=>`<span data-medal="${medal.name}">${titleCase(medal.name)} <b>${medal.label}</b></span>`).join('')}</div></article>`).join('')}</div>`;
}

export function levelLabel(levelId:LevelId):string {
 const level=levelDefinition(levelId);
 return `Level ${level.id} of ${GAME_CONFIG.run.levelCount} · ${level.name}`;
}

export function titleCase(value:string):string {
 return value.charAt(0).toUpperCase()+value.slice(1);
}
