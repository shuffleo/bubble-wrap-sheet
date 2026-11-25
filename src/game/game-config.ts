import {LEVEL_DESIGN} from './generated/level-design-config';
import type {LevelId} from './game-types';

export const GAME_CONFIG=LEVEL_DESIGN;
export type UpgradeId=keyof typeof GAME_CONFIG.upgrades;
export type HazardId=keyof typeof GAME_CONFIG.hazards.selectionWeights;

export function levelDefinition(id:LevelId){
 const level=GAME_CONFIG.run.levels.find(candidate=>candidate.id===id);
 if(!level)throw new Error(`Unknown level: ${id}`);
 return level;
}

export function shouldOpenShopAfterLevel(level:LevelId):boolean {
 return GAME_CONFIG.run.shopsAfterLevels.some(candidate=>candidate===level);
}

export function upgradeIds():UpgradeId[]{
 return Object.keys(GAME_CONFIG.upgrades) as UpgradeId[];
}
