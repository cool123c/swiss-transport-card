class SwissTransportCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error('You must define an entity in the card configuration');
    }

    // defaults
    this.config = Object.assign(
      {
        count: 6,
        title: 'Next departures',
        show_platform: true,
        show_destination: true,
        show_line: true,
        show_relative: true,
      },
      config
    );
  }

  set hass(hass) {
    this._hass = hass;
    // throttle rendering with rAF
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    window.requestAnimationFrame(() => {
      this._renderScheduled = false;
      this._render();
    });
  }

  _formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d)) return isoString;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  _formatRelative(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d)) return isoString;
    const now = new Date();
    const diff = Math.round((d - now) / 60000); // minutes
    if (diff <= 0) return 'now';
    if (diff < 60) return `in ${diff} min`;
    // fallback to absolute time
    return this._formatTime(isoString);
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _render() {
    if (!this._hass) return;
    const entityId = this.config.entity;
    const stateObj = this._hass.states[entityId];

    if (!stateObj) {
      this.innerHTML = `<ha-card><div class="card-content">Entity <b>${this._escapeHtml(entityId)}</b> not found</div></ha-card>`;
      return;
    }

    const attrs = stateObj.attributes || {};
    const station = attrs.station || stateObj.attributes.friendly_name || this.config.title;
    const departures = Array.isArray(attrs.departures) ? attrs.departures : [];
    const count = Math.max(0, Math.min((this.config.count || 6), departures.length || 0));

    let html = `
      <ha-card>
        <div class="card-header">
          <div class="title">${this._escapeHtml(this.config.title)}</div>
          <div class="station">${this._escapeHtml(station)}</div>
        </div>
        <div class="card-content">
    `;

    if (!departures.length) {
      html += `<div class="empty">No upcoming departures</div>`;
    } else {
      html += '<ul class="departures">';
      departures.slice(0, this.config.count).forEach((d) => {
        const timeIso = d.stop || d.when || d.time || null;
        const time = this._formatTime(timeIso);
        const rel = this.config.show_relative ? this._formatRelative(timeIso) : '';
        const platform = d.platform ? String(d.platform) : '';
        const line = d.name || `${d.category || ''} ${d.number || ''}`.trim();
        const to = d.to || '';

        // category badge color mapping
        const cat = (d.category || '').toString().toUpperCase();
        const colorMap = { IC: '#1e90ff', IR: '#1e90ff', RE: '#1e90ff', S: '#4caf50', R: '#4caf50', BUS: '#ff9800', TRAM: '#ff5722', T: '#9c27b0' };
        const catColor = colorMap[cat] || '#607d8b';

        html += `<li class="departure">`;
        html += `<div class="cat" style="background:${catColor}" title="${this._escapeHtml(cat)}"></div>`;
        html += `<div class="time">${this._escapeHtml(rel || time)}</div>`;
        html += `<div class="info">`;
        if (this.config.show_line) html += `<div class="line">${this._escapeHtml(line)}</div>`;
        if (this.config.show_destination) html += `<div class="to">→ ${this._escapeHtml(to)}</div>`;
        html += `</div>`;
        if (this.config.show_platform && platform) html += `<div class="platform">P ${this._escapeHtml(platform)}</div>`;
        html += `</li>`;
      });
      html += '</ul>';
    }

    html += `
        </div>
      </ha-card>
    `;

    const style = `
      <style>
        ha-card { display:block; }
        .card-header { padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.06); }
        .title { font-weight:600; font-size:14px; }
        .station { font-size:12px; color: var(--secondary-text-color); }
        .card-content { padding: 8px 0 12px 0; }
        .departures { list-style:none; padding:0; margin:0; }
        .departure { display:flex; align-items:center; gap:12px; padding:8px 16px; border-bottom:1px solid rgba(0,0,0,0.04); }
        .time { width:90px; font-weight:600; color: var(--primary-color); }
        .info { flex:1; display:flex; flex-direction:column; }
        .line { font-weight:600; }
        .to { color: var(--secondary-text-color); font-size:13px; }
        .platform { margin-left:8px; color: var(--secondary-text-color); font-size:13px; min-width:44px; text-align:right; }
        .empty { padding:16px; color: var(--secondary-text-color); }
      </style>
    `;

    this.innerHTML = style + html;
  }

  getCardSize() {
    return 3;
  }
}

customElements.define('swiss-transport-card', SwissTransportCard);

if (window && window.customCards) {
  window.customCards.push({
    type: 'swiss-transport-card',
    name: 'Swiss Transport departures',
    description: 'Display next departures from a Swiss station (uses swiss_transport sensor)',
    preview: false,
  });
}
