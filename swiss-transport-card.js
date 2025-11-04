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
          // bus SVG from svgrepo (fill replaced with catColor)
          catHtml = `
            <svg width="28" height="28" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="${catColor}" d="M12 0C8.90625 0 6.644531 0.398438 5.09375 1.75C3.542969 3.101563 3 5.230469 3 8L3 12L2 12C0.90625 12 0 12.90625 0 14L0 22C0 23.09375 0.90625 24 2 24L3 24L3 41C3 42.222656 3.382813 43.25 4 44.03125L4 47C4 48.644531 5.355469 50 7 50L11 50C12.644531 50 14 48.644531 14 47L14 46L36 46L36 47C36 48.644531 37.355469 50 39 50L43 50C44.644531 50 46 48.644531 46 47L46 44.03125C46.617188 43.25 47 42.222656 47 41L47 24L48 24C49.09375 24 50 23.09375 50 22L50 14C50 12.90625 49.09375 12 48 12L47 12L47 9C47 6.355469 46.789063 4.191406 45.71875 2.53125C44.648438 0.871094 42.6875 0 40 0 Z M 12 2L40 2C42.3125 2 43.351563 2.542969 44.03125 3.59375C44.710938 4.644531 45 6.484375 45 9L45 41C45 42.386719 44.601563 42.933594 43.78125 43.375C42.960938 43.816406 41.585938 44 40 44L10 44C8.414063 44 7.039063 43.816406 6.21875 43.375C5.398438 42.933594 5 42.386719 5 41L5 8C5 5.484375 5.457031 4.109375 6.40625 3.28125C7.355469 2.453125 9.09375 2 12 2 Z M 15 3C13.90625 3 13 3.90625 13 5L13 7C13 8.09375 13.90625 9 15 9L36 9C37.09375 9 38 8.09375 38 7L38 5C38 3.90625 37.09375 3 36 3 Z M 15 5L36 5L36 7L15 7 Z M 11 10C9.832031 10 8.765625 10.296875 8.03125 11.03125C7.296875 11.765625 7 12.832031 7 14L7 26C7 27.167969 7.296875 28.234375 8.03125 28.96875C8.765625 29.703125 9.832031 30 11 30L39 29.9375C39.816406 29.9375 40.695313 29.625 41.5 29C42.304688 28.375 43 27.324219 43 26L43 14C43 12.832031 42.703125 11.765625 41.96875 11.03125C41.234375 10.296875 40.167969 10 39 10 Z M 11 12L39 12C39.832031 12 40.265625 12.203125 40.53125 12.46875C40.796875 12.734375 41 13.167969 41 14L41 26C41 26.675781 40.714844 27.070313 40.28125 27.40625C39.847656 27.742188 39.230469 27.9375 39 27.9375L11 28C10.167969 28 9.734375 27.796875 9.46875 27.53125C9.203125 27.265625 9 26.832031 9 26L9 14C9 13.167969 9.203125 12.734375 9.46875 12.46875C9.734375 12.203125 10.167969 12 11 12 Z M 2 14L3 14L3 22L2 22 Z M 47 14L48 14L48 22L47 22 Z M 11.5 33C9.027344 33 7 35.027344 7 37.5C7 39.972656 9.027344 42 11.5 42C13.972656 42 16 39.972656 16 37.5C16 35.027344 13.972656 33 11.5 33 Z M 38.5 33C36.027344 33 34 35.027344 34 37.5C34 39.972656 36.027344 42 38.5 42C40.972656 42 43 39.972656 43 37.5C43 35.027344 40.972656 33 38.5 33 Z M 11.5 35C12.890625 35 14 36.109375 14 37.5C14 38.890625 12.890625 40 11.5 40C10.109375 40 9 38.890625 9 37.5C9 36.109375 10.109375 35 11.5 35 Z M 38.5 35C39.890625 35 41 36.109375 41 37.5C41 38.890625 39.890625 40 38.5 40C37.109375 40 36 38.890625 36 37.5C36 36.109375 37.109375 35 38.5 35 Z M 6 45.4375C7.199219 45.890625 8.566406 46 10 46L12 46L12 47C12 47.5625 11.5625 48 11 48L7 48C6.4375 48 6 47.5625 6 47 Z M 44 45.4375L44 47C44 47.5625 43.5625 48 43 48L39 48C38.4375 48 38 47.5625 38 47L38 46L40 46C41.433594 46 42.800781 45.890625 44 45.4375Z"/>
            </svg>
          `;
        } else if (cat === 'T' || cat === 'TRAM') {
          // tram SVG from svgrepo (fill replaced with catColor)
          catHtml = `
            <svg width="28" height="28" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="${catColor}" d="M25 0C21.820313 0 19.257813 0.234375 17.375 0.78125C16.433594 1.054688 15.644531 1.394531 15.03125 1.90625C14.417969 2.417969 14 3.1875 14 4C13.996094 4.359375 14.183594 4.695313 14.496094 4.878906C14.808594 5.058594 15.191406 5.058594 15.503906 4.878906C15.816406 4.695313 16.003906 4.359375 16 4C16 3.8125 16.027344 3.707031 16.3125 3.46875C16.597656 3.230469 17.160156 2.945313 17.9375 2.71875C18.523438 2.546875 19.269531 2.394531 20.09375 2.28125L20.9375 7.21875C17.660156 7.578125 14.917969 8.367188 12.8125 9.40625C9.886719 10.847656 8 12.789063 8 15L8 38.28125C8 41.371094 10.191406 43.960938 13.125 44.75L8.9375 48.25C8.632813 48.46875 8.476563 48.839844 8.535156 49.207031C8.59375 49.578125 8.851563 49.882813 9.210938 50C9.566406 50.113281 9.957031 50.015625 10.21875 49.75L15.90625 45L34.09375 45L39.78125 49.75C40.042969 50.015625 40.433594 50.113281 40.789063 50C41.148438 49.882813 41.40625 49.578125 41.464844 49.207031C41.523438 48.839844 41.367188 48.46875 41.0625 48.25L36.875 44.75C39.808594 43.960938 42 41.371094 42 38.28125L42 15C42 12.789063 40.113281 10.847656 37.1875 9.40625C35.082031 8.367188 32.339844 7.578125 29.0625 7.21875L29.90625 2.28125C30.730469 2.394531 31.476563 2.546875 32.0625 2.71875C32.839844 2.945313 33.402344 3.230469 33.6875 3.46875C33.972656 3.707031 34 3.8125 34 4C33.996094 4.359375 34.183594 4.695313 34.496094 4.878906C34.808594 5.058594 35.191406 5.058594 35.503906 4.878906C35.816406 4.695313 36.003906 4.359375 36 4C36 3.1875 35.582031 2.417969 34.96875 1.90625C34.355469 1.394531 33.566406 1.054688 32.625 0.78125C30.742188 0.234375 28.179688 0 25 0 Z M 25 2C26.042969 2 26.988281 2.035156 27.875 2.09375L27.0625 7.03125C26.394531 6.996094 25.707031 7 25 7C24.292969 7 23.605469 6.996094 22.9375 7.03125L22.125 2.09375C23.011719 2.035156 23.957031 2 25 2 Z M 25 9C29.871094 9 33.738281 9.949219 36.3125 11.21875C38.886719 12.488281 40 14.058594 40 15L40 38.28125C40 40.867188 37.796875 43 35 43L15 43C12.203125 43 10 40.867188 10 38.28125L10 15C10 14.058594 11.113281 12.488281 13.6875 11.21875C16.261719 9.949219 20.128906 9 25 9 Z M 19 12C17.914063 12 17 12.914063 17 14L17 16L15 16C13.398438 16 12 17.242188 12 18.84375L12 27.15625C12 28.757813 13.398438 30 15 30L35 30C36.601563 30 38 28.757813 38 27.15625L38 18.84375C38 17.242188 36.601563 16 35 16L33 16L33 14C33 12.914063 32.085938 12 31 12 Z M 19 14L31 14L31 16L19 16 Z M 15 18L35 18C35.609375 18 36 18.421875 36 18.84375L36 27.15625C36 27.578125 35.609375 28 35 28L15 28C14.390625 28 14 27.578125 14 27.15625L14 18.84375C14 18.421875 14.390625 18 15 18 Z M 16 33.0625C13.832031 33.0625 12.0625 34.832031 12.0625 37C12.0625 39.167969 13.832031 40.9375 16 40.9375C18.167969 40.9375 19.9375 39.167969 19.9375 37C19.9375 34.832031 18.167969 33.0625 16 33.0625 Z M 34 33.0625C31.832031 33.0625 30.0625 34.832031 30.0625 37C30.0625 39.167969 31.832031 40.9375 34 40.9375C36.167969 40.9375 37.9375 39.167969 37.9375 37C37.9375 34.832031 36.167969 33.0625 34 33.0625 Z M 16 34.9375C17.144531 34.9375 18.0625 35.855469 18.0625 37C18.0625 38.144531 17.144531 39.0625 16 39.0625C14.855469 39.0625 13.9375 38.144531 13.9375 37C13.9375 35.855469 14.855469 34.9375 16 34.9375 Z M 34 34.9375C35.144531 34.9375 36.0625 35.855469 36.0625 37C36.0625 38.144531 35.144531 39.0625 34 39.0625C32.855469 39.0625 31.9375 38.144531 31.9375 37C31.9375 35.855469 32.855469 34.9375 34 34.9375Z"/>
            </svg>
          `;
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
