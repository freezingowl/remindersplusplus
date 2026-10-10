const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const withIosBuildPathQuotes = require("../plugins/withIosBuildPathQuotes.cjs");
const { quoteBundleScript } = withIosBuildPathQuotes;

const constantsRoot = path.dirname(require.resolve("expo-constants/package.json"));
const podspec = path.join(constantsRoot, "ios", "EXConstants.podspec");

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, command + " failed:\n" + result.stderr);
  return result.stdout;
}

test("RN script invocation is quoted and the path fix is idempotent", (t) => {
  const command = '`"$NODE_BINARY" --print "require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'"`';
  const original = "# Keep other script lines unchanged\n" + command + "\n";
  const expected = "# Keep other script lines unchanged\n" + '"' + command + '"' + "\n";
  assert.equal(quoteBundleScript(original), expected);
  assert.equal(quoteBundleScript(expected), expected);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "cue RN build path "));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, "Cue.app"));
  const env = {
    ...process.env,
    NODE_BINARY: process.execPath,
    SKIP_BUNDLING: "1",
    CONFIGURATION: "Debug",
    PLATFORM_NAME: "iphonesimulator",
    CONFIGURATION_BUILD_DIR: fixture,
    UNLOCALIZED_RESOURCES_FOLDER_PATH: "Cue.app",
  };
  run("/bin/bash", ["-c", quoteBundleScript(command)], env);
});

test("the Expo config plugin changes only the RN bundle phase", async () => {
  const script = "\u0060echo /scripts/react-native-xcode.sh\u0060\n";
  const bundlePhase = {
    isa: "PBXShellScriptBuildPhase",
    name: '"Bundle React Native code and images"',
    shellScript: JSON.stringify(script),
  };
  const otherPhase = {
    isa: "PBXShellScriptBuildPhase",
    name: '"Other phase"',
    shellScript: JSON.stringify(script),
  };
  const project = {
    hash: { project: { objects: { PBXShellScriptBuildPhase: {
      bundle: bundlePhase,
      bundle_comment: "Bundle phase",
      other: otherPhase,
    } } } },
  };
  const config = withIosBuildPathQuotes({ name: "Cue", slug: "cue" });
  await config.mods.ios.xcodeproj({ ...config, modResults: project, modRequest: {} });
  assert.equal(JSON.parse(bundlePhase.shellScript), quoteBundleScript(script));
  assert.equal(JSON.parse(otherPhase.shellScript), script);
});

for (const overrideRoot of [false, true]) {
  const label = overrideRoot ? "explicit" : "inferred";
  test("Constants generates app.config with spaces (" + label + " project root)", (t) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "cue constants path "));
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    const projectRoot = path.join(fixture, "app with spaces");
    const podsRoot = path.join(projectRoot, "ios", "Pods");
    const buildDir = path.join(fixture, "build products");
    fs.mkdirSync(podsRoot, { recursive: true });
    fs.mkdirSync(path.join(buildDir, "EXConstants.bundle"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "cue-path-test", version: "1.0.0" }));
    fs.writeFileSync(path.join(projectRoot, "app.json"), JSON.stringify({ expo: { name: "Cue path test", slug: "cue-path-test" } }));

    const env = {
      ...process.env,
      LANG: "en_US.UTF-8",
      PODS_ROOT: podsRoot,
      PROJECT_DIR: podsRoot,
      PODS_TARGET_SRCROOT: path.join(constantsRoot, "ios"),
      CONFIGURATION_BUILD_DIR: buildDir,
      BUNDLE_FORMAT: "shallow",
    };
    delete env.PROJECT_ROOT;
    if (overrideRoot) {
      env.PROJECT_ROOT = projectRoot;
      // The explicit root must win over the default derived from PROJECT_DIR.
      env.PROJECT_DIR = path.join(fixture, "unrelated project", "ios", "Pods");
      fs.mkdirSync(env.PROJECT_DIR, { recursive: true });
    }

    const spec = JSON.parse(run("pod", ["ipc", "spec", podspec], env));
    const phase = spec.script_phases;
    assert.match(phase.name, /Generate app.config/);
    run("/bin/bash", ["-c", phase.script], env);
    const config = JSON.parse(fs.readFileSync(path.join(buildDir, "EXConstants.bundle", "app.config"), "utf8"));
    assert.equal(config.name, "Cue path test");
    assert.equal(config.slug, "cue-path-test");
  });
}
