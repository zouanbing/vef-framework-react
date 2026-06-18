import type { ParsedLocation, RouteLoaderFn, RouteOptions } from "@tanstack/react-router";
import type { DynamicIconName, MenuItem } from "@vef-framework-react/components";
import type { AnyObject, Awaitable, EmptyObject, Except } from "@vef-framework-react/shared";

import type { LayoutProps } from "../components";
import type { RouterContext, UserInfo, UserMenu } from "../types";

import { Outlet, redirect } from "@tanstack/react-router";
import { DynamicIcon, Loader } from "@vef-framework-react/components";

import { Error, Layout, NotFound } from "../components";
import { ACCESS_DENIED_ROUTE_PATH, LOGIN_ROUTE_PATH } from "../constants";
import { useAppStore } from "../stores";

type BaseLayoutBeforeLoadArgs = Parameters<NonNullable<RouteOptions<unknown, any, any>["beforeLoad"]>>[0];

export type LayoutBeforeLoadArgs
  = Except<BaseLayoutBeforeLoadArgs, "context"> & {
    context: RouterContext & BaseLayoutBeforeLoadArgs["context"];
  };

type BaseLayoutLoaderArgs = Parameters<RouteLoaderFn<unknown, any, any>>[0];

export type LayoutLoaderArgs<TBeforeLoadContext extends AnyObject = EmptyObject>
  = Except<BaseLayoutLoaderArgs, "context"> & {
    context: RouterContext & BaseLayoutLoaderArgs["context"] & TBeforeLoadContext;
  };

interface LayoutRouteOptions<
  TBeforeLoadContext extends AnyObject = EmptyObject,
  TLoaderData = void
> extends Except<LayoutProps, "children"> {
  fetchUserInfo: () => Awaitable<UserInfo>;
  beforeLoad?: (args: LayoutBeforeLoadArgs) => Awaitable<TBeforeLoadContext | void>;
  loader?: (args: LayoutLoaderArgs<TBeforeLoadContext>) => Awaitable<TLoaderData>;
}

function buildUserMenuMap(menus: UserMenu[], menuMap = new Map<string, Readonly<UserMenu>>()): Map<string, Readonly<UserMenu>> {
  for (const menu of menus) {
    if (menu.children) {
      buildUserMenuMap(menu.children, menuMap);
    }

    menuMap.set(menu.path, menu);
  }

  return menuMap;
}

function buildMenuPathMap(
  menus: UserMenu[],
  parentPath: string[] = [],
  menuPathMap = new Map<string, readonly string[]>()
): Map<string, readonly string[]> {
  for (const menu of menus) {
    const currentPath = [...parentPath, menu.path];
    menuPathMap.set(menu.path, currentPath);

    if (menu.children) {
      buildMenuPathMap(menu.children, currentPath, menuPathMap);
    }
  }

  return menuPathMap;
}

function buildMenuItem(menu: UserMenu): MenuItem {
  const {
    path,
    type,
    name,
    icon
  } = menu;

  const iconElement = icon ? <DynamicIcon name={icon as DynamicIconName} /> : undefined;

  if (type === "directory") {
    return {
      type: "submenu",
      key: path,
      label: name,
      icon: iconElement,
      children: menu.children ? buildMenuItems(menu.children) : []
    };
  }

  return {
    type: "item",
    key: path,
    label: name,
    icon: iconElement
  };
}

function buildMenuItems(menus: UserMenu[]): MenuItem[] {
  return menus
    .filter(menu => menu.type !== "view")
    .map(menu => Object.freeze(buildMenuItem(menu)));
}

/**
 * Resolve the menu key for the current location.
 *
 * Menus are keyed by their route template (`/report/$key`), but
 * `location.pathname` is the instantiated path (`/report/test123`). Matching
 * the location against the route tree yields the leaf route's `fullPath`
 * (the template), so a parameterized route resolves to the menu that owns it
 * instead of failing the access check against a path the menu can never hold.
 * Mirrors the `fullPath` lookup used for tab tracking in `createRouter`.
 */
function resolveMenuKey(context: RouterContext, location: ParsedLocation): string {
  const { router } = context;
  const match = router
    .matchRoutes(location.pathname, location.search, { preload: false, throwOnError: false })
    .at(-1)!;

  return match.fullPath as string;
}

export function createLayoutRouteOptions<
  TBeforeLoadContext extends AnyObject = EmptyObject,
  TLoaderData = void
>({
  fetchUserInfo,
  beforeLoad,
  loader,
  ...layoutProps
}: LayoutRouteOptions<TBeforeLoadContext, TLoaderData>) {
  function LayoutComponent() {
    return (
      <Layout {...layoutProps}>
        <Outlet />
      </Layout>
    );
  }

  return {
    beforeLoad: async (args: LayoutBeforeLoadArgs): Promise<TBeforeLoadContext> => {
      const { location, context } = args;
      const { isAuthenticated, userMenuMap } = useAppStore.getState();

      if (!isAuthenticated) {
        throw redirect({ to: LOGIN_ROUTE_PATH, search: { redirect: location.href } });
      }

      if (userMenuMap && !userMenuMap.has(resolveMenuKey(context, location))) {
        throw redirect({ to: ACCESS_DENIED_ROUTE_PATH, replace: true });
      }

      const beforeLoadContext = await beforeLoad?.(args);

      return beforeLoadContext ?? ({} as TBeforeLoadContext);
    },
    loader: async (args: LayoutLoaderArgs<TBeforeLoadContext>): Promise<TLoaderData | undefined> => {
      const { location, context } = args;
      const { permissionTokens, ...userInfo } = await fetchUserInfo();
      const { menus } = userInfo;

      const userMenuMap = Object.freeze(buildUserMenuMap(menus));
      const menuPathMap = Object.freeze(buildMenuPathMap(menus));
      const menuItems = Object.freeze(buildMenuItems(menus));

      useAppStore.setState({
        ...useAppStore.getState(),
        userInfo: Object.freeze(userInfo),
        userMenuMap,
        menuPathMap,
        menuItems,
        permissionTokens: Object.freeze(new Set(permissionTokens))
      });

      if (!userMenuMap.has(resolveMenuKey(context, location))) {
        throw redirect({ to: ACCESS_DENIED_ROUTE_PATH, replace: true });
      }

      if (loader) {
        return await loader(args);
      }

      return undefined;
    },
    pendingComponent: () => <Loader description="页面玩命加载中, 请稍后..." descriptionSize={18} size={48} />,
    errorComponent: Error,
    notFoundComponent: NotFound,
    component: LayoutComponent,
    staleTime: Infinity,
    shouldReload: false
  };
}
