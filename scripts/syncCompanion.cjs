const fs = require("node:fs");
const path = require("node:path");
const xcode = require("xcode");
const plist = require("@expo/plist").default;
const { configureProject, copySources, applyCloudConfiguration, cloudEnvironment, calendarUsageDescription } = require("../plugins/withCueCompanion.cjs");

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
info.NSCalendarsFullAccessUsageDescription = calendarUsageDescription;
applyCloudConfiguration(info, cloudEnvironment(root));
const pushEnvironment = cloudEnvironment(root).CUE_APNS_ENVIRONMENT ?? "development";
if (!["development", "production"].includes(pushEnvironment)) throw new Error("CUE_APNS_ENVIRONMENT must be development or production.");
info.CueAPNsEnvironment = pushEnvironment;
fs.writeFileSync(infoPath, plist.build(info));
const entitlementPath = path.join(ios, "Cue/Cue.entitlements");
const entitlements = fs.existsSync(entitlementPath) ? plist.parse(fs.readFileSync(entitlementPath, "utf8")) : {};
entitlements["aps-environment"] = pushEnvironment;
fs.writeFileSync(entitlementPath, plist.build(entitlements));
const propertiesPath = path.join(ios, "Podfile.properties.json");
const properties = JSON.parse(fs.readFileSync(propertiesPath, "utf8"));
properties["ios.deploymentTarget"] = "17.0";
fs.writeFileSync(propertiesPath, JSON.stringify(properties, null, 2) + "\n");
console.log("Synced the Cue companion extension and native cloud configuration. App signing settings preserved.");
