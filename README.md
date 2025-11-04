# Swiss Transport Card

Lovelace custom card to show upcoming departures from the `swiss_transport` Home Assistant integration.

Features
- Shows relative time (e.g., "in 5 min") or absolute time
- Shows platform, line and destination
- Configurable number of departures

Usage
1. Install this repo in HACS as a "Frontend" repository or copy `swiss-transport-card.js` to your Home Assistant `www` folder.
2. Add the resource to Home Assistant (type: JavaScript Module):
   - HACS path: `/hacsfiles/swiss-transport-card/swiss-transport-card.js` (HACS will show exact path)
   - Manual path: `/local/swiss-transport-card.js` if you copied the file to `/config/www`.
3. Add the card to a dashboard (Manual card):

```yaml
type: 'custom:swiss-transport-card'
entity: sensor.your_swiss_transport_sensor
count: 6
title: 'Next departures'
show_platform: true
show_destination: true
show_line: true
show_relative: true
```

The card expects the sensor to expose an attribute `departures` which is an array of objects with fields like `stop` (ISO datetime), `platform`, `name`, `to`, `category`, `number`.
