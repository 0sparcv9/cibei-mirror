import { serialize, tag } from "serialize-xml";
import * as fs from "node:fs";
import { parse } from "@std/xml";

const getConfig = () => {
  try {
    return parse(
      fs.readFileSync("./config.xml", {
        encoding: "utf-8",
      }),
    );
  } catch {
    fs.writeFileSync(
      "./config.xml",
      serialize(tag("server", [], [
        ["mimic", "https://maven.fabricmc.net"],
        ["tunnelRegisterEndpoint", "/registerTunnel"],
      ])),
    );

    return getConfig();
  }
};

export default getConfig();
