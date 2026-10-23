import { useSyncExternalStore } from 'react';

import { game, type GameSnapshot } from '@/engine';

/** 引擎快照。引擎每次 emit 都会换一个新的冻结对象，
 *  所以 useSyncExternalStore 的引用比较天然成立，不需要额外的版本号。 */
export function useGame(): GameSnapshot {
  return useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
}
