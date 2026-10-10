const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withInfoPlist, withPodfileProperties, withXcodeProject } = require("expo/config-plugins");

const folder = "CueCompanion";
const appFiles = ["CueReminderModel.swift", "CueActivityAttributes.swift", "CueCompanionService.swift", "CueCompanionBridge.swift", "CueCompanionBridge.m", "CueIntents.swift"];
const widgetFiles = ["CueActivityAttributes.swift", "CueIntents.swift", "CueLiveActivity.swift"];
const unquote = (value) => String(value ?? "").replace(/^"|"$/g, "");

function configurations(project, target) {
  const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
  return list.buildConfigurations.map(({ value }) => project.pbxXCBuildConfigurationSection()[value]);
}

function configureProject(project, bundleIdentifier, version) {
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};
  const app = project.getFirstTarget();
  const appConfigs = configurations(project, app.firstTarget);
  let widget = Object.entries(project.pbxNativeTargetSection()).find(([id, target]) => !id.endsWith("_comment") && unquote(target.name) === folder);
  if (!widget) {
    const added = project.addTarget(folder, "app_extension", folder, `${bundleIdentifier}.companion`);
    widget = [added.uuid, added.pbxNativeTarget];
    for (const [type, name] of [["PBXSourcesBuildPhase", "Sources"], ["PBXFrameworksBuildPhase", "Frameworks"], ["PBXResourcesBuildPhase", "Resources"]]) {
      project.addBuildPhase([], type, name, added.uuid);
    }
  }
  const [widgetID, widgetTarget] = widget;
  if (!app.firstTarget.dependencies.some(({ value }) => objects.PBXTargetDependency[value]?.target === widgetID)) {
    project.addTargetDependency(app.uuid, [widgetID]);
  }
  for (const config of appConfigs) config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "17.0";
  for (const config of configurations(project, widgetTarget)) {
    const appSettings = (appConfigs.find((item) => item.name === config.name) ?? appConfigs[0]).buildSettings;
    Object.assign(config.buildSettings, {
      APPLICATION_EXTENSION_API_ONLY: "YES",
      CODE_SIGN_STYLE: "Automatic",
      CURRENT_PROJECT_VERSION: appSettings.CURRENT_PROJECT_VERSION ?? "1",
      MARKETING_VERSION: version ? `"${version}"` : appSettings.MARKETING_VERSION ?? "1.0.0",
      DEVELOPMENT_TEAM: appSettings.DEVELOPMENT_TEAM ?? '""',
      IPHONEOS_DEPLOYMENT_TARGET: "17.0",
      INFOPLIST_FILE: `"${folder}/${folder}-Info.plist"`,
      PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}.companion"`,
      SDKROOT: "iphoneos",
      SWIFT_VERSION: "5.0",
      SWIFT_ACTIVE_COMPILATION_CONDITIONS: config.name === "Debug" ? '"$(inherited) DEBUG CUE_WIDGET_EXTENSION"' : '"$(inherited) CUE_WIDGET_EXTENSION"',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    });
  }

  let groupID = Object.entries(objects.PBXGroup).find(([id, group]) => !id.endsWith("_comment") && unquote(group.name) === folder)?.[0];
  if (!groupID) {
    groupID = project.addPbxGroup([], folder, folder).uuid;
    project.addToPbxGroup(groupID, project.getFirstProject().firstProject.mainGroup);
  }
  for (const name of new Set([...appFiles, ...widgetFiles])) {
    let file = Object.entries(objects.PBXFileReference).find(([id, ref]) => !id.endsWith("_comment") && unquote(ref.path) === name);
    if (!file) {
      const added = project.addFile(name, groupID);
      file = [added.fileRef, objects.PBXFileReference[added.fileRef]];
    }
    for (const targetID of [appFiles.includes(name) ? app.uuid : null, widgetFiles.includes(name) ? widgetID : null].filter(Boolean)) {
      const phase = project.pbxSourcesBuildPhaseObj(targetID);
      if (phase.files.some(({ value }) => objects.PBXBuildFile[value]?.fileRef === file[0])) continue;
      const buildID = project.generateUuid();
      objects.PBXBuildFile[buildID] = { isa: "PBXBuildFile", fileRef: file[0], fileRef_comment: name };
      objects.PBXBuildFile[`${buildID}_comment`] = `${name} in Sources`;
      phase.files.push({ value: buildID, comment: `${name} in Sources` });
    }
  }
  return project;
}

function copySources(projectRoot, iosRoot) {
  const destination = path.join(iosRoot, folder);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of new Set([...appFiles, ...widgetFiles, `${folder}-Info.plist`])) {
    fs.copyFileSync(path.join(projectRoot, "native", "companion", name), path.join(destination, name));
  }
}

function applyCloudConfiguration(info, env = process.env) {
  const origin = (env.EXPO_PUBLIC_CUE_WORKER_URL ?? "").trim().replace(/\/+$/, "");
  const token = (env.EXPO_PUBLIC_CUE_CLIENT_TOKEN ?? "").trim();
  delete info.CueCloudOrigin;
  delete info.CueCloudAccessToken;
  if (!origin && !token) return info;
  let validOrigin = false;
  try {
    const url = new URL(origin);
    validOrigin = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch { /* Report configuration without including either value. */ }
  if (!validOrigin || !/^[A-Za-z0-9_-]{32,256}$/.test(token) || /^sk[-_]/.test(token)) {
    throw new Error("Set a valid EXPO_PUBLIC_CUE_WORKER_URL and separate EXPO_PUBLIC_CUE_CLIENT_TOKEN before building Cue. Do not use an OpenAI key as the Cue token.");
  }
  info.CueCloudOrigin = origin;
  info.CueCloudAccessToken = token;
  return info;
}

function cloudEnvironment(projectRoot) {
  // Expo's parser supports quoted values and .env.local without printing values.
  const fileEnv = require("@expo/env").get(projectRoot, { silent: true, force: true }).env;
  return { ...fileEnv, ...process.env };
}

function withCueCompanion(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    applyCloudConfiguration(mod.modResults, cloudEnvironment(mod.modRequest.projectRoot));
    return mod;
  });
  config = withPodfileProperties(config, (mod) => {
    mod.modResults["ios.deploymentTarget"] = "17.0";
    return mod;
  });
  config = withXcodeProject(config, (mod) => {
    configureProject(mod.modResults, mod.ios.bundleIdentifier, mod.version);
    return mod;
  });
  return withDangerousMod(config, ["ios", async (mod) => {
    copySources(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot);
    return mod;
  }]);
}

module.exports = withCueCompanion;
module.exports.configureProject = configureProject;
module.exports.copySources = copySources;

module.exports.applyCloudConfiguration = applyCloudConfiguration;
module.exports.cloudEnvironment = cloudEnvironment;
