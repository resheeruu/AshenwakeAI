const http = require("http");

const port = Number(process.argv[2] || process.env.PORT || 10000);
const botPid = Number(process.argv[3] || 0);

function botAlive() {
  if (!botPid) return false;

  try {
    process.kill(botPid, 0);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/health/termux") {
    const alive = botAlive();

    res.statusCode = alive ? 200 : 503;
    res.setHeader("Content-Type", "application/json");

    res.end(JSON.stringify({
      status: alive ? "ok" : "unhealthy",
      service: "AshenAI",
      bot: alive ? "online" : "offline",
      timestamp: new Date().toISOString()
    }));

    return;
  }

  if (req.url === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("AshenAI is running\n");
    return;
  }

  res.statusCode = 404;
  res.end("Not found\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`💚 Health endpoint listening on 0.0.0.0:${port}`);
});
