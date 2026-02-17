# Homelab Dashboard

A simple dashboard for monitoring Proxmox VMs/containers with calendar and weather widgets.

![Screenshot](img/Screenshot%20From%202026-02-16%2016-48-56.png)

## Setup

```bash
npm install
npm run dev
```

## Configuration

Copy the sample config files and edit with your credentials:

```bash
cp config/config.sample.json config/config.json
cp config/domains.sample.json config/domains.json
```

### config/config.json

| Field | Description |
|-------|-------------|
| `user` | Login username |
| `password` | Login password |
| `pve.host` | Proxmox host URL |
| `pve.tokenId` | Proxmox API token ID |
| `pve.tokenSecret` | Proxmox API token secret |
| `pve.node` | Proxmox node name |
| `pve.verifySsl` | Verify SSL certificate |
| `hass.host` | Home Assistant URL |
| `hass.entityId` | Power meter entity ID |
| `hass.token` | Home Assistant long-lived access token |

### config/domains.json

Array of domain links to display on the dashboard:

```json
[
  {"name": "Example", "url": "https://example.com", "icon": "https://example.com/favicon.png"}
]
```

## Docker

```bash
docker-compose up -d
```
