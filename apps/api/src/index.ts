import "./env";
import { serve } from "@hono/node-server";
import { ensureAdministrator } from "./adminSeed";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);

async function main() {
  await ensureAdministrator();
  serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
    console.log(`MyClub API listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
