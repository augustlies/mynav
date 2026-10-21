/**
 * Module: C6 domed knowledge star map.
 *
 * The renderer is deliberately dependency-free. It uses a radial force graph
 * with category hubs and catalogue planets, and it owns every animation frame
 * so the loop can be stopped immediately when the archive view returns.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavStarMap = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HUB_CHARS = ["☉", "☿", "♀", "♂", "♃", "♄"];
  const EDGE_STYLE = {
    hub: "hub",
    tag: "resonance",
    constellation: "constellation"
  };

  let canvas = null;
  let ctx = null;
  let container = null;
  let host = null;
  let animationId = null;
  let running = false;
  let openRequested = false;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let builtAt = 0;
  let selectedId = "";
  let hoveredId = "";
  let activeWindow = "all";
  let activeCategoryFilter = "all";
  let drag = null;
  let previewSite = null;
  let pointerInside = false;
  let bound = false;
  let resizeObserver = null;
  let lastFrame = 0;
  let lastDrawAt = 0;
  let needsRender = false;
  let labelBoxes = [];
  let graph = { hubs: [], planets: [], edges: [], byId: new Map() };

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function nowMs() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getSites() {
    return window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : (window.NavOverrides && typeof window.NavOverrides.getSites === "function"
        ? window.NavOverrides.getSites()
        : (window.NAV_DATA && Array.isArray(window.NAV_DATA.sites) ? window.NAV_DATA.sites : []));
  }

  function getCategories() {
    return window.NavApp && typeof window.NavApp.getCategories === "function"
      ? window.NavApp.getCategories()
      : (window.NAV_DATA && Array.isArray(window.NAV_DATA.categories) ? window.NAV_DATA.categories : []);
  }

  function getLedger() {
    return window.NavLedger && typeof window.NavLedger.getAll === "function"
      ? window.NavLedger.getAll()
      : {};
  }

  function getCallNumber(siteId) {
    const sites = getSites();
    const index = sites.findIndex(function (site) { return site.id === siteId; });
    return index >= 0 ? pad(index + 1) : "";
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return url || "";
    }
  }

  function getCategoryName(categoryId) {
    const category = getCategories().find(function (item) { return item.id === categoryId; });
    return category ? category.name : (categoryId || "ARCHIVE");
  }

  function getShortCategoryName(category) {
    if (!category) return "ARCHIVE";
    if (category.shortName) return category.shortName;
    return String(category.name || category.code || category.id)
      .replace(/\s*[·|｜/—-]\s*.*$/, "")
      .trim();
  }

  function getThemeColors() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      document.documentElement.getAttribute("data-sanctum") === "shadow";
    return dark
      ? {
        background: "#0A0E17",
        backgroundAlt: "#0D1420",
        grid: "rgba(201, 220, 241, 0.075)",
        gridStrong: "rgba(201, 220, 241, 0.14)",
        hub: "#C8A97E",
        hubSoft: "rgba(200, 169, 126, 0.16)",
        planet: "#E8DFC9",
        planetSoft: "rgba(232, 223, 201, 0.14)",
        text: "#EDE9DF",
        muted: "#9AA6B8",
        line: "rgba(200, 169, 126, 0.28)",
        resonance: "rgba(219, 165, 93, 0.56)",
        constellation: "rgba(166, 64, 48, 0.62)",
        selected: "#F5D59A",
        halo: "rgba(244, 224, 184, 0.13)"
      }
      : {
        background: "#F3EFE6",
        backgroundAlt: "#EEE9DD",
        grid: "rgba(84, 77, 59, 0.075)",
        gridStrong: "rgba(84, 77, 59, 0.16)",
        hub: "#8C5A32",
        hubSoft: "rgba(140, 90, 50, 0.12)",
        planet: "#514B3E",
        planetSoft: "rgba(81, 75, 62, 0.10)",
        text: "#2F302A",
        muted: "#777467",
        line: "rgba(140, 90, 50, 0.25)",
        resonance: "rgba(166, 64, 48, 0.42)",
        constellation: "rgba(140, 90, 50, 0.44)",
        selected: "#A64030",
        halo: "rgba(140, 90, 50, 0.10)"
      };
  }

  function getSiteHeat(siteId) {
    const ledger = getLedger();
    const entry = ledger.accessLog && ledger.accessLog[siteId];
    if (!entry) return 0;
    const recent = Array.isArray(entry.history)
      ? entry.history.reduce(function (sum, item) { return sum + (Number(item.count) || 0); }, 0)
      : 0;
    return Math.max(Number(entry.count) || 0, recent);
  }

  function getPlanetRadius(siteId) {
    const heat = getSiteHeat(siteId);
    // A stable logarithmic map keeps a heavily visited archive readable
    // without letting one power user turn into a giant node.
    return 5 + clamp(Math.log2(heat + 1) * 1.35, 0, 6);
  }

  function normalizeTag(tag) {
    return String(tag || "").trim().toLowerCase().replace(/^#/, "");
  }

  function getConstellationPresets() {
    if (window.NavConstellations && typeof window.NavConstellations.getConstellations === "function") {
      return window.NavConstellations.getConstellations();
    }
    return [];
  }

  function buildGraph() {
    const categoryList = getCategories();
    const sites = getSites();
    const ledger = getLedger();
    const at = nowMs();
    const hubs = categoryList.map(function (category, index) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, categoryList.length);
      return {
        id: "hub:" + category.id,
        kind: "hub",
        categoryId: category.id,
        title: category.name,
        subtitle: category.code || "SECTION",
        angle: angle,
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        radius: 30,
        heat: 0,
        siteIds: [],
        phase: index * 0.7,
        bornAt: at
      };
    });
    const hubById = new Map(hubs.map(function (hub) { return [hub.categoryId, hub]; }));
    const seen = new Set();
    const planetSites = sites.filter(function (site) {
      if (!site || seen.has(site.id)) return false;
      seen.add(site.id);
      return true;
    });
    const inShadow = window.NavSanctum && typeof window.NavSanctum.isShadow === "function" &&
      window.NavSanctum.isShadow();
    const shadowSites = inShadow && window.NavApp && typeof window.NavApp.getShadowSites === "function"
      ? window.NavApp.getShadowSites()
      : [];
    const allPlanetSites = planetSites.concat(shadowSites.filter(function (site) {
      return site && !seen.has(site.id);
    }));

    const planets = allPlanetSites.map(function (site, index) {
      const categoryHub = hubById.get(site.category) || hubs[0];
      const catIndex = categoryHub ? categoryHub.siteIds.length : 0;
      const radius = getPlanetRadius(site.id);
      if (categoryHub) categoryHub.siteIds.push(site.id);
      return {
        id: site.id,
        kind: "planet",
        site: site,
        categoryId: site.category,
        hubId: categoryHub ? categoryHub.id : "",
        title: site.name || site.title || site.id,
        callNumber: getCallNumber(site.id),
        description: site.description || site.desc || "",
        tags: Array.isArray(site.tags) ? site.tags.slice() : [],
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        vx: 0,
        vy: 0,
        radius: radius,
        heat: getSiteHeat(site.id),
        angle: 0,
        orbit: 0,
        orbitIndex: catIndex,
        siblingCount: 1,
        phase: index * 0.63,
        bornAt: at + index * 12,
        dimmed: false,
        filteredOut: false,
        shadow: site.visibility === "shadow"
      };
    });

    // Shared tags become faint resonance chains. A shared preset also
    // receives a constellation edge so the visual language matches C3.
    const edges = [];
    const edgeKeys = new Set();
    const byCategory = new Map();
    planets.forEach(function (planet) {
      if (!byCategory.has(planet.categoryId)) byCategory.set(planet.categoryId, []);
      byCategory.get(planet.categoryId).push(planet);
    });
    planets.forEach(function (planet) {
      if (planet.hubId) {
        edges.push({
          id: planet.hubId + ">" + planet.id,
          kind: EDGE_STYLE.hub,
          from: planet.hubId,
          to: planet.id,
          strength: 1
        });
      }
    });

    const tagOwners = new Map();
    planets.forEach(function (planet) {
      planet.tags.forEach(function (tag) {
        const key = normalizeTag(tag);
        if (!key || key.length < 2) return;
        if (!tagOwners.has(key)) tagOwners.set(key, []);
        tagOwners.get(key).push(planet);
      });
    });
    tagOwners.forEach(function (owners) {
      for (let i = 0; i < owners.length; i += 1) {
        for (let j = i + 1; j < owners.length; j += 1) {
          const a = owners[i];
          const b = owners[j];
          if (!a || !b || a.categoryId === b.categoryId) continue;
          const key = [a.id, b.id].sort().join("|");
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);
          edges.push({
            id: key,
            kind: EDGE_STYLE.tag,
            from: a.id,
            to: b.id,
            strength: 0.32
          });
        }
      }
    });

    const planetMap = new Map(planets.map(function (planet) { return [planet.id, planet]; }));
    getConstellationPresets().forEach(function (preset) {
      const ids = (Array.isArray(preset.itemIds) ? preset.itemIds : []).filter(function (id) {
        return planetMap.has(id);
      });
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const key = [ids[i], ids[j]].sort().join("|");
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);
          edges.push({
            id: key,
            kind: EDGE_STYLE.constellation,
            from: ids[i],
            to: ids[j],
            strength: 0.2
          });
        }
      }
    });

    const byId = new Map();
    hubs.forEach(function (hub) { byId.set(hub.id, hub); });
    planets.forEach(function (planet) { byId.set(planet.id, planet); });
    const adjacency = new Map();
    byId.forEach(function (node) { adjacency.set(node.id, new Set()); });
    edges.forEach(function (edge) {
      if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
        adjacency.get(edge.from).add(edge.to);
        adjacency.get(edge.to).add(edge.from);
      }
    });
    return {
      hubs: hubs,
      planets: planets,
      edges: edges,
      byId: byId,
      adjacency: adjacency,
      planetMap: planetMap,
      siteCount: planets.length,
      resonanceCount: edges.filter(function (edge) {
        return edge.kind === EDGE_STYLE.tag;
      }).length,
      totalEdges: edges.length,
      ledgerCount: Object.keys(ledger.accessLog || {}).length
    };
  }

  function layoutTargets() {
    if (!canvas) return;
    const width = cssWidth;
    const height = cssHeight;
    const compact = width < 520;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const hubReachX = width * (compact ? 0.32 : 0.24);
    const hubReachY = height * (compact ? 0.34 : 0.215);
    const hubRadius = compact ? 23 : 30;
    const previewInset = width >= 900 ? width * 0.055 : 0;
    graph.hubs.forEach(function (hub, index) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, graph.hubs.length);
      hub.angle = angle;
      hub.radius = hubRadius;
      hub.targetX = cx + Math.cos(angle) * hubReachX - previewInset;
      hub.targetY = cy + Math.sin(angle) * hubReachY;
      hub.x = hub.targetX;
      hub.y = hub.targetY;
    });
    graph.planets.forEach(function (planet) {
      planet.siblingCount = 0;
    });
    graph.hubs.forEach(function (hub) {
      graph.planets.forEach(function (planet) {
        if (planet.hubId === hub.id) planet.siblingCount += 1;
      });
    });
    graph.hubs.forEach(function (hub) {
      const siblings = graph.planets.filter(function (planet) {
        return planet.hubId === hub.id;
      });
      const spread = compact ? 1.2 : 1.05;
      const step = siblings.length > 1 ? spread / (siblings.length - 1) : 0;
      siblings.forEach(function (planet, siblingIndex) {
        planet.angle = hub.angle + (siblingIndex - (siblings.length - 1) / 2) * step;
      });
    });
    graph.planets.forEach(function (planet) {
      const hub = graph.byId.get(planet.hubId);
      const baseX = hub ? hub.targetX : cx - previewInset;
      const baseY = hub ? hub.targetY : cy;
      const maxOrbit = compact
        ? Math.min(cssWidth * 0.2, cssHeight * 0.11)
        : Math.min(cssWidth * 0.12, cssHeight * 0.24);
      const tier = planet.orbitIndex % 3;
      const orbit = maxOrbit * (0.76 + tier * 0.1);
      const angle = planet.angle;
      planet.targetX = baseX + Math.cos(angle) * orbit;
      planet.targetY = baseY + Math.sin(angle) * orbit;
      planet.x = planet.targetX;
      planet.y = planet.targetY;
    });
  }

  function setCanvasSize() {
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    cssWidth = Math.max(320, Math.round(rect.width || container.clientWidth || 720));
    // The canvas must not feed its own height back into the ResizeObserver.
    // A fixed optical field keeps the dome composition stable at every width.
    cssHeight = window.innerWidth <= 640 ? 540 : (window.innerWidth <= 900 ? 500 : 640);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    layoutTargets();
    needsRender = true;
  }

  function drawGrid(colors) {
    ctx.save();
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.6;
    const grid = 48;
    for (let x = 0; x <= cssWidth; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= cssHeight; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }
    const cx = cssWidth * 0.5;
    const cy = cssHeight * 0.5;
    const radius = Math.min(cssWidth, cssHeight) * 0.39;
    ctx.strokeStyle = colors.gridStrong;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = colors.line;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.9, cy);
    ctx.lineTo(cx + radius * 0.9, cy);
    ctx.moveTo(cx, cy - radius * 0.9);
    ctx.lineTo(cx, cy + radius * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  function drawEdge(edge, colors, emphasis) {
    const from = graph.byId.get(edge.from);
    const to = graph.byId.get(edge.to);
    if (!from || !to) return;
    let alpha = emphasis ? 0.92 : 0.55;
    if (activeWindow !== "all") alpha *= 0.64;
    const isResonance = edge.kind === EDGE_STYLE.tag;
    const isConstellation = edge.kind === EDGE_STYLE.constellation;
    ctx.save();
    ctx.strokeStyle = isResonance
      ? colors.resonance
      : (isConstellation ? colors.constellation : colors.line);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = isResonance || isConstellation ? 0.75 : 0.85;
    if (isResonance || isConstellation) ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawHub(hub, colors, timestamp) {
    const selected = selectedId === hub.id;
    const hovered = hoveredId === hub.id;
    const alpha = getNodeAlpha(hub);
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.0016 + hub.phase);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (selected || hovered) {
      ctx.fillStyle = colors.halo;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 48 + pulse * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = selected ? colors.selected : colors.hub;
    ctx.lineWidth = selected ? 1.7 : 1.1;
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, 29, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.7;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors.backgroundAlt;
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.hub;
    ctx.font = "600 14px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(HUB_CHARS[Math.max(0, graph.hubs.indexOf(hub)) % HUB_CHARS.length], hub.x, hub.y + 1);
    ctx.font = (cssWidth < 520 ? "600 8.5px" : "600 11px") + " 'Songti SC', Georgia, serif";
    ctx.fillStyle = colors.text;
    ctx.textBaseline = "top";
    ctx.fillText(cssWidth < 520 ? getShortCategoryName(getCategories().find(function (category) {
      return category.id === hub.categoryId;
    })) : hub.title, hub.x, hub.y + 38);
    ctx.font = (cssWidth < 520 ? "7px" : "8px") + " ui-monospace, Consolas, monospace";
    ctx.fillStyle = colors.muted;
    ctx.fillText(hub.subtitle + " · " + hub.siteIds.length, hub.x, hub.y + 54);
    ctx.restore();
  }

  function drawPlanet(planet, colors, timestamp) {
    const selected = selectedId === planet.id;
    const hovered = hoveredId === planet.id;
    const alpha = getNodeAlpha(planet);
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.0023 + planet.phase);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (selected || hovered) {
      ctx.fillStyle = colors.halo;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius + 8 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = planet.shadow ? colors.resonance : colors.planet;
    ctx.globalAlpha = alpha * (selected ? 1 : 0.9);
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
    ctx.fill();
    if (planet.heat > 0) {
      ctx.strokeStyle = colors.selected;
      ctx.globalAlpha = alpha * 0.75;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius + 2.5 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    // On narrow screens the full constellation is already dense enough;
    // labels for spotlighted nodes keep the local context without turning
    // the canvas into an unreadable block of type.
    if (selected || hovered) {
      ctx.globalAlpha = alpha;
      ctx.font = "9px ui-monospace, Consolas, monospace";
      ctx.fillStyle = colors.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = "№ " + planet.callNumber + " " + planet.title;
      const maxChars = Math.max(8, Math.round((cssWidth > 700 ? 16 : (cssWidth >= 520 ? 12 : 9)) - planet.radius / 4));
      const clipped = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
      const labelX = planet.x + planet.radius + 6;
      const labelWidth = ctx.measureText(clipped).width;
      const labelBox = {
        left: labelX - 1,
        right: labelX + labelWidth + 1,
        top: planet.y - 6,
        bottom: planet.y + 6
      };
      const overlaps = labelBoxes.some(function (box) {
        return labelBox.left < box.right && labelBox.right > box.left &&
          labelBox.top < box.bottom && labelBox.bottom > box.top;
      });
      // Spotlighted labels always win; background labels only render when
      // they do not collide with another label.
      if ((selected || hovered) || !overlaps) {
        ctx.fillText(clipped, labelX, planet.y);
        labelBoxes.push(labelBox);
      }
    }
    ctx.restore();
  }

  function draw(timestamp) {
    if (!ctx || !canvas) return;
    const colors = getThemeColors();
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawGrid(colors);
    labelBoxes = [];
    const emphasized = new Set();
    const spotlight = hoveredId || selectedId;
    if (spotlight) {
      emphasized.add(spotlight);
      const neighbors = graph.adjacency && graph.adjacency.get(spotlight);
      if (neighbors) neighbors.forEach(function (id) { emphasized.add(id); });
    }
    graph.edges.forEach(function (edge) {
      drawEdge(edge, colors, spotlight && (emphasized.has(edge.from) && emphasized.has(edge.to)));
    });
    graph.hubs.forEach(function (hub) { drawHub(hub, colors, timestamp); });
    graph.planets.forEach(function (planet) { drawPlanet(planet, colors, timestamp); });
    if (!graph.planets.length) {
      ctx.fillStyle = colors.muted;
      ctx.font = "12px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("尚未编目可入轨的星体", cssWidth / 2, cssHeight / 2);
    }
    drawCornerReadout(colors);
  }

  function drawCornerReadout(colors) {
    ctx.save();
    ctx.font = "8px ui-monospace, Consolas, monospace";
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "right";
    ctx.fillText("CELESTIAL MECHANICS · DAMPING 0.85", cssWidth - 18, cssHeight - 16);
    ctx.restore();
  }

  function getNodeAlpha(node) {
    if (!node) return 1;
    if (!hoveredId && !selectedId) return node.dimmed && activeWindow !== "all" ? 0.25 : 1;
    const spotlight = hoveredId || selectedId;
    if (!spotlight) return 1;
    if (node.id === spotlight) return 1;
    const neighbors = graph.adjacency && graph.adjacency.get(spotlight);
    if (neighbors && neighbors.has(node.id)) return 0.78;
    return 0.18;
  }

  function step(timestamp) {
    if (!running) return;
    const previous = lastFrame || timestamp;
    const delta = Math.min(32, Math.max(8, timestamp - previous));
    lastFrame = timestamp;
    const damping = 0.85;
    const centerX = cssWidth * 0.5;
    const centerY = cssHeight * 0.5;
    const nodes = graph.hubs.concat(graph.planets);
    nodes.forEach(function (node) {
      if (drag && drag.node && drag.node.id === node.id) return;
      const spring = node.kind === "hub" ? 0.022 : 0.012;
      const ax = (node.targetX - node.x) * spring;
      const ay = (node.targetY - node.y) * spring;
      node.vx = (node.vx + ax * delta / 16.67) * damping;
      node.vy = (node.vy + ay * delta / 16.67) * damping;
      node.x += node.vx * delta / 16.67;
      node.y += node.vy * delta / 16.67;
      if (node.kind === "hub") {
        node.x += (centerX - (cssWidth >= 900 ? cssWidth * 0.0455 : 0) - node.x) * 0.0004;
        node.y += (centerY - node.y) * 0.0004;
      }
    });
    if (drag && drag.node) {
      drag.node.x = drag.x;
      drag.node.y = drag.y;
      drag.node.vx = 0;
      drag.node.vy = 0;
    }
    // The pale moon, hub halos and labels stay alive, but a settled graph
    // should not repaint every display frame. Hover/drag explicitly set
    // needsRender and still get an immediate redraw.
    // The throttle must compare against the last actual draw, never against
    // the previous animation tick: comparing with the tick made the interval
    // always ~16ms, so a frame captured mid-settle stayed frozen forever.
    if (needsRender || timestamp - lastDrawAt >= 34) {
      lastDrawAt = timestamp;
      draw(timestamp);
    }
    needsRender = false;
    animationId = requestAnimationFrame(step);
  }

  function start() {
    if (running || !canvas) return false;
    running = true;
    openRequested = true;
    lastFrame = 0;
    lastDrawAt = 0;
    animationId = requestAnimationFrame(step);
    return true;
  }

  function stop() {
    running = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    return true;
  }

  function getTimeDimmedState(planet) {
    if (activeWindow === "all") return false;
    const ledger = getLedger();
    const now = Date.now();
    if (activeWindow === "old") {
      const entry = ledger.accessLog && ledger.accessLog[planet.id];
      const last = entry && Number.isFinite(entry.lastVisited) ? entry.lastVisited : 0;
      return Boolean(last && Math.floor((now - last) / 86400000) <= 60);
    }
    const almanac = ledger.almanac || {};
    const windowDays = activeWindow === "7d" ? 7 : 30;
    let active = false;
    Object.keys(almanac).forEach(function (day) {
      const entry = almanac[day];
      const age = Math.floor((now - new Date(day + "T12:00:00").getTime()) / 86400000);
      if (age >= 0 && age < windowDays &&
        Array.isArray(entry.sites) && entry.sites.indexOf(planet.id) !== -1) {
        active = true;
      }
    });
    return !active;
  }

  // Time-window and category filters are independent inputs. Keeping them
  // separate prevents a dormant star-map from losing the selected window
  // when the directory is rebuilt, and lets "归位重置" preserve both.
  function syncDimmedState() {
    graph.planets.forEach(function (planet) {
      planet.timeDimmed = getTimeDimmedState(planet);
      planet.dimmed = Boolean(planet.filteredOut || planet.timeDimmed);
    });
  }

  function applyTimeWindow(windowId) {
    activeWindow = windowId || "all";
    syncDimmedState();
    needsRender = true;
    // The directory and star-map share one time window. State must stay live
    // even while the canvas is closed, but drawing belongs exclusively to the
    // RAF lifecycle owned by the active star-map view.
    if (running) draw(nowMs());
  }

  function renderPreview() {
    const preview = host && host.querySelector("[data-star-preview]");
    if (!preview) return;
    if (!previewSite) {
      preview.innerHTML = '<div class="star-preview-empty"><span aria-hidden="true">✦</span><p>悬停星体以展开藏书票；单击锁定，双击直接调阅。</p></div>';
      preview.classList.remove("is-populated");
      return;
    }
    preview.classList.add("is-populated");
    const tags = (previewSite.tags || []).slice(0, 4).map(function (tag) {
      return "<span>#" + escapeHtml(tag) + "</span>";
    }).join("");
    const iconAttributes = window.NavSchema && typeof window.NavSchema.iconAttributes === "function"
      ? window.NavSchema.iconAttributes(previewSite)
      : "";
    const iconHtml = iconAttributes
      ? '<img class="archive-icon-img" ' + iconAttributes + ' alt="" width="24" height="24">'
      : "";
    preview.innerHTML = [
      '<div class="star-preview-kicker">EX LIBRIS · ORBITAL CARD</div>',
      '<span class="star-preview-call">№ ', escapeHtml(getCallNumber(previewSite.id)), '</span>',
      '<div class="star-preview-title-row">',
      '<span class="archive-icon-box star-preview-icon" aria-hidden="true">', iconHtml, '</span>',
      '<h3>', escapeHtml(previewSite.name || previewSite.title), '</h3>',
      '</div>',
      '<p class="star-preview-domain">', escapeHtml(getDomain(previewSite.url)), '</p>',
      '<p class="star-preview-desc">', escapeHtml(previewSite.description || previewSite.desc || "暂无馆藏简介"), '</p>',
      '<div class="star-preview-tags">', tags, '</div>',
      '<button type="button" class="star-preview-visit" data-star-visit="', escapeHtml(previewSite.id), '">立即调阅 ↗</button>'
    ].join("");
    if (window.NavSchema && typeof window.NavSchema.bindIconFallbacks === "function") {
      window.NavSchema.bindIconFallbacks(preview);
    }
  }

  function selectNode(nodeId, options) {
    const node = graph.byId.get(nodeId) || graph.byId.get("hub:" + nodeId);
    if (!node) return false;
    selectedId = node.id;
    if (node.kind === "planet") previewSite = node.site;
    else {
      const firstPlanet = graph.planets.find(function (planet) {
        return planet.categoryId === node.categoryId;
      });
      previewSite = firstPlanet ? firstPlanet.site : null;
    }
    renderPreview();
    const preview = host && host.querySelector("[data-star-preview]");
    if (preview) preview.classList.add("is-populated");
    needsRender = true;
    draw(nowMs());
    return {
      node: node,
      site: previewSite
    };
  }

  function clearSelection() {
    selectedId = "";
    hoveredId = "";
    previewSite = null;
    renderPreview();
    needsRender = true;
    draw(nowMs());
  }

  function setFilter(categoryId) {
    activeCategoryFilter = categoryId || "all";
    graph.planets.forEach(function (planet) {
      planet.filteredOut = activeCategoryFilter !== "all" && planet.categoryId !== activeCategoryFilter;
    });
    syncDimmedState();
    document.querySelectorAll("[data-star-filter]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-star-filter") === activeCategoryFilter);
    });
    needsRender = true;
    draw(nowMs());
  }

  function getDimmedNodeCount() {
    return graph.planets.filter(function (planet) {
      return planet.dimmed;
    }).length;
  }

  function getStats() {
    const publicPlanetCount = graph.planets.filter(function (planet) {
      return !planet.shadow;
    }).length;
    const shadowPlanetCount = graph.planets.filter(function (planet) {
      return planet.shadow;
    }).length;
    return {
      hubCount: graph.hubs.length,
      hubs: graph.hubs.length,
      categoryCount: graph.hubs.length,
      categories: graph.hubs.length,
      planetCount: graph.planets.length,
      planets: graph.planets.length,
      cardCount: graph.planets.length,
      cards: graph.planets.length,
      publicPlanetCount: publicPlanetCount,
      shadowPlanetCount: shadowPlanetCount,
      resonanceCount: graph.resonanceCount,
      crossLinkCount: graph.resonanceCount,
      crossLinks: graph.resonanceCount,
      totalEdges: graph.totalEdges,
      selectedId: selectedId,
      running: running,
      dimmedCount: getDimmedNodeCount(),
      categoryFilter: activeCategoryFilter,
      mounted: Boolean(canvas),
      activeWindow: activeWindow
    };
  }

  function getSelectedPreview() {
    return previewSite ? {
      id: previewSite.id,
      name: previewSite.name || previewSite.title || previewSite.id,
      url: previewSite.url || ""
    } : null;
  }

  function getNodePosition(nodeId) {
    const node = graph.byId.get(nodeId) || graph.byId.get("hub:" + nodeId);
    if (!node) return null;
    return {
      id: node.id,
      kind: node.kind,
      x: node.x,
      y: node.y,
      radius: node.radius
    };
  }

  function getGraphStats() {
    return getStats();
  }

  function buildMarkup() {
    const categories = getCategories();
    const filters = categories.map(function (category) {
      return '<button type="button" class="star-filter-btn" data-star-filter="' +
        escapeHtml(category.id) + '">' + escapeHtml(category.code || category.name) + '</button>';
    }).join("");
    return [
      '<div class="star-map-shell">',
      '<header class="star-map-header">',
      '<div class="star-map-heading">',
      '<span class="star-map-kicker">C6 · KNOWLEDGE GRAPH · CELESTIAL ATLAS</span>',
      '<h2 class="star-map-title">穹顶星图</h2>',
      '<p class="star-map-subtitle">分类为恒星，馆藏为行星。共享核心标签的知识轨道，以黄金与朱砂细虚线相交。</p>',
      '</div>',
      '<div class="star-map-actions">',
      '<span class="star-map-legend" data-star-legend>恒星分类: -- · 入轨藏品: -- · 共振星链: --</span>',
      '<button type="button" class="star-map-reset" id="btn-star-map-reset">⌖ 归位重置</button>',
      '</div>',
      '</header>',
      '<div class="star-map-filter-row" role="group" aria-label="星图分类筛选">',
      '<button type="button" class="star-filter-btn is-active" data-star-filter="all">★ 全图</button>',
      filters,
      '<span class="star-map-drag-hint">拖拽星体 · 双击调阅 · G 返回目录</span>',
      '</div>',
      '<div class="star-map-canvas-wrap">',
      '<canvas class="star-map-canvas" aria-label="穹顶知识关系星图"></canvas>',
      '<div class="star-map-legend-rail" data-star-legend-detail>',
      '<span class="star-legend-item"><i class="star-legend-line star-legend-line--hub"></i>主星从属轨</span>',
      '<span class="star-legend-item"><i class="star-legend-line star-legend-line--resonance"></i>跨域共振链</span>',
      '<span class="star-legend-item"><i class="star-legend-line star-legend-line--constellation"></i>预设星群</span>',
      '</div>',
      '<aside class="star-map-preview" data-star-preview aria-live="polite"></aside>',
      '<div class="star-map-coordinate" aria-hidden="true">RA · 18h 36m / DEC · +38°47′</div>',
      '</div>',
      '</div>'
    ].join("");
  }

  function updateLegend() {
    const legend = host && host.querySelector("[data-star-legend]");
    if (!legend) return;
    legend.textContent = "恒星分类: " + graph.hubs.length +
      " · 入轨藏品: " + graph.siteCount +
      " · 共振星链: " + graph.resonanceCount;
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    host.addEventListener("pointermove", function (event) {
      if (!canvas) return;
      pointerInside = true;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (drag && drag.node) {
        drag.x = x;
        drag.y = y;
        needsRender = true;
        return;
      }
      const hit = hitTest(x, y);
      const nextHovered = hit ? hit.id : "";
      if (nextHovered !== hoveredId) {
        hoveredId = nextHovered;
        if (hit && hit.kind === "planet") {
          previewSite = hit.site;
          renderPreview();
          const preview = host.querySelector("[data-star-preview]");
          if (preview) preview.classList.add("is-populated");
        } else if (hit && hit.kind === "hub") {
          const firstPlanet = graph.planets.find(function (planet) {
            return planet.categoryId === hit.categoryId;
          });
          previewSite = firstPlanet ? firstPlanet.site : null;
          renderPreview();
          const preview = host.querySelector("[data-star-preview]");
          if (preview) preview.classList.toggle("is-populated", Boolean(previewSite));
        } else if (!selectedId) {
          previewSite = null;
          renderPreview();
          const preview = host.querySelector("[data-star-preview]");
          if (preview) preview.classList.remove("is-populated");
        }
        canvas.style.cursor = hit ? "pointer" : "default";
        needsRender = true;
      }
    });
    host.addEventListener("pointerleave", function () {
      pointerInside = false;
      if (drag) return;
      hoveredId = "";
      if (!selectedId) {
        previewSite = null;
        renderPreview();
        const preview = host.querySelector("[data-star-preview]");
        if (preview) preview.classList.remove("is-populated");
      }
      needsRender = true;
    });
    canvas.addEventListener("pointerdown", function (event) {
      const hit = hitTest(event.offsetX, event.offsetY);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      drag = {
        node: hit,
        x: event.offsetX,
        y: event.offsetY,
        moved: false,
        startedAt: nowMs()
      };
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!drag || !drag.node) return;
      drag.moved = drag.moved || Math.hypot(event.offsetX - drag.x, event.offsetY - drag.y) > 2;
      drag.x = event.offsetX;
      drag.y = event.offsetY;
    });
    canvas.addEventListener("pointerup", function (event) {
      if (!drag || !drag.node) return;
      const node = drag.node;
      const moved = drag.moved;
      drag = null;
      canvas.releasePointerCapture && canvas.releasePointerCapture(event.pointerId);
      if (!moved) selectNode(node.id);
      needsRender = true;
    });
    canvas.addEventListener("dblclick", function (event) {
      const hit = hitTest(event.offsetX, event.offsetY);
      if (!hit) return;
      event.preventDefault();
      if (hit.kind === "planet") openNode(hit);
      else {
        const firstPlanet = graph.planets.find(function (planet) {
          return planet.categoryId === hit.categoryId;
        });
        if (firstPlanet) openNode(firstPlanet);
      }
    });
    host.addEventListener("click", function (event) {
      const reset = event.target.closest("#btn-star-map-reset");
      if (reset) {
        selectedId = "";
        hoveredId = "";
        previewSite = null;
        activeCategoryFilter = "all";
        buildLayout(true);
        setFilter("all");
        renderPreview();
        needsRender = true;
        return;
      }
      const filter = event.target.closest("[data-star-filter]");
      if (filter) {
        setFilter(filter.getAttribute("data-star-filter"));
        return;
      }
      const visit = event.target.closest("[data-star-visit]");
      if (visit) {
        const siteId = visit.getAttribute("data-star-visit");
        const site = getSites().find(function (item) { return item.id === siteId; });
        if (site) openNode(site);
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stop();
      } else if (openRequested && host && !host.hidden) {
        start();
      }
    });
    if (typeof MutationObserver !== "undefined") {
      const themeObserver = new MutationObserver(function () {
        if (running) draw(nowMs());
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-sanctum", "data-almanac-window"]
      });
    }
  }

  function hitTest(x, y) {
    const candidates = graph.planets.concat(graph.hubs);
    let best = null;
    let bestDistance = Infinity;
    candidates.forEach(function (node) {
      const distance = Math.hypot(node.x - x, node.y - y);
      const radius = Math.max(9, node.radius + (node.kind === "hub" ? 16 : 8));
      if (distance <= radius && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    });
    return best;
  }

  function openNode(nodeOrSite) {
    const site = nodeOrSite && nodeOrSite.kind === "planet" ? nodeOrSite.site : nodeOrSite;
    if (!site) return false;
    if (window.NavApp && typeof window.NavApp.openSite === "function") {
      return window.NavApp.openSite(site.id);
    }
    return false;
  }

  function buildLayout(reset) {
    graph = buildGraph();
    layoutTargets();
    const centerX = cssWidth * 0.5;
    const centerY = cssHeight * 0.5;
    graph.hubs.forEach(function (hub, index) {
      hub.x = centerX + Math.cos(hub.angle) * 20;
      hub.y = centerY + Math.sin(hub.angle) * 20;
      if (!reset) {
        hub.vx = 0;
        hub.vy = 0;
      }
    });
    graph.planets.forEach(function (planet, index) {
      const hub = graph.byId.get(planet.hubId);
      planet.x = (hub ? hub.x : centerX) + Math.cos(planet.angle) * 8;
      planet.y = (hub ? hub.y : centerY) + Math.sin(planet.angle) * 8;
      planet.vx = 0;
      planet.vy = 0;
    });
    updateLegend();
    renderPreview();
  }

  function mount(hostElement) {
    host = hostElement;
    host.innerHTML = buildMarkup();
    container = host.querySelector(".star-map-canvas-wrap");
    canvas = host.querySelector(".star-map-canvas");
    ctx = canvas.getContext("2d");
    buildLayout(true);
    setCanvasSize();
    bindEvents();
    if (resizeObserver && host) resizeObserver.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(function () {
        setCanvasSize();
        needsRender = true;
      });
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", setCanvasSize);
    }
  }

  function open(hostElement) {
    if (!hostElement) return false;
    // Opening the same view (switching category, changing theme, re-entering
    // the tab) must recreate the layout without leaking a second canvas
    // event graph. The render loop is stopped before remounting.
    stop();
    mount(hostElement);
    host.hidden = false;
    openRequested = true;
    start();
    return true;
  }

  function close() {
    openRequested = false;
    stop();
    if (host) host.hidden = true;
    return true;
  }

  function refresh() {
    if (!host || host.hidden) return;
    buildLayout(false);
    applyTimeWindow(activeWindow);
    needsRender = true;
  }

  function isRunning() {
    return running;
  }

  function resetView() {
    selectedId = "";
    hoveredId = "";
    previewSite = null;
    activeCategoryFilter = "all";
    buildLayout(true);
    setFilter("all");
    renderPreview();
    needsRender = true;
    return true;
  }

  return {
    open,
    close,
    refresh,
    start,
    stop,
    isRunning,
    getStats,
    getGraphStats,
    getSelectedPreview,
    getNodePosition,
    selectNode,
    getDimmedNodeCount,
    clearSelection,
    applyTimeWindow,
    resetView,
    get activeWindow() { return activeWindow; }
  };
});
