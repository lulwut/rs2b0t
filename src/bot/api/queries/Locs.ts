import { reader } from '../../adapter/ClientAdapter.js';
import { Loc } from '../entities/index.js';
import EntityQuery from './Query.js';

/**
 * Scenery queries. Empty for about a tick after a level change — blank does not
 * mean absent.
 * @see docs/API.md#entities--queries
 * @see docs/NAV.md#level-change-loc-lag
 */
export const Locs = {
    /**
     * @param maxDistance only scan tiles within this many tiles (chebyshev) of
     * the player. The underlying scan is O(scene) and uncached, so a query that
     * only cares about nearby scenery should bound it — see `reader.locs`.
     */
    query(maxDistance?: number): EntityQuery<Loc> {
        return new EntityQuery(() => reader.locs(maxDistance).map(s => new Loc(s)));
    }
};

export { Loc };
