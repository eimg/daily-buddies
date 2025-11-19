import app from "./app";
import { env } from "./config/env";

const port = env.port;

app.listen(port, () => {
  console.log(`Daily Buddies API running on http://localhost:${port}`);
});
