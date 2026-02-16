/**
 * Homepage Application
 * Handles authentication, domain management, and dashboard widgets
 */

(function () {
  "use strict";

  // =========================================================================
  // Configuration
  // =========================================================================
  const CONFIG = {
    sessionCookieName: "sessionKey",
    sessionDurationHours: 1,
    weather: {
      city: "Buenos Aires",
      lat: -34.6037,
      lon: -58.3816,
    },
  };

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const elements = {
    // Auth
    authSection: document.getElementById("authSection"),
    loginForm: document.getElementById("loginForm"),
    usernameInput: document.getElementById("username"),
    passwordInput: document.getElementById("password"),
    loginError: document.getElementById("loginError"),

    // Dashboard
    dashboardSection: document.getElementById("dashboardSection"),
    logoutBtn: document.getElementById("logoutBtn"),
    domainNav: document.getElementById("domainNav"),

    // Calendar
    calTitle: document.getElementById("calTitle"),
    calDays: document.getElementById("calDays"),
    calPrev: document.getElementById("calPrev"),
    calNext: document.getElementById("calNext"),

    // Weather
    weatherTemp: document.getElementById("weatherTemp"),
    weatherDesc: document.getElementById("weatherDesc"),

    // Proxmox
    pveStatus: document.getElementById("pveStatus"),
    pveRefresh: document.getElementById("pveRefresh"),
  };

  // =========================================================================
  // Cookie Utilities
  // =========================================================================
  const CookieUtil = {
    set(name, value, hours) {
      const expires = new Date(Date.now() + hours * 60 * 60 * 1000);
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/`;
    },

    get(name) {
      const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
      return match ? decodeURIComponent(match[2]) : null;
    },

    delete(name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    },
  };

  // =========================================================================
  // API Service
  // =========================================================================
  const ApiService = {
    async login(username, password) {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      return res.ok && data.success ? data.sessionKey : null;
    },

    async fetchDomains(sessionKey) {
      const res = await fetch(`/domains?sessionKey=${encodeURIComponent(sessionKey)}`);
      const result = await res.json();
      if (!res.ok || !result.data) throw new Error("Invalid session");
      return JSON.parse(CryptoJS.AES.decrypt(result.data, sessionKey).toString(CryptoJS.enc.Utf8));
    },

    async fetchWeather(lat, lon) {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
      );
      return res.json();
    },

    async fetchPveStatus(sessionKey) {
      const res = await fetch(`/api/pve/status?sessionKey=${encodeURIComponent(sessionKey)}`);
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch");
      return result.data;
    },
  };

  // =========================================================================
  // UI Controller
  // =========================================================================
  const UIController = {
    showDashboard() {
      elements.authSection.classList.add("hidden");
      elements.dashboardSection.classList.remove("hidden");
    },

    showAuth() {
      elements.dashboardSection.classList.add("hidden");
      elements.authSection.classList.remove("hidden");
    },

    showError(message) {
      elements.loginError.textContent = message;
      elements.loginError.classList.remove("hidden");
    },

    clearError() {
      elements.loginError.textContent = "";
      elements.loginError.classList.add("hidden");
    },

    renderDomains(domains) {
      elements.domainNav.innerHTML = "";
      domains.forEach((domain) => {
        const btn = document.createElement("button");
        btn.className = "domain-btn";

        // Create favicon with fallback
        const iconContainer = this.createDomainIcon(domain);
        
        const label = document.createElement("span");
        label.textContent = domain.name;

        btn.appendChild(iconContainer);
        btn.appendChild(label);
        btn.addEventListener("click", () => window.open(domain.url, "_blank"));
        elements.domainNav.appendChild(btn);
      });
    },

    createDomainIcon(domain) {
      try {
        const url = new URL(domain.url);
        // Use custom icon if provided, otherwise try default favicon.ico
        const faviconUrl = domain.icon || `${url.origin}/favicon.ico`;

        const img = document.createElement("img");
        img.className = "domain-btn__icon";
        img.src = faviconUrl;
        img.alt = "";
        img.loading = "lazy";

        img.onerror = () => {
          const fallback = this.createFallbackIcon(domain.name);
          img.replaceWith(fallback);
        };

        return img;
      } catch {
        return this.createFallbackIcon(domain.name);
      }
    },

    createFallbackIcon(name) {
      const fallback = document.createElement("span");
      fallback.className = "domain-btn__icon--fallback";
      fallback.textContent = name.charAt(0).toUpperCase();
      return fallback;
    },

    renderDomainsError() {
      elements.domainNav.innerHTML = '<p class="error-message">Failed to load domains</p>';
    },
  };

  // =========================================================================
  // Calendar Widget
  // =========================================================================
  const CalendarWidget = {
    currentDate: new Date(),

    init() {
      elements.calPrev.addEventListener("click", () => this.navigate(-1));
      elements.calNext.addEventListener("click", () => this.navigate(1));
      this.render();
    },

    navigate(direction) {
      this.currentDate.setMonth(this.currentDate.getMonth() + direction);
      this.render();
    },

    render() {
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();
      const today = new Date();

      elements.calTitle.textContent = this.currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });

      const firstDayOfWeek = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();

      const days = [];

      // Previous month trailing days
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        days.push({ day: daysInPrevMonth - i, isOther: true });
      }

      // Current month days
      for (let day = 1; day <= daysInMonth; day++) {
        const isToday =
          day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        days.push({ day, isToday });
      }

      // Next month leading days
      const remaining = (7 - (days.length % 7)) % 7;
      for (let i = 1; i <= remaining; i++) {
        days.push({ day: i, isOther: true });
      }

      elements.calDays.innerHTML = days
        .map((d) => {
          const classes = [];
          if (d.isToday) classes.push("calendar__day--today");
          if (d.isOther) classes.push("calendar__day--other");
          return `<span class="${classes.join(" ")}">${d.day}</span>`;
        })
        .join("");
    },
  };

  // =========================================================================
  // Weather Widget
  // =========================================================================
  const WeatherWidget = {
    weatherCodes: {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Foggy",
      48: "Rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      71: "Slight snow",
      73: "Moderate snow",
      75: "Heavy snow",
      80: "Slight showers",
      81: "Moderate showers",
      82: "Heavy showers",
      95: "Thunderstorm",
      96: "Thunderstorm + hail",
      99: "Severe thunderstorm",
    },

    async init() {
      try {
        const data = await ApiService.fetchWeather(CONFIG.weather.lat, CONFIG.weather.lon);
        const temp = Math.round(data.current.temperature_2m);
        const desc = this.weatherCodes[data.current.weather_code] || "Unknown";

        elements.weatherTemp.textContent = `${temp}°C`;
        elements.weatherDesc.textContent = desc;
      } catch (err) {
        console.error("Weather fetch error:", err);
        elements.weatherTemp.textContent = "--°C";
        elements.weatherDesc.textContent = "Unable to load";
      }
    },
  };

  // =========================================================================
  // Proxmox Widget
  // =========================================================================
  const ProxmoxWidget = {
    sessionKey: null,
    refreshInterval: null,
    REFRESH_INTERVAL_MS: 5000, // 5 seconds (same as homarr)

    init(sessionKey) {
      this.sessionKey = sessionKey;
      elements.pveRefresh.addEventListener("click", () => this.refresh());
      this.refresh();
      this.startAutoRefresh();
    },

    startAutoRefresh() {
      if (this.refreshInterval) clearInterval(this.refreshInterval);
      this.refreshInterval = setInterval(() => this.refresh(), this.REFRESH_INTERVAL_MS);
    },

    stopAutoRefresh() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    },

    async refresh() {
      // Don't show loading state on auto-refresh to avoid flicker
      if (!this.refreshInterval) {
        elements.pveStatus.innerHTML = '<p class="pve-status__loading">Loading...</p>';
      }

      try {
        const data = await ApiService.fetchPveStatus(this.sessionKey);
        this.render(data);
      } catch (err) {
        console.error("Proxmox fetch error:", err);
        elements.pveStatus.innerHTML = '<p class="pve-status__error">Failed to load Proxmox status</p>';
      }
    },

    render(data) {
      // New cluster/resources data structure (like homarr)
      const { nodes = [], vms = [], containers = [], storages = [] } = data;
      
      // Render all nodes
      const nodesHtml = nodes.map((node) => {
        const cpuPercent = (node.cpu.utilization * 100).toFixed(1);
        const memUsed = this.formatBytes(node.memory.used);
        const memTotal = this.formatBytes(node.memory.total);
        const memPercent = node.memory.total > 0 
          ? ((node.memory.used / node.memory.total) * 100).toFixed(1) : 0;
        const diskUsed = this.formatBytes(node.storage.used);
        const diskTotal = this.formatBytes(node.storage.total);
        const diskPercent = node.storage.total > 0 
          ? ((node.storage.used / node.storage.total) * 100).toFixed(1) : 0;
        const uptime = this.formatUptime(node.uptime);
        const statusClass = node.isRunning ? "pve-node__status--online" : "pve-node__status--offline";

        // Temperature from thermalstate
        const thermal = node.thermalstate || {};
        const pkgTemp = thermal["Package.id.0"] || null;
        const coreTemps = Object.entries(thermal)
          .filter(([k]) => k.startsWith("Core"))
          .map(([, v]) => parseInt(v))
          .filter((v) => !isNaN(v));
        const avgTemp = coreTemps.length > 0 
          ? Math.round(coreTemps.reduce((a, b) => a + b, 0) / coreTemps.length) 
          : null;

        return `
          <article class="pve-node">
            <header class="pve-node__header">
              <span class="pve-node__name">Node: ${this.escapeHtml(node.name)}</span>
              <span class="pve-node__status ${statusClass}">${node.isRunning ? "Online" : "Offline"}</span>
            </header>
            
            <div class="pve-gauges">
              ${this.renderGauge("CPU", cpuPercent, `${node.cpu.cores} cores`)}
              ${this.renderGauge("RAM", memPercent, `${memUsed} / ${memTotal}`)}
              ${this.renderGauge("Disk", diskPercent, `${diskUsed} / ${diskTotal}`)}
              ${this.renderTempGauge(pkgTemp, avgTemp)}
            </div>

            <div class="pve-info">
              <div class="pve-info__item">
                <span class="pve-info__label">Uptime</span>
                <span class="pve-info__value">${uptime}</span>
              </div>
            </div>
          </article>
        `;
      }).join("");

      const html = `
        <div class="pve-grid">
          ${nodesHtml || '<p class="pve-status__empty">No nodes found</p>'}
        </div>
        ${this.renderVmListNew("Virtual Machines", vms)}
        ${this.renderVmListNew("Containers", containers)}
        ${this.renderStorageList(storages)}
      `;

      elements.pveStatus.innerHTML = html;
    },

    renderVmListNew(title, items) {
      if (!items || items.length === 0) return "";

      const itemsHtml = items
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((item) => {
          const indicatorClass = item.isRunning ? "pve-vm__indicator--running" : "pve-vm__indicator--stopped";
          const cpuPercent = (item.cpu.utilization * 100).toFixed(1);
          const memUsage = item.memory.total 
            ? this.formatBytes(item.memory.used) + " / " + this.formatBytes(item.memory.total) 
            : "";

          return `
            <div class="pve-vm">
              <span class="pve-vm__name">
                <span class="pve-vm__indicator ${indicatorClass}"></span>
                ${this.escapeHtml(item.name || `ID: ${item.vmId}`)}
              </span>
              <span class="pve-vm__cpu">${item.isRunning ? cpuPercent + "%" : ""}</span>
              <span class="pve-vm__resources">${memUsage}</span>
            </div>
          `;
        })
        .join("");

      return `
        <div class="pve-vms">
          <h3 class="pve-vms__title">${title}</h3>
          <div class="pve-vm-list">${itemsHtml}</div>
        </div>
      `;
    },

    renderStorageList(storages) {
      if (!storages || storages.length === 0) return "";

      const itemsHtml = storages
        .filter((s) => s.isRunning)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((storage) => {
          const usedPercent = storage.total > 0 
            ? ((storage.used / storage.total) * 100).toFixed(1) 
            : 0;
          const usedStr = this.formatBytes(storage.used);
          const totalStr = this.formatBytes(storage.total);

          return `
            <div class="pve-storage">
              <span class="pve-storage__name">${this.escapeHtml(storage.name)}</span>
              <span class="pve-storage__usage">${usedStr} / ${totalStr} (${usedPercent}%)</span>
            </div>
          `;
        })
        .join("");

      return `
        <div class="pve-storages">
          <h3 class="pve-vms__title">Storage</h3>
          <div class="pve-storage-list">${itemsHtml}</div>
        </div>
      `;
    },

    renderGauge(label, percent, detail = null) {
      const value = parseFloat(percent) || 0;
      let colorClass = "";
      if (value > 80) colorClass = "pve-gauge--danger";
      else if (value > 60) colorClass = "pve-gauge--warning";

      return `
        <div class="pve-gauge ${colorClass}">
          <div class="pve-gauge__circle" style="--percent: ${value}">
            <span class="pve-gauge__value">${value.toFixed(0)}%</span>
          </div>
          <span class="pve-gauge__label">${label}</span>
          ${detail ? `<span class="pve-gauge__detail">${detail}</span>` : ""}
        </div>
      `;
    },

    renderTempGauge(pkgTemp, avgTemp) {
      const temp = pkgTemp ? parseInt(pkgTemp) : (avgTemp || 0);
      let colorClass = "";
      if (temp > 80) colorClass = "pve-gauge--danger";
      else if (temp > 60) colorClass = "pve-gauge--warning";

      const percent = Math.min(temp, 100);

      return `
        <div class="pve-gauge pve-gauge--temp ${colorClass}">
          <div class="pve-gauge__circle" style="--percent: ${percent}">
            <span class="pve-gauge__value">${temp}°</span>
          </div>
          <span class="pve-gauge__label">Temp</span>
          ${avgTemp ? `<span class="pve-gauge__detail">Avg: ${avgTemp}°C</span>` : ""}
        </div>
      `;
    },

    formatUptime(seconds) {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      
      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (mins > 0) parts.push(`${mins}m`);
      return parts.join(" ") || "0m";
    },

    formatBytes(bytes) {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    },

    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },
  };

  // =========================================================================
  // Auth Controller
  // =========================================================================
  const AuthController = {
    async handleLogin(e) {
      e.preventDefault();
      UIController.clearError();

      const username = elements.usernameInput.value.trim();
      const password = elements.passwordInput.value.trim();

      if (!username || !password) {
        UIController.showError("Enter username and password");
        return;
      }

      try {
        const sessionKey = await ApiService.login(username, password);
        if (sessionKey) {
          CookieUtil.set(CONFIG.sessionCookieName, sessionKey, CONFIG.sessionDurationHours);
          await this.initDashboard(sessionKey);
        } else {
          UIController.showError("Invalid credentials");
        }
      } catch (err) {
        console.error("Login error:", err);
        UIController.showError("Login failed. Please try again.");
      }
    },

    handleLogout() {
      CookieUtil.delete(CONFIG.sessionCookieName);
      location.reload();
    },

    async initDashboard(sessionKey, isAutoLogin = false) {
      UIController.showDashboard();
      CalendarWidget.init();
      WeatherWidget.init();
      ProxmoxWidget.init(sessionKey);

      try {
        const domains = await ApiService.fetchDomains(sessionKey);
        UIController.renderDomains(domains);
      } catch (err) {
        console.error("Domains error:", err);
        if (isAutoLogin) {
          CookieUtil.delete(CONFIG.sessionCookieName);
          location.reload();
          return;
        }
        UIController.renderDomainsError();
      }
    },

    async checkExistingSession() {
      const sessionKey = CookieUtil.get(CONFIG.sessionCookieName);
      if (sessionKey) {
        await this.initDashboard(sessionKey, true);
        return true;
      }
      return false;
    },
  };

  // =========================================================================
  // Initialize Application
  // =========================================================================
  async function init() {
    // Setup event listeners
    elements.loginForm.addEventListener("submit", (e) => AuthController.handleLogin(e));
    elements.logoutBtn.addEventListener("click", () => AuthController.handleLogout());

    // Check for existing session
    await AuthController.checkExistingSession();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
