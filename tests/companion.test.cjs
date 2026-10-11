const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const xcode = require("xcode");
const { configureProject } = require("../plugins/withCueCompanion.cjs");

function fixture() {
  const project = xcode.project("fixture.pbxproj");
  project.hash = { project: { rootObject: "PROJECT", objects: {
    PBXProject: { PROJECT: { isa: "PBXProject", mainGroup: "ROOT", productRefGroup: "PRODUCTS", targets: [{ value: "APP", comment: "Cue" }] } },
    PBXNativeTarget: { APP: { isa: "PBXNativeTarget", name: "Cue", buildConfigurationList: "CONFIGS", buildPhases: [{ value: "SOURCES", comment: "Sources" }], dependencies: [] } },
    PBXGroup: { ROOT: { isa: "PBXGroup", children: [{ value: "PRODUCTS", comment: "Products" }] }, PRODUCTS: { isa: "PBXGroup", name: "Products", children: [] } },
    PBXSourcesBuildPhase: { SOURCES: { isa: "PBXSourcesBuildPhase", files: [] }, SOURCES_comment: "Sources" },
    PBXFileReference: {}, PBXBuildFile: {},
    XCConfigurationList: { CONFIGS: { isa: "XCConfigurationList", buildConfigurations: [{ value: "DEBUG" }, { value: "RELEASE" }] } },
    XCBuildConfiguration: {
      DEBUG: { isa: "XCBuildConfiguration", name: "Debug", buildSettings: { DEVELOPMENT_TEAM: "TESTTEAM", IPHONEOS_DEPLOYMENT_TARGET: "16.4", CURRENT_PROJECT_VERSION: "42", MARKETING_VERSION: "2.3.0" } },
      RELEASE: { isa: "XCBuildConfiguration", name: "Release", buildSettings: { DEVELOPMENT_TEAM: "TESTTEAM", IPHONEOS_DEPLOYMENT_TARGET: "16.4", CURRENT_PROJECT_VERSION: "42", MARKETING_VERSION: "2.3.0" } },
    },
  } } };
  return project;
}

test("native plugin survives repeated prebuilds and preserves app signing/version", () => {
  const project = fixture();
  configureProject(project, "com.example.cue");
  const first = project.writeSync();
  configureProject(project, "com.example.cue");
  assert.equal(project.writeSync(), first);
  const objects = project.hash.project.objects;
  const targets = Object.entries(objects.PBXNativeTarget).filter(([id]) => !id.endsWith("_comment"));
  assert.equal(targets.length, 2);
  assert.equal(objects.XCBuildConfiguration.DEBUG.buildSettings.DEVELOPMENT_TEAM, "TESTTEAM");
  assert.equal(objects.XCBuildConfiguration.DEBUG.buildSettings.IPHONEOS_DEPLOYMENT_TARGET, "17.0");
  const widget = targets.find(([, value]) => value.name === '"CueCompanion"');
  const configs = objects.XCConfigurationList[widget[1].buildConfigurationList].buildConfigurations;
  for (const { value } of configs) {
    const settings = objects.XCBuildConfiguration[value].buildSettings;
    assert.equal(settings.DEVELOPMENT_TEAM, "TESTTEAM");
    assert.equal(settings.CURRENT_PROJECT_VERSION, "42");
    assert.equal(settings.MARKETING_VERSION, "2.3.0");
    assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER, '"com.example.cue.companion"');
    assert.match(settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS, /CUE_WIDGET_EXTENSION/);
  }
  const sources = (target) => project.pbxSourcesBuildPhaseObj(target).files.map(({ value }) => objects.PBXBuildFile[value].fileRef_comment).sort();
  assert.deepEqual(sources("APP"), ["CueActivityAttributes.swift", "CueCalendarAnswer.swift", "CueCalendarService.swift", "CueCompanionBridge.m", "CueCompanionBridge.swift", "CueCompanionService.swift", "CueIntents.swift", "CueReminderModel.swift"]);
  assert.deepEqual(sources(widget[0]), ["CueActivityAttributes.swift", "CueCalendarAnswer.swift", "CueCalendarAnswerView.swift", "CueIntents.swift", "CueLiveActivity.swift", "CueReminderModel.swift"]);
  assert.equal(objects.PBXNativeTarget.APP.dependencies.length, 1);
  const embedding = project.pbxCopyfilesBuildPhaseObj("APP");
  assert.equal(embedding.dstSubfolderSpec, 13);
  assert.ok(embedding.files.some(({ value }) => objects.PBXBuildFile[value].fileRef === widget[1].productReference));
});

test("native selection prioritizes the newest due task and retains missed reminders", { timeout: 60_000 }, (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cue companion tests "));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const executable = path.join(temp, "selection-tests");
  const compile = spawnSync("xcrun", ["swiftc", "-module-cache-path", path.join(temp, "modules"), "native/companion/CueReminderModel.swift", "native/companion/CueCalendarAnswer.swift", "tests/swift/main.swift", "-o", executable], { encoding: "utf8", timeout: 50_000 });
  assert.ifError(compile.error);
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync(executable, [], { encoding: "utf8", timeout: 5_000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /17 selection scenarios passed/);
  assert.match(run.stdout, /12 Calendar and availability scenarios passed/);
  assert.match(run.stdout, /20 Calendar answer scenarios passed/);
  assert.match(run.stdout, /12 simple answer scenarios passed/);
});

test("native build embeds only validated Cue settings and clears obsolete values", () => {
  const { applyCloudConfiguration } = require("../plugins/withCueCompanion.cjs");
  const token = "demo-client-token-at-least-32-characters";
  const info = { CFBundleName: "Cue", CueCloudOrigin: "old", CueCloudAccessToken: "old" };
  applyCloudConfiguration(info, { EXPO_PUBLIC_CUE_WORKER_URL: "https://cue.example/", EXPO_PUBLIC_CUE_CLIENT_TOKEN: token, OPENAI_API_KEY: "never-embed-this" });
  assert.equal(info.CueCloudOrigin, "https://cue.example");
  assert.equal(info.CueCloudAccessToken, token);
  assert.equal(JSON.stringify(info).includes("never-embed-this"), false);
  assert.throws(() => applyCloudConfiguration({}, { EXPO_PUBLIC_CUE_WORKER_URL: "http://cue.example", EXPO_PUBLIC_CUE_CLIENT_TOKEN: token }));
  assert.throws(() => applyCloudConfiguration({}, { EXPO_PUBLIC_CUE_WORKER_URL: "https://cue.example", EXPO_PUBLIC_CUE_CLIENT_TOKEN: "sk-" + "x".repeat(40) }));
  assert.throws(() => applyCloudConfiguration({}, { EXPO_PUBLIC_CUE_WORKER_URL: "https://cue.example", EXPO_PUBLIC_CUE_CLIENT_TOKEN: "" }));
  applyCloudConfiguration(info, {});
  assert.deepEqual(info, { CFBundleName: "Cue" });
});
