// src/server.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const https = require("https");
const http = require("http");

const app = express();
const PORT = 3008;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use(require("cors")());

const USER = "root";
const PASSWORD_HASH = crypto.createHash("sha256").update("purple123").digest("hex");

// Load Proxmox config
function loadPveConfig() {
  try {
    const filePath = path.join(__dirname, "pve.json");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error("Failed to load pve.json:", err.message);
    return null;
  }
}

function deriveKey(password) {
  return crypto.pbkdf2Sync(password, "salt123", 1000, 32, "sha256").toString("hex");
}

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false });

  const hash = crypto.createHash("sha256").update(password).digest("hex");

  if (username === USER && hash === PASSWORD_HASH) {
    const sessionKey = deriveKey(password);
    return res.json({ success: true, sessionKey });
  }

  return res.status(401).json({ success: false });
});

app.get("/domains", (req, res) => {
  try {
    const { sessionKey } = req.query;
    if (!sessionKey) return res.status(400).json({ success: false, message: "Missing sessionKey" });

    const filePath = path.join(__dirname, "domains.json");
    const domains = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(domains), sessionKey).toString();

    res.json({ data: encrypted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to load domains" });
  }
});

// Proxmox API proxy endpoint - uses fast cluster/resources endpoint (like homarr)
app.get("/api/pve/status", async (req, res) => {
  const { sessionKey } = req.query;
  if (!sessionKey) return res.status(401).json({ success: false, message: "Unauthorized" });

  const pveConfig = loadPveConfig();
  if (!pveConfig) {
    return res.status(500).json({ success: false, message: "Proxmox not configured" });
  }

  try {
    const { host, tokenId, tokenSecret, verifySsl } = pveConfig;
    
    // Single cluster/resources call for fast CPU/memory/disk stats
    const resources = await pveRequest(host, "/api2/json/cluster/resources", tokenId, tokenSecret, verifySsl);
    
    // Map resources by type (same approach as homarr)
    const clusterInfo = mapClusterResources(resources);
    
    // Fetch temperature data for online nodes (requires node status endpoint)
    await Promise.all(clusterInfo.nodes.map(async (node) => {
      if (node.isRunning) {
        try {
          const nodeStatus = await pveRequest(host, `/api2/json/nodes/${node.name}/status`, tokenId, tokenSecret, verifySsl);
          console.log(`Node ${node.name} thermalstate:`, nodeStatus.thermalstate);
          node.thermalstate = nodeStatus.thermalstate || null;
          node.cpuinfo = nodeStatus.cpuinfo || null;
        } catch (e) {
          console.error(`Thermal fetch error for ${node.name}:`, e.message);
        }
      }
    }));
    
    res.json({ success: true, data: clusterInfo });
  } catch (err) {
    console.error("Proxmox API error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch Proxmox status" });
  }
});

// Map cluster resources to structured data (ported from homarr)
function mapClusterResources(resources) {
  const mapped = {
    nodes: [],
    vms: [],
    containers: [],
    storages: [],
  };

  for (const r of resources) {
    switch (r.type) {
      case "node":
        mapped.nodes.push({
          id: r.id,
          name: r.node || "",
          status: r.status || "offline",
          isRunning: r.status === "online",
          cpu: {
            utilization: r.cpu || 0,      // 0-1 value
            cores: r.maxcpu || 0,
          },
          memory: {
            used: r.mem || 0,
            total: r.maxmem || 0,
          },
          storage: {
            used: r.disk || 0,
            total: r.maxdisk || 0,
          },
          uptime: r.uptime || 0,
        });
        break;

      case "qemu":
        mapped.vms.push({
          id: r.id,
          vmId: r.vmid || 0,
          name: r.name || "",
          node: r.node || "",
          status: r.status || "stopped",
          isRunning: r.status === "running",
          cpu: {
            utilization: r.cpu || 0,
            cores: r.maxcpu || 0,
          },
          memory: {
            used: r.mem || 0,
            total: r.maxmem || 0,
          },
          storage: {
            used: r.disk || 0,
            total: r.maxdisk || 0,
          },
          uptime: r.uptime || 0,
        });
        break;

      case "lxc":
        mapped.containers.push({
          id: r.id,
          vmId: r.vmid || 0,
          name: r.name || "",
          node: r.node || "",
          status: r.status || "stopped",
          isRunning: r.status === "running",
          cpu: {
            utilization: r.cpu || 0,
            cores: r.maxcpu || 0,
          },
          memory: {
            used: r.mem || 0,
            total: r.maxmem || 0,
          },
          storage: {
            used: r.disk || 0,
            total: r.maxdisk || 0,
          },
          uptime: r.uptime || 0,
        });
        break;

      case "storage":
        mapped.storages.push({
          id: r.id,
          name: r.storage || "",
          node: r.node || "",
          status: r.status || "offline",
          isRunning: r.status === "available",
          used: r.disk || 0,
          total: r.maxdisk || 0,
          isShared: r.shared === 1,
        });
        break;
    }
  }

  return mapped;
}

// Proxmox API request helper
function pveRequest(host, apiPath, tokenId, tokenSecret, verifySsl) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, host);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "GET",
      headers: {
        Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}`,
      },
      rejectUnauthorized: verifySsl !== false,
    };

    console.log(`PVE Request: ${url.hostname}${url.pathname}`);

    const req = client.request(options, (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) {
          console.error(`PVE Response ${response.statusCode}: ${data.substring(0, 200)}`);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data || parsed);
        } catch (e) {
          console.error("PVE JSON parse error:", data.substring(0, 200));
          reject(new Error("Invalid JSON response"));
        }
      });
    });

    req.on("error", (err) => {
      console.error("PVE Request error:", err.message);
      reject(err);
    });
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app;
