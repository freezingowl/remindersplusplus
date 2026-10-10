const fs = require("node:fs");
const path = require("node:path");
const xcode = require("xcode");
const plist = require("@expo/plist").default;
const { configureProject, copySources } = require("../plugins/withCueCompanion.cjs");

const root = path.dirname(require.resolve("../package.json"));
const config = require("../app.json").expo;
const ios = path.join(root, "ios");
const projectPath = path.join(ios, "Cue.xcodeproj/project.pbxproj");
if (!fs.existsSync(projectPath)) {
  throw new Error("Generate the iOS project with npx expo prebuild --platform ios first.");
}
const project = xcode.project(projectPath).parseSync();
configureProject(project, config.ios.bundleIdentifier, config.version);
fs.writeFileSync(projectPath, project.writeSync());
copySources(root, ios);
const infoPath = path.join(ios, "Cue/Info.plist");
const info = plist.parse(fs.readFileSync(infoPath, "utf8"));
info.NSSupportsLiveActivities = true;
fs.writeFileSync(infoPath, plist.build(info));
const propertiesPath = path.join(ios, "Podfile.properties.json");
const properties = JSON.parse(fs.readFileSync(propertiesPath, "utf8"));
properties["ios.deploymentTarget"] = "17.0";
fs.writeFileSync(propertiesPath, JSON.stringify(properties, null, 2) + "\n");
console.log("Synced the Cue companion extension. App signing settings preserved.");
