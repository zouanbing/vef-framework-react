import type { MaybeUndefined } from "@vef-framework-react/shared";

import type { UserMenu, UserMenuMeta } from "../types";

import { hashKey } from "@vef-framework-react/shared";

type Bag = Record<string, string>;

/**
 * Drop an empty bag to `undefined` so a menu that omits a dimension and a route
 * that carries an empty one (`{}`) hash alike. Inputs are already typed objects
 * (a menu's `meta` params/search and the router match), so no shape guard is
 * needed — only the empty-vs-absent normalization.
 */
function normalize(bag: MaybeUndefined<Bag>): MaybeUndefined<Bag> {
  return bag && Object.keys(bag).length > 0 ? bag : undefined;
}

/**
 * The active route exposed by the router match, projected to the dimensions a
 * menu binds — both flat string maps, matching the `params` / `search` a menu
 * pins in `meta`.
 */
export interface ActiveRoute {
  fullPath: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}

/**
 * Stable, unique identity for a menu entry: its route template plus the params
 * and search it binds via `meta`. Two menus on the same `/report/$key` template
 * that differ only by their `key` param get distinct identities, which is what
 * lets exactly one of them highlight, carry its own tab, and resolve its title.
 */
export function menuKeyOf(path: string, meta?: UserMenuMeta): string {
  return `${path}|${hashKey(normalize(meta?.params))}|${hashKey(normalize(meta?.search))}`;
}

/**
 * Shallow value-equality of two normalized bags (params are flat string maps, so
 * a shallow compare is sufficient and avoids ordering pitfalls).
 */
function bagsEqual(a: MaybeUndefined<Bag>, b: MaybeUndefined<Bag>): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  const keys = Object.keys(a);

  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

/**
 * Whether every key the menu pins in its search is present and equal in the
 * route's search (subset match). A menu that pins no search matches any route
 * search, so a bare `/list` menu still highlights when the URL adds runtime
 * query like `?page=2`.
 */
function searchMatches(routeSearch: MaybeUndefined<Bag>, menuSearch: MaybeUndefined<Bag>): boolean {
  if (!menuSearch) {
    return true;
  }

  if (!routeSearch) {
    return false;
  }

  return Object.keys(menuSearch).every(key => routeSearch[key] === menuSearch[key]);
}

/**
 * Resolve which menu the active route should highlight. A candidate must share
 * the route template, bind exactly the route's params, and pin only search the
 * route also carries. When several qualify (e.g. a bare list and a pre-filtered
 * variant) the most search-specific one wins. Returns its {@link menuKeyOf}, or
 * `undefined` when no menu owns the route.
 */
export function resolveActiveMenuKey(menus: Iterable<Readonly<UserMenu>>, route: ActiveRoute): MaybeUndefined<string> {
  const routeParams = normalize(route.params);
  const routeSearch = normalize(route.search);

  let bestKey: string | undefined;
  let bestSpecificity = -1;

  for (const menu of menus) {
    if (menu.path !== route.fullPath) {
      continue;
    }

    if (!bagsEqual(normalize(menu.meta?.params), routeParams)) {
      continue;
    }

    const menuSearch = normalize(menu.meta?.search);

    if (!searchMatches(routeSearch, menuSearch)) {
      continue;
    }

    const specificity = menuSearch ? Object.keys(menuSearch).length : 0;

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      bestKey = menuKeyOf(menu.path, menu.meta);
    }
  }

  return bestKey;
}
