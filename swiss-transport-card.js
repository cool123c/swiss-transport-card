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
        line_colors: {},
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
        const rawName = d.name || '';
        const to = d.to || '';

        // determine a friendly line label: prefer explicit number, else pick a short token from name
        let lineLabel = d.number || '';
        if (!lineLabel && rawName) {
          // split name into tokens and prefer short tokens (route numbers) over long vehicle ids
          const tokens = rawName.toString().split(/\s+/).map((t) => t.replace(/[^A-Za-z0-9\-]/g, ''));
          for (const t of tokens) {
            if (!t) continue;
            // skip long purely-numeric tokens that look like vehicle IDs (e.g., 023532)
            if (/^\d+$/.test(t) && t.length > 3) continue;
            // accept tokens that are short numbers (<=3), or contain letters (e.g., S31, 31A)
            if (/^[0-9]{1,3}[A-Za-z\-]*$/.test(t) || /[A-Za-z]/.test(t)) {
              lineLabel = t;
              break;
            }
          }
          // as a last resort, try to extract a short digit sequence
          if (!lineLabel) {
            const m = rawName.toString().match(/([0-9]{1,3}[A-Za-z\-]*)/);
            lineLabel = m ? m[1] : '';
          }
        }
        if (!lineLabel) {
          // fallback to category+number or raw name
          lineLabel = (d.number ? `${d.number}` : (d.category ? `${d.category}` : rawName)).trim();
        }

        // category badge / icon mapping
        const cat = (d.category || '').toString().toUpperCase();
        const colorMap = { IC: '#1e90ff', IR: '#1e90ff', RE: '#1e90ff', S: '#4caf50', R: '#4caf50', B: '#ff9800', BUS: '#ff9800', TRAM: '#ff5722', T: '#9c27b0' };
        const overrideColor = this.config.line_colors && this.config.line_colors[lineLabel];
        const catColor = overrideColor || colorMap[cat] || '#607d8b';

        // render icon for bus/tram instead of plain color block
        let catHtml = '';
        if (cat === 'B' || cat === 'BUS') {
          // simple inline bus SVG
          catHtml = `<svg width="28" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2" y="4" width="20" height="12" rx="2" fill="${catColor}"/><circle cx="7" cy="18" r="1" fill="#000"/><circle cx="17" cy="18" r="1" fill="#000"/></svg>`;
        } else if (cat === 'T' || cat === 'TRAM') {
          catHtml = `<svg width="28" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2" fill="${catColor}"/><path d="M6 3v-2" stroke="#fff" stroke-width="1" fill="none"/><circle cx="8" cy="18" r="1" fill="#000"/><circle cx="16" cy="18" r="1" fill="#000"/></svg>`;
        } else {
          catHtml = `<div class="cat" style="background:${catColor}" title="${this._escapeHtml(cat)}"></div>`;
        }

        // time + delay handling: highlight delay in red if present
        const delay = typeof d.delay !== 'undefined' && d.delay !== null ? Number(d.delay) : null;
        let timeHtml = this._escapeHtml(rel || time);
        if (delay && delay > 0) {
          timeHtml += ` <span style="color:var(--label-badge-red,#ff3b30); font-weight:600;">+${delay}</span>`;
        }

        html += `<li class="departure">`;
        html += catHtml;
        html += `<div class="time">${timeHtml}</div>`;
        html += `<div class="info">`;
        if (this.config.show_line) html += `<div class="line">${this._escapeHtml(lineLabel)}</div>`;
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
