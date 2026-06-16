import { defineBuildConfig } from "../../scripts/build-config";
import packageJson from "./package.json";

const peerDependencies = (packageJson as { peerDependencies?: Record<string, string> }).peerDependencies ?? {};

export default defineBuildConfig({
  name: packageJson.name,
  version: packageJson.version,
  author: packageJson.author.name,
  useEmotion: false,
  entries: ["src/index.ts"],
  external: [
    ...Object.keys(packageJson.dependencies).map(dep => new RegExp(`^${dep}`)),
    ...Object.keys(peerDependencies).map(dep => new RegExp(`^${dep}`))
  ]
});
