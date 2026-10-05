import { withEntitlementsPlist, type ConfigPlugin } from "expo/config-plugins";
const withLocalSigning: ConfigPlugin<{ pushEnabled: boolean }> = (
  config,
  options,
) =>
  withEntitlementsPlist(config, (mod) => {
    if (!options.pushEnabled) delete mod.modResults["aps-environment"];
    return mod;
  });
export default withLocalSigning;
