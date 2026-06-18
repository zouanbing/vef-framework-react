import type { UserMenu } from "../types";

import { hashKey, isPlainObject } from "@vef-framework-react/shared";

type Bag = Record<string, unknown>;

/**
 * Normalize a params / search bag: a non-object or empty object collapses to
 * `undefined`, so a menu that omits the dimension and a route that carries an
 * empty one (`{}`) produce the same hash.
 */
function normalizeBag(value: unknown): Bag | undefined {
  return isPlainObject(value) && Object.keys(value).length > 0 ? (value as Bag) : undefined;
}

/**
 * The active route exposed by the router match, projected to the dimensions a
 * menu can bind.
 */
export interface ActiveRoute {
  fullPath: string;
  params?: unknown;
  search?: unknown;
}

/**
 * Stable, unique identity for a menu entry: its route template plus the params
 * and search it binds via `meta`. Two menus on the same `/report/$key` template
 * that differ only by their `key` param get distinct identities, which is what
 * lets exactly one of them highlight, carry its own tab, and resolve its title.
 */
export function menuKeyOf(path: string, meta?: UserMenu["meta"]): string {
  const bag = isPlainObject(meta) ? meta : undefined;

  return `${path}|${hashKey(normalizeBag(bag?.params))}|${hashKey(normalizeBag(bag?.search))}`;
}

/**
 * Shallow value-equality of two normalized bags (route params are flat string
 * maps, so a shallow compare is sufficient and avoids ordering pitfalls).
 */
function bagsEqual(a: Bag | undefined, b: Bag | undefined): boolean {
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
function searchMatches(routeSearch: Bag | undefined, menuSearch: Bag | undefined): boolean {
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
export function resolveActiveMenuKey(menus: Iterable<Readonly<UserMenu>>, route: ActiveRoute): string | undefined {
  const routeParams = normalizeBag(route.params);
  const routeSearch = normalizeBag(route.search);

  let bestKey: string | undefined;
  let bestSpecificity = -1;

  for (const menu of menus) {
    if (menu.path !== route.fullPath) {
      continue;
    }

    const meta = isPlainObject(menu.meta) ? menu.meta : undefined;

    if (!bagsEqual(normalizeBag(meta?.params), routeParams)) {
      continue;
    }

    const menuSearch = normalizeBag(meta?.search);

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
