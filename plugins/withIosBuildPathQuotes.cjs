const { withXcodeProject } = require("expo/config-plugins");

function quoteBundleScript(script) {
  return script
    .split("\n")
    .map((line) => {
      const command = line.trim();
      // Quote only the standalone command substitution that resolves the RN script.
      if (
        command.startsWith("`") &&
        command.endsWith("`") &&
        command.includes("/scripts/react-native-xcode.sh")
      ) {
        return line.replace(command, '"' + command + '"');
      }
      return line;
    })
    .join("\n");
}

function withIosBuildPathQuotes(config) {
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    for (const phase of Object.values(phases || {})) {
      if (
        phase.isa === "PBXShellScriptBuildPhase" &&
        phase.name === '"Bundle React Native code and images"'
      ) {
        const script = JSON.parse(phase.shellScript);
        phase.shellScript = JSON.stringify(quoteBundleScript(script));
      }
    }
    return mod;
  });
}

module.exports = withIosBuildPathQuotes;
module.exports.quoteBundleScript = quoteBundleScript;
