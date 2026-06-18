import type { MenuItem } from "@vef-framework-react/components";
import type { AuthTokens } from "@vef-framework-react/core";
import type { Except } from "@vef-framework-react/shared";

import type { AppCustomState, UserInfo, UserMenu } from "../types";

import { createPersistedStore } from "@vef-framework-react/core";

export interface AppState {
  isAuthenticated: boolean;
  authTokens?: Readonly<AuthTokens>;
  userInfo?: Readonly<Except<UserInfo, "permissionTokens">>;
  // Keyed by the composite menu key (`menuKeyOf`: path + bound params + search) so
  // menus sharing one `/report/$key` template but bound to different params stay
  // distinct entries.
  userMenuMap?: Readonly<Map<string, Readonly<UserMenu>>>;
  // Menu key -> its ancestor menu-key chain (for expanding parents / the active
  // section), also keyed by the composite menu key.
  menuPathMap?: Readonly<Map<string, readonly string[]>>;
  // Distinct route templates the user's menus cover. Drives the per-template route
  // access check (any `/report/<key>` is allowed when a `/report/$key` menu exists),
  // independent of the per-entry params.
  menuPathSet?: Readonly<Set<string>>;
  menuItems?: ReadonlyArray<Readonly<MenuItem>>;
  permissionTokens?: Readonly<Set<string>>;
  custom: AppCustomState;
}

export const useAppStore = createPersistedStore<AppState>(
  () => {
    return {
      isAuthenticated: false,
      custom: {}
    };
  },
  {
    name: "app",
    storage: "local",
    selector: ({
      isAuthenticated,
      custom,
      authTokens
    }) => {
      return {
        isAuthenticated,
        custom,
        authTokens
      };
    }
  }
);
