import "./env";
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
  console.log(`MyClub API listening on http://localhost:${port}`);
});
