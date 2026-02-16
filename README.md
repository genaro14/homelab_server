# Homelab Dashboard

A simple dashboard for monitoring Proxmox VMs/containers with calendar and weather widgets.

![Screenshot](img/Screenshot%20From%202026-02-16%2016-48-56.png)

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

- `PVE_HOST` - Proxmox host URL
- `PVE_TOKEN_ID` - Proxmox API token ID
- `PVE_TOKEN_SECRET` - Proxmox API token secret
- `PVE_NODE` - Proxmox node name
- `WEATHER_API_KEY` - OpenWeatherMap API key
## 
Populate env sample files with your credentials and run the app

+ `/src/pve.json` for PVE credentials
+ `/scr/domains.json` for domain list  

See samples for data example
+ Default User: 'root' and Password: 'purple123', change them in `/src/server.js`
## Docker

```bash
docker-compose up -d
```
